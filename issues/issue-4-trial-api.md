# Issue 4: Trial Management API

> **Wave 2** - Depends on Issue 1 (schema)
> **Parallel with**: Issues 2, 3 (after schema is ready)

## Overview

Build the API layer for creating, managing, and streaming trial state. This includes CRUD operations, the trial state machine, and SSE streaming endpoints for real-time updates.

## Trial State Machine

```
pending → lanista_designing → battling → arbiter_designing → judging → decree → complete
                                    ↓
                                  failed
```

Each state transition should:
1. Update the database
2. Broadcast to SSE subscribers
3. Trigger the next phase

## Tasks

### 1. Trial CRUD API

Create `src/app/api/trials/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/session"
import { db } from "@/db"
import { trials } from "@/db/schema"
import { eq, desc } from "drizzle-orm"
import { z } from "zod"

const CreateTrialSchema = z.object({
  challengePrompt: z.string().min(10).max(10000),
  repoUrl: z.string().url().optional(),
  trialType: z.enum(["ideation", "repo_aware", "code_battle"]),
})

// GET /api/trials - List user's trials
export async function GET(req: NextRequest) {
  const user = await requireUser()

  const userTrials = await db.query.trials.findMany({
    where: eq(trials.userId, user.id),
    orderBy: desc(trials.createdAt),
    limit: 50,
  })

  return NextResponse.json(userTrials)
}

// POST /api/trials - Create new trial
export async function POST(req: NextRequest) {
  const user = await requireUser()

  // Check user has Claude token
  if (!user.claudeOauthToken) {
    return NextResponse.json(
      { error: "Claude OAuth token required. Go to Settings to configure." },
      { status: 400 }
    )
  }

  const body = await req.json()
  const parsed = CreateTrialSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const [trial] = await db.insert(trials).values({
    userId: user.id,
    challengePrompt: parsed.data.challengePrompt,
    repoUrl: parsed.data.repoUrl,
    trialType: parsed.data.trialType,
    status: "pending",
  }).returning()

  return NextResponse.json(trial, { status: 201 })
}
```

### 2. Single Trial API

Create `src/app/api/trials/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/session"
import { db } from "@/db"
import { trials, gladiators, judges, verdicts, decrees } from "@/db/schema"
import { eq, and } from "drizzle-orm"

// GET /api/trials/:id - Get trial with all related data
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireUser()

  const trial = await db.query.trials.findFirst({
    where: and(eq(trials.id, params.id), eq(trials.userId, user.id)),
  })

  if (!trial) {
    return NextResponse.json({ error: "Trial not found" }, { status: 404 })
  }

  // Fetch related data
  const [trialGladiators, trialJudges, trialVerdict, trialDecree] = await Promise.all([
    db.query.gladiators.findMany({ where: eq(gladiators.trialId, trial.id) }),
    db.query.judges.findMany({ where: eq(judges.trialId, trial.id) }),
    db.query.verdicts.findFirst({ where: eq(verdicts.trialId, trial.id) }),
    db.query.decrees.findFirst({ where: eq(decrees.trialId, trial.id) }),
  ])

  return NextResponse.json({
    ...trial,
    gladiators: trialGladiators,
    judges: trialJudges,
    verdict: trialVerdict,
    decree: trialDecree,
  })
}

// DELETE /api/trials/:id - Delete trial (only if pending)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireUser()

  const trial = await db.query.trials.findFirst({
    where: and(eq(trials.id, params.id), eq(trials.userId, user.id)),
  })

  if (!trial) {
    return NextResponse.json({ error: "Trial not found" }, { status: 404 })
  }

  if (trial.status !== "pending") {
    return NextResponse.json(
      { error: "Can only delete pending trials" },
      { status: 400 }
    )
  }

  await db.delete(trials).where(eq(trials.id, trial.id))

  return NextResponse.json({ success: true })
}
```

### 3. Trial State Management

Create `src/lib/trial/state.ts`:
```typescript
import { db } from "@/db"
import { trials } from "@/db/schema"
import { eq } from "drizzle-orm"
import { broadcastTrialUpdate } from "./broadcast"

export type TrialStatus =
  | "pending"
  | "lanista_designing"
  | "battling"
  | "arbiter_designing"
  | "judging"
  | "decree"
  | "complete"

const VALID_TRANSITIONS: Record<TrialStatus, TrialStatus[]> = {
  pending: ["lanista_designing"],
  lanista_designing: ["battling"],
  battling: ["arbiter_designing"],
  arbiter_designing: ["judging"],
  judging: ["decree"],
  decree: ["complete"],
  complete: [],
}

export async function transitionTrialState(
  trialId: string,
  newStatus: TrialStatus,
  additionalData?: Partial<typeof trials.$inferInsert>
) {
  const trial = await db.query.trials.findFirst({
    where: eq(trials.id, trialId),
  })

  if (!trial) {
    throw new Error("Trial not found")
  }

  const currentStatus = trial.status as TrialStatus
  const allowedTransitions = VALID_TRANSITIONS[currentStatus]

  if (!allowedTransitions.includes(newStatus)) {
    throw new Error(
      `Invalid transition: ${currentStatus} -> ${newStatus}`
    )
  }

  const [updated] = await db.update(trials)
    .set({
      status: newStatus,
      ...(newStatus === "complete" && { completedAt: new Date() }),
      ...additionalData,
    })
    .where(eq(trials.id, trialId))
    .returning()

  // Broadcast state change to all subscribers
  await broadcastTrialUpdate(trialId, {
    type: "state_change",
    status: newStatus,
    trial: updated,
  })

  return updated
}
```

### 4. SSE Broadcasting

Create `src/lib/trial/broadcast.ts`:
```typescript
// In-memory store of active SSE connections per trial
// In production, would use Redis pub/sub for multi-instance support

type SSEController = ReadableStreamDefaultController<Uint8Array>

const trialSubscribers = new Map<string, Set<SSEController>>()

export function subscribeToTrial(trialId: string, controller: SSEController) {
  if (!trialSubscribers.has(trialId)) {
    trialSubscribers.set(trialId, new Set())
  }
  trialSubscribers.get(trialId)!.add(controller)

  return () => {
    trialSubscribers.get(trialId)?.delete(controller)
    if (trialSubscribers.get(trialId)?.size === 0) {
      trialSubscribers.delete(trialId)
    }
  }
}

export async function broadcastTrialUpdate(trialId: string, data: unknown) {
  const subscribers = trialSubscribers.get(trialId)
  if (!subscribers || subscribers.size === 0) return

  const message = `data: ${JSON.stringify(data)}\n\n`
  const encoded = new TextEncoder().encode(message)

  for (const controller of subscribers) {
    try {
      controller.enqueue(encoded)
    } catch {
      // Controller closed, will be cleaned up on next subscription check
      subscribers.delete(controller)
    }
  }
}

export function getSubscriberCount(trialId: string): number {
  return trialSubscribers.get(trialId)?.size || 0
}
```

### 5. SSE Stream Endpoint

Create `src/app/api/trials/[id]/stream/route.ts`:
```typescript
import { NextRequest } from "next/server"
import { requireUser } from "@/lib/session"
import { db } from "@/db"
import { trials } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { subscribeToTrial } from "@/lib/trial/broadcast"

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireUser()

  // Verify user owns this trial
  const trial = await db.query.trials.findFirst({
    where: and(eq(trials.id, params.id), eq(trials.userId, user.id)),
  })

  if (!trial) {
    return new Response("Trial not found", { status: 404 })
  }

  const stream = new ReadableStream({
    start(controller) {
      // Send initial state
      const initialMessage = `data: ${JSON.stringify({
        type: "connected",
        trial,
      })}\n\n`
      controller.enqueue(new TextEncoder().encode(initialMessage))

      // Subscribe to updates
      const unsubscribe = subscribeToTrial(params.id, controller)

      // Cleanup on close
      req.signal.addEventListener("abort", () => {
        unsubscribe()
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}
```

### 6. Start Trial Endpoint

Create `src/app/api/trials/[id]/start/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/session"
import { db } from "@/db"
import { trials } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { decrypt } from "@/lib/encryption"
import { transitionTrialState } from "@/lib/trial/state"
import { runLanista } from "@/lib/trial/lanista"

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireUser()

  if (!user.claudeOauthToken) {
    return NextResponse.json(
      { error: "Claude OAuth token required" },
      { status: 400 }
    )
  }

  const trial = await db.query.trials.findFirst({
    where: and(eq(trials.id, params.id), eq(trials.userId, user.id)),
  })

  if (!trial) {
    return NextResponse.json({ error: "Trial not found" }, { status: 404 })
  }

  if (trial.status !== "pending") {
    return NextResponse.json(
      { error: "Trial already started" },
      { status: 400 }
    )
  }

  // Decrypt Claude token
  const claudeToken = decrypt(user.claudeOauthToken)

  // Transition to lanista_designing and kick off the battle
  await transitionTrialState(trial.id, "lanista_designing")

  // Run Lanista in background (don't await)
  runLanista(trial.id, trial.challengePrompt, claudeToken).catch(console.error)

  return NextResponse.json({ success: true, status: "lanista_designing" })
}
```

### 7. Client-Side Hooks

Create `src/hooks/use-trial-stream.ts`:
```typescript
"use client"

import { useEffect, useState, useCallback } from "react"

interface TrialStreamEvent {
  type: string
  [key: string]: unknown
}

export function useTrialStream(trialId: string | null) {
  const [events, setEvents] = useState<TrialStreamEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!trialId) return

    const eventSource = new EventSource(`/api/trials/${trialId}/stream`)

    eventSource.onopen = () => {
      setConnected(true)
      setError(null)
    }

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        setEvents((prev) => [...prev, data])
      } catch {
        console.error("Failed to parse SSE message:", e.data)
      }
    }

    eventSource.onerror = () => {
      setConnected(false)
      setError("Connection lost. Reconnecting...")
      // EventSource will auto-reconnect
    }

    return () => {
      eventSource.close()
    }
  }, [trialId])

  const clearEvents = useCallback(() => setEvents([]), [])

  return { events, connected, error, clearEvents }
}
```

## File Structure

```
src/
├── app/api/trials/
│   ├── route.ts                    # List, Create
│   └── [id]/
│       ├── route.ts                # Get, Delete
│       ├── start/route.ts          # Start trial
│       ├── stream/route.ts         # SSE stream
│       └── gladiators/
│           └── [gladiatorId]/
│               └── stream/route.ts # Gladiator stream
├── lib/trial/
│   ├── state.ts                    # State machine
│   └── broadcast.ts                # SSE broadcasting
└── hooks/
    └── use-trial-stream.ts         # Client hook
```

## Acceptance Criteria

- [ ] Can create a new trial via API
- [ ] Can list user's trials
- [ ] Can get single trial with all related data
- [ ] Can delete pending trials
- [ ] SSE connection established on trial page
- [ ] State changes broadcast to all connected clients
- [ ] Auto-reconnect on connection loss
- [ ] Invalid state transitions are rejected
- [ ] Only trial owner can access their trials

## Testing

```bash
# Create trial
curl -X POST http://localhost:3000/api/trials \
  -H "Content-Type: application/json" \
  -d '{"challengePrompt": "Design a queue system", "trialType": "ideation"}'

# Stream (in browser or with curl)
curl -N http://localhost:3000/api/trials/{id}/stream

# Start trial
curl -X POST http://localhost:3000/api/trials/{id}/start
```

---

## Dependencies

**Depends on**: Issue 1 (database schema)
**Blocks**: Issues 5, 6, 7, 8, 9 (need trial management for all features)
