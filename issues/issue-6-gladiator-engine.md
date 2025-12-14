# Issue 6: Gladiator Execution Engine

> **Wave 2** - Depends on Issues 1, 3, 5
> **Parallel with**: Issue 8 (after Lanista is done)

## Overview

Implement the engine that runs gladiators in parallel, streams their output to the database and SSE, and handles completion/failure states.

## Gladiator Execution Flow

```
Lanista designs gladiators
         ↓
   Create DB records
         ↓
   Spawn N gladiators in parallel
         ↓
   Each gladiator:
     - Receives challenge + persona
     - Works on the problem
     - Streams progress to DB + SSE
     - Produces final response
         ↓
   Wait for all gladiators to complete
         ↓
   Transition to arbiter_designing
```

## Tasks

### 1. Gladiator Runner

Create `src/lib/trial/gladiators/index.ts`:
```typescript
import { db } from "@/db"
import { gladiators, trials } from "@/db/schema"
import { eq } from "drizzle-orm"
import { runAgentsParallel, type ParallelAgent } from "@/lib/claude"
import { transitionTrialState } from "@/lib/trial/state"
import { broadcastTrialUpdate, broadcastGladiatorUpdate } from "@/lib/trial/broadcast"
import { buildGladiatorPrompt } from "./prompts"

interface GladiatorRecord {
  id: string
  name: string
  persona: string
  model: string
  temperature: number
  tools: unknown
}

export async function runGladiators(
  trialId: string,
  gladiatorRecords: GladiatorRecord[],
  challengePrompt: string,
  claudeToken: string
): Promise<void> {
  // Build parallel agent configs
  const agents: ParallelAgent[] = gladiatorRecords.map((g) => ({
    id: g.id,
    prompt: buildGladiatorPrompt(challengePrompt, g.name),
    config: {
      systemPrompt: g.persona,
      model: g.model as "opus" | "sonnet",
      maxTurns: 15,
      allowedTools: g.tools as string[],
    },
  }))

  // Mark all gladiators as fighting
  await Promise.all(
    gladiatorRecords.map((g) =>
      db.update(gladiators)
        .set({ status: "fighting" })
        .where(eq(gladiators.id, g.id))
    )
  )

  // Broadcast battle start
  await broadcastTrialUpdate(trialId, {
    type: "battle_start",
    gladiatorCount: gladiatorRecords.length,
    gladiators: gladiatorRecords.map(g => ({ id: g.id, name: g.name })),
  })

  // Track stream logs per gladiator
  const streamLogs = new Map<string, Array<{ type: string; content: string; timestamp: number }>>()
  gladiatorRecords.forEach(g => streamLogs.set(g.id, []))

  try {
    // Run all gladiators in parallel
    const generator = runAgentsParallel(agents, claudeToken)
    let results: Map<string, unknown> | undefined

    for await (const event of generator) {
      // Store event in stream log
      const log = streamLogs.get(event.agentId)!
      log.push({
        type: event.type,
        content: event.content,
        timestamp: event.timestamp,
      })

      // Broadcast to SSE
      await broadcastGladiatorUpdate(trialId, event.agentId, {
        type: "gladiator_event",
        gladiatorId: event.agentId,
        event,
      })

      // Periodic DB update (every 10 events)
      if (log.length % 10 === 0) {
        await db.update(gladiators)
          .set({ streamLog: log })
          .where(eq(gladiators.id, event.agentId))
      }
    }

    // Get final results from generator return value
    // (This requires modifying runAgentsParallel to return results)
    results = (generator as any).value

    // Process final results
    for (const [gladiatorId, result] of results?.entries() || []) {
      const agentResult = result as {
        success: boolean
        content: string
        events: unknown[]
        cost: number
        error?: string
      }

      const finalLog = streamLogs.get(gladiatorId) || []

      await db.update(gladiators)
        .set({
          status: agentResult.success ? "complete" : "failed",
          responseContent: agentResult.content,
          streamLog: finalLog,
        })
        .where(eq(gladiators.id, gladiatorId))

      await broadcastGladiatorUpdate(trialId, gladiatorId, {
        type: "gladiator_complete",
        gladiatorId,
        success: agentResult.success,
        cost: agentResult.cost,
      })
    }

    // Check if all gladiators completed
    const updatedGladiators = await db.query.gladiators.findMany({
      where: eq(gladiators.trialId, trialId),
    })

    const allComplete = updatedGladiators.every(
      g => g.status === "complete" || g.status === "failed"
    )
    const anySucceeded = updatedGladiators.some(g => g.status === "complete")

    if (allComplete) {
      if (anySucceeded) {
        // Proceed to Arbiter
        await broadcastTrialUpdate(trialId, {
          type: "battle_complete",
          successCount: updatedGladiators.filter(g => g.status === "complete").length,
          failedCount: updatedGladiators.filter(g => g.status === "failed").length,
        })

        await transitionTrialState(trialId, "arbiter_designing")

        // Import and run arbiter (dynamic to avoid circular deps)
        const { runArbiter } = await import("../arbiter")
        await runArbiter(trialId, claudeToken)
      } else {
        // All gladiators failed
        await broadcastTrialUpdate(trialId, {
          type: "error",
          phase: "battle",
          message: "All gladiators failed",
        })
      }
    }

  } catch (error) {
    console.error("Gladiator execution error:", error)

    await broadcastTrialUpdate(trialId, {
      type: "error",
      phase: "battle",
      message: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
```

### 2. Gladiator Prompts

Create `src/lib/trial/gladiators/prompts.ts`:
```typescript
export function buildGladiatorPrompt(challenge: string, gladiatorName: string): string {
  return `# Your Challenge

${challenge}

---

## Instructions

You are "${gladiatorName}" - a gladiator in the Thunderdome.

Your task is to tackle this challenge from your unique perspective. Other gladiators are working on the same challenge with different approaches - your job is to provide your best answer based on your specific expertise and viewpoint.

Be thorough but focused. Explain your reasoning. If you find issues, explain their severity. If you propose solutions, explain trade-offs.

At the end, provide a clear summary of your findings or proposal.`
}

export function buildCodeBattlePrompt(
  challenge: string,
  gladiatorName: string,
  repoContext: string
): string {
  return `# Your Challenge

${challenge}

---

## Repository Context

${repoContext}

---

## Instructions

You are "${gladiatorName}" - a gladiator in the Thunderdome Code Battle.

You have full access to the repository in your working directory. You can:
- Read and analyze code
- Make edits to implement your solution
- Run tests and builds
- Create new files if needed

Other gladiators are working on the same challenge in separate branches. Your job is to provide the best implementation based on your specific expertise.

**IMPORTANT**: When you're done, create a file at \`.thunderdome/FINDINGS.md\` summarizing:
1. What you found/built
2. Your reasoning
3. Any trade-offs or concerns
4. How to test/verify your changes

Be thorough. Make your case. Let your code speak.`
}
```

### 3. Enhanced Broadcasting

Update `src/lib/trial/broadcast.ts`:
```typescript
// Add gladiator-specific broadcasting

const gladiatorSubscribers = new Map<string, Map<string, Set<SSEController>>>()

export function subscribeToGladiator(
  trialId: string,
  gladiatorId: string,
  controller: SSEController
) {
  if (!gladiatorSubscribers.has(trialId)) {
    gladiatorSubscribers.set(trialId, new Map())
  }
  const trialSubs = gladiatorSubscribers.get(trialId)!

  if (!trialSubs.has(gladiatorId)) {
    trialSubs.set(gladiatorId, new Set())
  }
  trialSubs.get(gladiatorId)!.add(controller)

  return () => {
    trialSubs.get(gladiatorId)?.delete(controller)
  }
}

export async function broadcastGladiatorUpdate(
  trialId: string,
  gladiatorId: string,
  data: unknown
) {
  // Broadcast to gladiator-specific subscribers
  const trialSubs = gladiatorSubscribers.get(trialId)
  const gladiatorSubs = trialSubs?.get(gladiatorId)

  if (gladiatorSubs) {
    const message = `data: ${JSON.stringify(data)}\n\n`
    const encoded = new TextEncoder().encode(message)

    for (const controller of gladiatorSubs) {
      try {
        controller.enqueue(encoded)
      } catch {
        gladiatorSubs.delete(controller)
      }
    }
  }

  // Also broadcast to trial-level subscribers
  await broadcastTrialUpdate(trialId, data)
}
```

### 4. Gladiator Stream Hook

Create `src/hooks/use-gladiator-stream.ts`:
```typescript
"use client"

import { useEffect, useState, useRef } from "react"

interface GladiatorEvent {
  type: "text" | "tool_use" | "tool_result" | "complete" | "error"
  content: string
  timestamp: number
}

export function useGladiatorStream(trialId: string | null, gladiatorId: string | null) {
  const [events, setEvents] = useState<GladiatorEvent[]>([])
  const [status, setStatus] = useState<"idle" | "fighting" | "complete" | "failed">("idle")
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!trialId || !gladiatorId) return

    const eventSource = new EventSource(
      `/api/trials/${trialId}/gladiators/${gladiatorId}/stream`
    )
    eventSourceRef.current = eventSource

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)

        if (data.type === "gladiator_event") {
          setEvents((prev) => [...prev, data.event])
          setStatus("fighting")
        } else if (data.type === "gladiator_complete") {
          setStatus(data.success ? "complete" : "failed")
        } else if (data.type === "replay") {
          // Replaying stored events
          setEvents(data.events || [])
          setStatus(data.status || "idle")
        }
      } catch {
        console.error("Failed to parse gladiator event")
      }
    }

    return () => {
      eventSource.close()
    }
  }, [trialId, gladiatorId])

  // Compute current output text from events
  const outputText = events
    .filter(e => e.type === "text")
    .map(e => e.content)
    .join("")

  return { events, status, outputText }
}
```

### 5. Timeout Handling

Create `src/lib/trial/gladiators/timeout.ts`:
```typescript
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  timeoutMessage: string = "Operation timed out"
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
    ),
  ])
}

export async function* withStreamTimeout<T, R>(
  generator: AsyncGenerator<T, R>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): AsyncGenerator<T, R> {
  let lastActivity = Date.now()

  const checkTimeout = () => {
    if (Date.now() - lastActivity > timeoutMs) {
      throw new Error("Stream timeout - no activity for " + timeoutMs + "ms")
    }
  }

  const interval = setInterval(checkTimeout, 10000) // Check every 10s

  try {
    for await (const value of generator) {
      lastActivity = Date.now()
      yield value
    }
    return generator.return as unknown as R
  } finally {
    clearInterval(interval)
  }
}
```

## File Structure

```
src/lib/trial/gladiators/
├── index.ts          # Main gladiator runner
├── prompts.ts        # Prompt templates
├── timeout.ts        # Timeout handling
└── __tests__/
    └── gladiators.test.ts

src/hooks/
└── use-gladiator-stream.ts
```

## Acceptance Criteria

- [ ] Multiple gladiators run in parallel
- [ ] Each gladiator's stream is captured and stored
- [ ] Events broadcast to SSE in real-time
- [ ] Gladiator status updates in database
- [ ] Final response content stored
- [ ] Stream log stored for replay
- [ ] Handles gladiator failures gracefully
- [ ] Transitions to arbiter_designing when all complete
- [ ] Timeout handling prevents infinite runs

## Testing

```typescript
// Integration test
describe("Gladiator Execution", () => {
  it("runs gladiators in parallel", async () => {
    // Create test trial with gladiators
    // Run gladiators
    // Verify all complete
    // Verify stream logs stored
  })

  it("handles gladiator failure", async () => {
    // Create gladiator with bad config
    // Verify failure is recorded
    // Verify other gladiators still complete
  })

  it("times out stuck gladiators", async () => {
    // Create gladiator that would run forever
    // Verify timeout triggers
    // Verify failure recorded
  })
})
```

---

## Dependencies

**Depends on**: Issue 1 (schema), Issue 3 (SDK), Issue 5 (Lanista)
**Blocks**: Issue 7 (Arbiter needs gladiator outputs)
