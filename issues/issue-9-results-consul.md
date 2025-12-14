# Issue 9: Results & Consul UI

> **Wave 3** - Depends on Issues 7, 8
> **Parallel with**: None (needs verdict first)

## Overview

Build the results view showing verdict, judge evaluations, and the interactive Consul dialogue for the decree phase. This is where users decide what to do with the battle results.

## The Consul's Role

From the spec:
> After judges deliver the verdict, you don't just see results - you enter a **dialogue** to decide what to do with them.

The Consul has access to:
- The original challenge
- All gladiator responses
- All judge evaluations
- The verdict
- The repo (if applicable)

## Tasks

### 1. Results View Component

Create `src/components/trials/results-view.tsx`:
```typescript
"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown } from "lucide-react"
import { ConsulDialog } from "./consul-dialog"

interface ResultsViewProps {
  trial: {
    id: string
    challengePrompt: string
    status: string
  }
  gladiators: Array<{
    id: string
    name: string
    responseContent: string | null
    branchName?: string | null
  }>
  judges: Array<{
    id: string
    name: string
    focus: string
    evaluation: {
      evaluations: Array<{
        gladiatorId: string
        score: number
        strengths: string[]
        weaknesses: string[]
        reasoning: string
      }>
      summary: string
    } | null
  }>
  verdict: {
    summary: string
    reasoning: string
    winnerGladiatorId: string | null
  }
}

export function ResultsView({ trial, gladiators, judges, verdict }: ResultsViewProps) {
  const [showConsul, setShowConsul] = useState(false)
  const winner = gladiators.find(g => g.id === verdict.winnerGladiatorId)

  return (
    <div className="space-y-6">
      {/* Verdict Card */}
      <Card className="border-yellow-500/50 bg-yellow-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            ⚔️ Verdict
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {winner && (
            <div className="flex items-center gap-2">
              <span className="text-lg">Winner:</span>
              <Badge className="bg-yellow-500 text-lg px-3 py-1">
                ⭐ {winner.name}
              </Badge>
            </div>
          )}
          <p className="text-lg">{verdict.summary}</p>
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ChevronDown className="h-4 w-4" />
              View full reasoning
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 text-sm">
              <pre className="whitespace-pre-wrap">{verdict.reasoning}</pre>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* Gladiator Responses */}
      <div>
        <h2 className="text-lg font-bold mb-4">Gladiator Responses</h2>
        <div className="space-y-3">
          {gladiators.map((g) => (
            <GladiatorResultCard
              key={g.id}
              gladiator={g}
              isWinner={g.id === verdict.winnerGladiatorId}
              judgeEvaluations={judges
                .map(j => j.evaluation?.evaluations.find(e => e.gladiatorId === g.id))
                .filter(Boolean)}
            />
          ))}
        </div>
      </div>

      {/* Judge Evaluations */}
      <div>
        <h2 className="text-lg font-bold mb-4">Judge Evaluations</h2>
        <div className="space-y-3">
          {judges.map((j) => (
            <JudgeEvaluationCard key={j.id} judge={j} gladiators={gladiators} />
          ))}
        </div>
      </div>

      {/* Decree Actions */}
      <Card>
        <CardHeader>
          <CardTitle>👑 Your Decree</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Discuss the results with the Consul to decide your next steps.
          </p>
          <div className="flex gap-3">
            <Button onClick={() => setShowConsul(true)} size="lg">
              💬 Consult the Consul
            </Button>
            <Button variant="outline">
              📄 Export Report
            </Button>
            <Button variant="outline">
              🔄 New Trial
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Consul Dialog */}
      <ConsulDialog
        open={showConsul}
        onOpenChange={setShowConsul}
        trial={trial}
        gladiators={gladiators}
        verdict={verdict}
      />
    </div>
  )
}

function GladiatorResultCard({
  gladiator,
  isWinner,
  judgeEvaluations,
}: {
  gladiator: { id: string; name: string; responseContent: string | null; branchName?: string | null }
  isWinner: boolean
  judgeEvaluations: Array<{ score: number; strengths: string[]; weaknesses: string[] }>
}) {
  const avgScore = judgeEvaluations.length > 0
    ? judgeEvaluations.reduce((sum, e) => sum + e.score, 0) / judgeEvaluations.length
    : null

  return (
    <Collapsible>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-accent/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{gladiator.name}</CardTitle>
                {isWinner && <Badge className="bg-yellow-500">⭐ Winner</Badge>}
              </div>
              <div className="flex items-center gap-3">
                {avgScore !== null && (
                  <span className="text-sm text-muted-foreground">
                    Avg: {avgScore.toFixed(0)}/100
                  </span>
                )}
                {gladiator.branchName && (
                  <Badge variant="outline">📁 {gladiator.branchName}</Badge>
                )}
                <ChevronDown className="h-4 w-4" />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm max-h-96 overflow-auto">
              {gladiator.responseContent || "(no response)"}
            </pre>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

function JudgeEvaluationCard({
  judge,
  gladiators,
}: {
  judge: {
    id: string
    name: string
    focus: string
    evaluation: {
      evaluations: Array<{
        gladiatorId: string
        score: number
        strengths: string[]
        weaknesses: string[]
        reasoning: string
      }>
      summary: string
    } | null
  }
  gladiators: Array<{ id: string; name: string }>
}) {
  if (!judge.evaluation) return null

  return (
    <Collapsible>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-accent/50">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">{judge.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{judge.focus}</p>
              </div>
              <ChevronDown className="h-4 w-4" />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <p className="text-sm">{judge.evaluation.summary}</p>
            <div className="space-y-3">
              {judge.evaluation.evaluations.map((evaluation) => {
                const gladiator = gladiators.find(g => g.id === evaluation.gladiatorId)
                return (
                  <div key={evaluation.gladiatorId} className="border rounded p-3 space-y-2">
                    <div className="flex justify-between">
                      <span className="font-medium">{gladiator?.name}</span>
                      <Badge variant="outline">{evaluation.score}/100</Badge>
                    </div>
                    <div className="text-sm space-y-1">
                      <p className="text-green-500">
                        + {evaluation.strengths.join(", ")}
                      </p>
                      <p className="text-red-500">
                        - {evaluation.weaknesses.join(", ")}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
```

### 2. Consul Dialog Component

Create `src/components/trials/consul-dialog.tsx`:
```typescript
"use client"

import { useState, useRef, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Message {
  role: "user" | "consul"
  content: string
}

interface ConsulDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trial: { id: string; challengePrompt: string }
  gladiators: Array<{ id: string; name: string; responseContent: string | null }>
  verdict: { summary: string; winnerGladiatorId: string | null }
}

export function ConsulDialog({
  open,
  onOpenChange,
  trial,
  gladiators,
  verdict,
}: ConsulDialogProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Initial Consul greeting
  useEffect(() => {
    if (open && messages.length === 0) {
      const winner = gladiators.find(g => g.id === verdict.winnerGladiatorId)
      setMessages([
        {
          role: "consul",
          content: `The verdict is in: ${winner?.name || "No clear winner"} emerged victorious.\n\n"${verdict.summary}"\n\nHow would you like to proceed? I can help you:\n- Merge the winning approach\n- Synthesize multiple gladiators' ideas\n- Simplify or modify a solution\n- Run a new trial with different parameters\n\nWhat's your decree?`,
        },
      ])
    }
  }, [open, messages.length, gladiators, verdict])

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function handleSend() {
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput("")
    setMessages((prev) => [...prev, { role: "user", content: userMessage }])
    setLoading(true)

    try {
      const res = await fetch(`/api/trials/${trial.id}/consul`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          history: messages,
        }),
      })

      if (!res.ok) throw new Error("Consul request failed")

      // Stream response
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let consulResponse = ""

      setMessages((prev) => [...prev, { role: "consul", content: "" }])

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        consulResponse += chunk

        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: "consul", content: consulResponse }
          return updated
        })
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "consul", content: "I apologize, I encountered an error. Please try again." },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>💬 The Consul</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg ${
                  msg.role === "consul"
                    ? "bg-muted"
                    : "bg-primary text-primary-foreground ml-8"
                }`}
              >
                <p className="text-xs font-medium mb-1 opacity-70">
                  {msg.role === "consul" ? "Consul" : "You"}
                </p>
                <pre className="whitespace-pre-wrap text-sm">{msg.content}</pre>
              </div>
            ))}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        <div className="flex gap-2 mt-4">
          <Textarea
            placeholder="What's your decree?"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            rows={2}
            disabled={loading}
          />
          <Button onClick={handleSend} disabled={loading || !input.trim()}>
            {loading ? "..." : "Send"}
          </Button>
        </div>

        <div className="flex gap-2 mt-2">
          <Button variant="outline" size="sm" onClick={() => setInput("Merge the winner's solution")}>
            Merge Winner
          </Button>
          <Button variant="outline" size="sm" onClick={() => setInput("Synthesize the best ideas from all gladiators")}>
            Synthesize
          </Button>
          <Button variant="outline" size="sm" onClick={() => setInput("Simplify the winning approach")}>
            Simplify
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

### 3. Consul API Endpoint

Create `src/app/api/trials/[id]/consul/route.ts`:
```typescript
import { NextRequest } from "next/server"
import { requireUser } from "@/lib/session"
import { db } from "@/db"
import { trials, gladiators, judges, verdicts, decrees } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { decrypt } from "@/lib/encryption"
import { runAgent } from "@/lib/claude"
import { buildConsulSystemPrompt, buildConsulContext } from "@/lib/trial/consul/prompts"

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireUser()

  if (!user.claudeOauthToken) {
    return new Response("Claude token required", { status: 400 })
  }

  const trial = await db.query.trials.findFirst({
    where: and(eq(trials.id, params.id), eq(trials.userId, user.id)),
  })

  if (!trial) {
    return new Response("Trial not found", { status: 404 })
  }

  const { message, history } = await req.json()

  // Fetch all trial data
  const [trialGladiators, trialJudges, trialVerdict] = await Promise.all([
    db.query.gladiators.findMany({ where: eq(gladiators.trialId, trial.id) }),
    db.query.judges.findMany({ where: eq(judges.trialId, trial.id) }),
    db.query.verdicts.findFirst({ where: eq(verdicts.trialId, trial.id) }),
  ])

  const claudeToken = decrypt(user.claudeOauthToken)

  // Build conversation context
  const context = buildConsulContext(trial, trialGladiators, trialJudges, trialVerdict)
  const systemPrompt = buildConsulSystemPrompt(context)

  // Build full prompt with history
  const conversationHistory = history
    .map((msg: { role: string; content: string }) =>
      `${msg.role === "user" ? "Editor" : "Consul"}: ${msg.content}`
    )
    .join("\n\n")

  const fullPrompt = conversationHistory
    ? `${conversationHistory}\n\nEditor: ${message}`
    : message

  // Stream response
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runAgent(
          fullPrompt,
          {
            systemPrompt,
            model: "sonnet",
            maxTurns: 1,
            disallowedTools: ["Bash", "Edit", "Write"], // Read-only for now
          },
          claudeToken
        )) {
          if (event.type === "text") {
            controller.enqueue(new TextEncoder().encode(event.content))
          }
        }
      } catch (error) {
        controller.enqueue(
          new TextEncoder().encode("\n\n[Error communicating with Consul]")
        )
      } finally {
        controller.close()
      }
    },
  })

  // Store conversation in decree (append)
  const existingDecree = await db.query.decrees.findFirst({
    where: eq(decrees.trialId, trial.id),
  })

  const updatedConversation = [
    ...((existingDecree?.consulConversation as any[]) || []),
    { role: "user", content: message, timestamp: new Date().toISOString() },
  ]

  if (existingDecree) {
    await db.update(decrees)
      .set({ consulConversation: updatedConversation })
      .where(eq(decrees.id, existingDecree.id))
  } else {
    await db.insert(decrees).values({
      trialId: trial.id,
      actionType: "custom",
      consulConversation: updatedConversation,
    })
  }

  return new Response(stream, {
    headers: { "Content-Type": "text/plain" },
  })
}
```

### 4. Consul Prompts

Create `src/lib/trial/consul/prompts.ts`:
```typescript
export function buildConsulSystemPrompt(context: string): string {
  return `You are the Consul - the post-verdict advisor in the Thunderdome.

## Your Role
You help the Editor (user) decide what to do with the trial results. You have access to:
- The original challenge
- All gladiator responses
- All judge evaluations
- The verdict

## Your Capabilities
- Explain and compare gladiator approaches
- Suggest how to synthesize multiple ideas
- Recommend simplifications
- Help decide next steps
- For code battles: help with merge decisions

## Your Tone
- Wise but practical
- Concise but thorough when needed
- Respectful of the Editor's authority
- Proactive in suggesting options

## Context
${context}

## Guidelines
- Reference specific gladiators by name
- Quote relevant parts of their responses
- Be specific about trade-offs
- If suggesting code changes, be precise
- The Editor's word is final - support their decision`
}

export function buildConsulContext(
  trial: { challengePrompt: string },
  gladiators: Array<{ name: string; responseContent: string | null }>,
  judges: Array<{ name: string; focus: string; evaluation: unknown }>,
  verdict: { summary: string; reasoning: string; winnerGladiatorId: string | null } | null
): string {
  const gladiatorSummaries = gladiators
    .map((g) => `**${g.name}**: ${(g.responseContent || "").slice(0, 500)}...`)
    .join("\n\n")

  const judgeSummaries = judges
    .map((j) => {
      const eval_ = j.evaluation as { summary?: string } | null
      return `**${j.name}** (${j.focus}): ${eval_?.summary || "No evaluation"}`
    })
    .join("\n\n")

  return `## Challenge
${trial.challengePrompt}

## Gladiator Responses
${gladiatorSummaries}

## Judge Evaluations
${judgeSummaries}

## Verdict
${verdict?.summary || "No verdict yet"}

${verdict?.reasoning || ""}`
}
```

### 5. Export Report Endpoint

Create `src/app/api/trials/[id]/export/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/session"
import { db } from "@/db"
import { trials, gladiators, judges, verdicts } from "@/db/schema"
import { eq, and } from "drizzle-orm"

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

  const [trialGladiators, trialJudges, trialVerdict] = await Promise.all([
    db.query.gladiators.findMany({ where: eq(gladiators.trialId, trial.id) }),
    db.query.judges.findMany({ where: eq(judges.trialId, trial.id) }),
    db.query.verdicts.findFirst({ where: eq(verdicts.trialId, trial.id) }),
  ])

  // Generate markdown report
  const report = generateMarkdownReport(trial, trialGladiators, trialJudges, trialVerdict)

  return new Response(report, {
    headers: {
      "Content-Type": "text/markdown",
      "Content-Disposition": `attachment; filename="thunderdome-trial-${trial.id}.md"`,
    },
  })
}

function generateMarkdownReport(
  trial: any,
  gladiators: any[],
  judges: any[],
  verdict: any
): string {
  return `# ⚡ Thunderdome Trial Report

## Challenge
${trial.challengePrompt}

## Verdict
${verdict?.summary || "No verdict"}

${verdict?.reasoning || ""}

---

## Gladiator Responses

${gladiators.map((g) => `### ${g.name}
${g.responseContent || "(no response)"}
`).join("\n---\n\n")}

---

## Judge Evaluations

${judges.map((j) => {
  const eval_ = j.evaluation as any
  return `### ${j.name} (${j.focus})
${eval_?.summary || "No evaluation"}
`
}).join("\n")}

---

*Generated by Thunderdome on ${new Date().toISOString()}*
`
}
```

## File Structure

```
src/
├── app/api/trials/[id]/
│   ├── consul/route.ts
│   └── export/route.ts
├── components/trials/
│   ├── results-view.tsx
│   └── consul-dialog.tsx
└── lib/trial/consul/
    └── prompts.ts
```

## Acceptance Criteria

- [ ] Results view shows verdict summary
- [ ] Gladiator responses expandable
- [ ] Judge evaluations expandable with scores
- [ ] Winner clearly highlighted
- [ ] Consul dialog opens
- [ ] Consul streams responses
- [ ] Conversation persisted in decree
- [ ] Quick action buttons work
- [ ] Export generates markdown report

---

## Dependencies

**Depends on**: Issue 7 (verdict), Issue 8 (battle view)
**Blocks**: None (end of MVP flow)
