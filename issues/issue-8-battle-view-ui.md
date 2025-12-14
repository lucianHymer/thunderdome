# Issue 8: Battle View UI

> **Wave 2** - Depends on Issue 1
> **Parallel with**: Issues 5, 6

## Overview

Build the main battle view UI - trial creation, live streaming gladiator output, tabbed views, and progress indicators. This is where users watch the action unfold.

## Pages & Components

### Main Pages
1. **Home/Dashboard** (`/`) - List of trials, new trial button
2. **New Trial** (`/trials/new`) - Create trial form
3. **Battle View** (`/trials/[id]`) - Live battle streaming

## Tasks

### 1. Trial List Page

Create `src/app/page.tsx`:
```typescript
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/session"
import { db } from "@/db"
import { trials } from "@/db/schema"
import { eq, desc } from "drizzle-orm"
import { TrialCard } from "@/components/trials/trial-card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { SignInButton } from "@/components/auth/sign-in-button"

export default async function HomePage() {
  const user = await getCurrentUser()

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <h1 className="text-4xl font-bold">⚡ THUNDERDOME ⚡</h1>
        <p className="text-muted-foreground text-lg">
          Many gladiators enter. One answer leaves.
        </p>
        <SignInButton />
      </div>
    )
  }

  const userTrials = await db.query.trials.findMany({
    where: eq(trials.userId, user.id),
    orderBy: desc(trials.createdAt),
    limit: 20,
  })

  return (
    <div className="container py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Your Trials</h1>
        <Button asChild>
          <Link href="/trials/new">⚡ Enter the Thunderdome</Link>
        </Button>
      </div>

      {userTrials.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No trials yet. Create your first battle!</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {userTrials.map((trial) => (
            <TrialCard key={trial.id} trial={trial} />
          ))}
        </div>
      )}
    </div>
  )
}
```

### 2. Trial Card Component

Create `src/components/trials/trial-card.tsx`:
```typescript
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDistanceToNow } from "date-fns"

interface TrialCardProps {
  trial: {
    id: string
    challengePrompt: string
    status: string
    trialType: string
    createdAt: Date
  }
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-500",
  lanista_designing: "bg-yellow-500",
  battling: "bg-orange-500",
  arbiter_designing: "bg-yellow-500",
  judging: "bg-purple-500",
  decree: "bg-blue-500",
  complete: "bg-green-500",
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  lanista_designing: "Lanista Designing",
  battling: "Battling",
  arbiter_designing: "Arbiter Designing",
  judging: "Judging",
  decree: "Awaiting Decree",
  complete: "Complete",
}

export function TrialCard({ trial }: TrialCardProps) {
  return (
    <Link href={`/trials/${trial.id}`}>
      <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start gap-4">
            <CardTitle className="text-lg line-clamp-2">
              {trial.challengePrompt.slice(0, 100)}
              {trial.challengePrompt.length > 100 && "..."}
            </CardTitle>
            <Badge className={STATUS_COLORS[trial.status]}>
              {STATUS_LABELS[trial.status]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>{trial.trialType}</span>
            <span>•</span>
            <span>{formatDistanceToNow(trial.createdAt, { addSuffix: true })}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
```

### 3. New Trial Page

Create `src/app/trials/new/page.tsx`:
```typescript
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/session"
import { NewTrialForm } from "@/components/trials/new-trial-form"

export default async function NewTrialPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/")
  }

  if (!user.claudeOauthToken) {
    redirect("/settings?message=claude-token-required")
  }

  return (
    <div className="container max-w-2xl py-8">
      <h1 className="text-2xl font-bold mb-2">⚡ Enter the Thunderdome</h1>
      <p className="text-muted-foreground mb-8">
        Describe your challenge. The Lanista will design gladiators to compete for the best answer.
      </p>
      <NewTrialForm />
    </div>
  )
}
```

### 4. New Trial Form

Create `src/components/trials/new-trial-form.tsx`:
```typescript
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"

export function NewTrialForm() {
  const router = useRouter()
  const [challenge, setChallenge] = useState("")
  const [trialType, setTrialType] = useState("ideation")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/trials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengePrompt: challenge,
          trialType,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to create trial")
      }

      const trial = await res.json()

      // Start the trial
      await fetch(`/api/trials/${trial.id}/start`, { method: "POST" })

      // Navigate to battle view
      router.push(`/trials/${trial.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="challenge">Challenge</Label>
        <Textarea
          id="challenge"
          placeholder="Describe the problem you want gladiators to solve..."
          value={challenge}
          onChange={(e) => setChallenge(e.target.value)}
          rows={6}
          required
          minLength={10}
        />
        <p className="text-sm text-muted-foreground">
          Be specific. Include context. The more detail, the better the gladiators can compete.
        </p>
      </div>

      <div className="space-y-3">
        <Label>Trial Type</Label>
        <RadioGroup value={trialType} onValueChange={setTrialType}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="ideation" id="ideation" />
            <Label htmlFor="ideation" className="font-normal">
              Pure Ideation - Brainstorming, no code
            </Label>
          </div>
          <div className="flex items-center space-x-2 opacity-50">
            <RadioGroupItem value="repo_aware" id="repo_aware" disabled />
            <Label htmlFor="repo_aware" className="font-normal">
              Repo-Aware - Coming soon
            </Label>
          </div>
          <div className="flex items-center space-x-2 opacity-50">
            <RadioGroupItem value="code_battle" id="code_battle" disabled />
            <Label htmlFor="code_battle" className="font-normal">
              Code Battle - Coming soon
            </Label>
          </div>
        </RadioGroup>
      </div>

      {error && (
        <div className="text-red-500 text-sm">{error}</div>
      )}

      <Button type="submit" size="lg" disabled={loading || !challenge.trim()}>
        {loading ? "Entering..." : "⚡ ENTER THE THUNDERDOME"}
      </Button>
    </form>
  )
}
```

### 5. Battle View Page

Create `src/app/trials/[id]/page.tsx`:
```typescript
import { redirect, notFound } from "next/navigation"
import { getCurrentUser } from "@/lib/session"
import { db } from "@/db"
import { trials, gladiators, judges, verdicts } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { BattleView } from "@/components/trials/battle-view"

export default async function TrialPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/")
  }

  const trial = await db.query.trials.findFirst({
    where: and(eq(trials.id, params.id), eq(trials.userId, user.id)),
  })

  if (!trial) {
    notFound()
  }

  const [trialGladiators, trialJudges, trialVerdict] = await Promise.all([
    db.query.gladiators.findMany({ where: eq(gladiators.trialId, trial.id) }),
    db.query.judges.findMany({ where: eq(judges.trialId, trial.id) }),
    db.query.verdicts.findFirst({ where: eq(verdicts.trialId, trial.id) }),
  ])

  return (
    <BattleView
      trial={trial}
      gladiators={trialGladiators}
      judges={trialJudges}
      verdict={trialVerdict}
    />
  )
}
```

### 6. Battle View Component

Create `src/components/trials/battle-view.tsx`:
```typescript
"use client"

import { useState } from "react"
import { useTrialStream } from "@/hooks/use-trial-stream"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { GladiatorPanel } from "./gladiator-panel"
import { StatusBanner } from "./status-banner"

interface BattleViewProps {
  trial: {
    id: string
    challengePrompt: string
    status: string
    lanistaPlan: unknown
    arbiterPlan: unknown
  }
  gladiators: Array<{
    id: string
    name: string
    status: string
    responseContent: string | null
  }>
  judges: Array<{
    id: string
    name: string
    focus: string
    evaluation: unknown
  }>
  verdict: {
    summary: string
    winnerGladiatorId: string | null
  } | null
}

export function BattleView({ trial, gladiators, judges, verdict }: BattleViewProps) {
  const { events, connected } = useTrialStream(trial.id)
  const [activeTab, setActiveTab] = useState(gladiators[0]?.id || "overview")

  // Derive current status from events
  const latestStateChange = events
    .filter(e => e.type === "state_change")
    .pop()
  const currentStatus = (latestStateChange as any)?.status || trial.status

  return (
    <div className="container py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-xl font-bold">⚡ Trial</h1>
          <Badge variant={connected ? "default" : "destructive"}>
            {connected ? "Live" : "Reconnecting..."}
          </Badge>
        </div>
        <p className="text-muted-foreground line-clamp-2">
          {trial.challengePrompt}
        </p>
      </div>

      {/* Status Banner */}
      <StatusBanner status={currentStatus} events={events} />

      {/* Gladiator Tabs */}
      {gladiators.length > 0 && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
          <TabsList>
            {gladiators.map((g) => (
              <TabsTrigger key={g.id} value={g.id} className="gap-2">
                {g.name}
                <GladiatorStatusDot status={g.status} />
              </TabsTrigger>
            ))}
          </TabsList>

          {gladiators.map((g) => (
            <TabsContent key={g.id} value={g.id}>
              <GladiatorPanel
                trialId={trial.id}
                gladiator={g}
                isWinner={verdict?.winnerGladiatorId === g.id}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* Verdict (when ready) */}
      {verdict && (
        <div className="mt-6 p-4 border rounded-lg bg-accent/50">
          <h2 className="font-bold mb-2">⚔️ Verdict</h2>
          <p>{verdict.summary}</p>
        </div>
      )}
    </div>
  )
}

function GladiatorStatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-gray-400",
    fighting: "bg-yellow-400 animate-pulse",
    complete: "bg-green-400",
    failed: "bg-red-400",
  }

  return (
    <span className={`w-2 h-2 rounded-full ${colors[status] || "bg-gray-400"}`} />
  )
}
```

### 7. Status Banner Component

Create `src/components/trials/status-banner.tsx`:
```typescript
"use client"

interface StatusBannerProps {
  status: string
  events: Array<{ type: string; [key: string]: unknown }>
}

const STATUS_MESSAGES: Record<string, { emoji: string; text: string }> = {
  pending: { emoji: "⏳", text: "Preparing for battle..." },
  lanista_designing: { emoji: "🎭", text: "Lanista is designing gladiators..." },
  battling: { emoji: "⚔️", text: "Gladiators are battling!" },
  arbiter_designing: { emoji: "⚖️", text: "Arbiter is designing judges..." },
  judging: { emoji: "📋", text: "Judges are evaluating..." },
  decree: { emoji: "👑", text: "Awaiting your decree..." },
  complete: { emoji: "✅", text: "Trial complete" },
}

export function StatusBanner({ status, events }: StatusBannerProps) {
  const statusInfo = STATUS_MESSAGES[status] || { emoji: "❓", text: "Unknown status" }

  // Get latest relevant message from events
  const latestMessage = events
    .filter(e => e.type?.includes("status") || e.type?.includes("complete"))
    .map(e => (e as any).message)
    .filter(Boolean)
    .pop()

  return (
    <div className="p-4 rounded-lg bg-muted flex items-center gap-3">
      <span className="text-2xl">{statusInfo.emoji}</span>
      <div>
        <p className="font-medium">{statusInfo.text}</p>
        {latestMessage && (
          <p className="text-sm text-muted-foreground">{latestMessage}</p>
        )}
      </div>
    </div>
  )
}
```

### 8. Gladiator Panel Component

Create `src/components/trials/gladiator-panel.tsx`:
```typescript
"use client"

import { useGladiatorStream } from "@/hooks/use-gladiator-stream"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"

interface GladiatorPanelProps {
  trialId: string
  gladiator: {
    id: string
    name: string
    status: string
    responseContent: string | null
  }
  isWinner: boolean
}

export function GladiatorPanel({ trialId, gladiator, isWinner }: GladiatorPanelProps) {
  const { outputText, status } = useGladiatorStream(trialId, gladiator.id)

  // Use streamed output if available, otherwise stored response
  const displayContent = outputText || gladiator.responseContent || ""

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="font-bold">{gladiator.name}</h3>
        {isWinner && <Badge className="bg-yellow-500">⭐ Winner</Badge>}
        <Badge variant="outline">{status || gladiator.status}</Badge>
      </div>

      <ScrollArea className="h-[400px]">
        <div className="prose prose-sm prose-invert max-w-none">
          {displayContent ? (
            <pre className="whitespace-pre-wrap font-mono text-sm">
              {displayContent}
            </pre>
          ) : (
            <p className="text-muted-foreground">Waiting for output...</p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
```

## File Structure

```
src/
├── app/
│   ├── page.tsx                    # Home/Dashboard
│   └── trials/
│       ├── new/
│       │   └── page.tsx            # New trial form
│       └── [id]/
│           └── page.tsx            # Battle view
├── components/trials/
│   ├── trial-card.tsx
│   ├── new-trial-form.tsx
│   ├── battle-view.tsx
│   ├── status-banner.tsx
│   └── gladiator-panel.tsx
└── hooks/
    ├── use-trial-stream.ts
    └── use-gladiator-stream.ts
```

## Acceptance Criteria

- [ ] Dashboard shows list of user's trials
- [ ] Trial cards show status, type, and preview
- [ ] Can create new ideation trial
- [ ] Battle view shows live streaming output
- [ ] Tabs switch between gladiators
- [ ] Status banner reflects current phase
- [ ] Gladiator status dots update in real-time
- [ ] Winner highlighted after verdict
- [ ] Reconnection works on connection loss

## Aesthetic Notes

- Dark mode default
- Gritty, industrial feel
- Fire/lightning accents (orange/yellow on dark)
- Status animations (pulsing during active phases)
- Monospace font for gladiator output

---

## Dependencies

**Depends on**: Issue 1 (components, schema)
**Blocks**: Issue 9 (Results UI extends battle view)
