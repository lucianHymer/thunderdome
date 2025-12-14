# Issue 12: Code Battle Mode

> **Wave 4** - Depends on Issues 10, 11
> **Final feature for full implementation

## Overview

Implement full Code Battle mode where gladiators can read, edit, build, and test code in isolated git worktrees. Each gladiator gets their own branch, and winning solutions can be merged.

## Code Battle Flow

```
User selects repo + creates trial
            ↓
Setup Discovery (if needed)
            ↓
Container spawns, repo cloned
            ↓
setup.sh runs to prepare environment
            ↓
Worktrees created for each gladiator
            ↓
Gladiators battle (with full tool access)
            ↓
Each creates .thunderdome/FINDINGS.md
            ↓
Branches pushed to repo
            ↓
Container destroyed
            ↓
Arbiter → Judges → Verdict → Decree
```

## Tasks

### 1. Worktree Management

Create `src/lib/git/worktree.ts`:
```typescript
import { TrialContainer } from "@/lib/docker/container"

export interface WorktreeConfig {
  trialId: string
  gladiatorName: string
}

export async function createWorktree(
  container: TrialContainer,
  config: WorktreeConfig
): Promise<string> {
  const branchName = `thunderdome/trial-${config.trialId}/${slugify(config.gladiatorName)}`
  const worktreePath = `/workspace/${slugify(config.gladiatorName)}`

  // Create branch and worktree
  await container.exec(`git checkout -b ${branchName}`)
  await container.exec(`git worktree add ${worktreePath} ${branchName}`)

  return worktreePath
}

export async function pushWorktree(
  container: TrialContainer,
  branchName: string
): Promise<void> {
  await container.exec(`git push origin ${branchName}`)
}

export async function pushAllWorktrees(
  container: TrialContainer,
  trialId: string
): Promise<void> {
  // Push all trial branches
  await container.exec(
    `git push origin --all --force-with-lease`
  )
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}
```

### 2. Code Battle Gladiator Runner

Create `src/lib/trial/code-battle/gladiators.ts`:
```typescript
import { db } from "@/db"
import { gladiators } from "@/db/schema"
import { eq } from "drizzle-orm"
import { runAgent, type StreamEvent } from "@/lib/claude"
import { TrialContainer } from "@/lib/docker/container"
import { createWorktree } from "@/lib/git/worktree"
import { broadcastGladiatorUpdate } from "@/lib/trial/broadcast"
import { buildCodeBattlePrompt } from "../gladiators/prompts"

interface GladiatorRecord {
  id: string
  name: string
  persona: string
  model: string
  temperature: number
  tools: unknown
}

export async function runCodeBattleGladiator(
  trialId: string,
  gladiator: GladiatorRecord,
  challenge: string,
  container: TrialContainer,
  claudeToken: string
): Promise<void> {
  // Create worktree for this gladiator
  const worktreePath = await createWorktree(container, {
    trialId,
    gladiatorName: gladiator.name,
  })

  const branchName = `thunderdome/trial-${trialId}/${slugify(gladiator.name)}`

  // Update gladiator with branch name
  await db.update(gladiators)
    .set({
      branchName,
      status: "fighting",
    })
    .where(eq(gladiators.id, gladiator.id))

  // Build the prompt with repo context
  const prompt = buildCodeBattlePrompt(
    challenge,
    gladiator.name,
    `Working directory: ${worktreePath}\nBranch: ${branchName}`
  )

  const streamLog: StreamEvent[] = []

  try {
    // Run agent inside the container
    // This requires executing claude-agent in the container with the worktree as cwd
    const exitCode = await container.execStream(
      `cd ${worktreePath} && node -e "
        const { query } = require('@anthropic-ai/claude-agent-sdk');
        const prompt = ${JSON.stringify(prompt)};
        const options = {
          systemPrompt: ${JSON.stringify(gladiator.persona)},
          maxTurns: 20,
          allowedTools: ${JSON.stringify(gladiator.tools)},
        };
        (async () => {
          for await (const msg of query({ prompt, options })) {
            console.log(JSON.stringify(msg));
          }
        })();
      "`,
      (data: string) => {
        // Parse and broadcast events
        try {
          const lines = data.split("\\n").filter(Boolean)
          for (const line of lines) {
            const event = JSON.parse(line)
            const streamEvent: StreamEvent = {
              type: event.type === "assistant" ? "text" : event.type,
              content: JSON.stringify(event),
              timestamp: Date.now(),
            }
            streamLog.push(streamEvent)
            broadcastGladiatorUpdate(trialId, gladiator.id, {
              type: "gladiator_event",
              gladiatorId: gladiator.id,
              event: streamEvent,
            })
          }
        } catch {
          // Not JSON, just output text
          const streamEvent: StreamEvent = {
            type: "text",
            content: data,
            timestamp: Date.now(),
          }
          streamLog.push(streamEvent)
        }
      }
    )

    // Check for FINDINGS.md
    const { stdout: findings } = await container.exec(
      `cat ${worktreePath}/.thunderdome/FINDINGS.md 2>/dev/null || echo ""`
    )

    // Commit changes
    await container.exec(`
      cd ${worktreePath} && \
      git add -A && \
      git commit -m "Gladiator ${gladiator.name} submission" --allow-empty
    `)

    // Update gladiator record
    await db.update(gladiators)
      .set({
        status: "complete",
        responseContent: findings || "No FINDINGS.md generated",
        streamLog,
      })
      .where(eq(gladiators.id, gladiator.id))

    await broadcastGladiatorUpdate(trialId, gladiator.id, {
      type: "gladiator_complete",
      gladiatorId: gladiator.id,
      success: true,
    })

  } catch (error) {
    console.error(`Code battle gladiator ${gladiator.name} error:`, error)

    await db.update(gladiators)
      .set({
        status: "failed",
        streamLog,
      })
      .where(eq(gladiators.id, gladiator.id))

    await broadcastGladiatorUpdate(trialId, gladiator.id, {
      type: "gladiator_complete",
      gladiatorId: gladiator.id,
      success: false,
    })
  }
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}
```

### 3. Code Battle Trial Orchestrator

Create `src/lib/trial/code-battle/orchestrator.ts`:
```typescript
import { db } from "@/db"
import { trials, gladiators } from "@/db/schema"
import { eq } from "drizzle-orm"
import { startTrialContainer, destroyTrialContainer, runSetupInContainer } from "@/lib/trial/container-service"
import { pushAllWorktrees } from "@/lib/git/worktree"
import { runCodeBattleGladiator } from "./gladiators"
import { transitionTrialState } from "@/lib/trial/state"
import { broadcastTrialUpdate } from "@/lib/trial/broadcast"

export async function runCodeBattle(
  trialId: string,
  userId: string,
  claudeToken: string
): Promise<void> {
  let container

  try {
    // Start container
    await broadcastTrialUpdate(trialId, {
      type: "container_status",
      status: "starting",
      message: "Spinning up battle container...",
    })

    container = await startTrialContainer(trialId, userId)

    // Run setup
    await broadcastTrialUpdate(trialId, {
      type: "container_status",
      status: "setup",
      message: "Running setup script...",
    })

    const setupSuccess = await runSetupInContainer(container, (data) => {
      broadcastTrialUpdate(trialId, {
        type: "setup_output",
        content: data,
      })
    })

    if (!setupSuccess) {
      throw new Error("Setup failed")
    }

    // Get trial and gladiators
    const trial = await db.query.trials.findFirst({
      where: eq(trials.id, trialId),
    })

    const trialGladiators = await db.query.gladiators.findMany({
      where: eq(gladiators.trialId, trialId),
    })

    // Run gladiators in parallel (inside container)
    await broadcastTrialUpdate(trialId, {
      type: "battle_start",
      message: "Gladiators entering the arena...",
      gladiatorCount: trialGladiators.length,
    })

    await Promise.all(
      trialGladiators.map((g) =>
        runCodeBattleGladiator(
          trialId,
          g as any,
          trial!.challengePrompt,
          container!,
          claudeToken
        )
      )
    )

    // Push all branches
    await broadcastTrialUpdate(trialId, {
      type: "container_status",
      status: "pushing",
      message: "Pushing branches to repository...",
    })

    await pushAllWorktrees(container, trialId)

    await broadcastTrialUpdate(trialId, {
      type: "battle_complete",
      message: "All gladiators have submitted their work",
    })

    // Proceed to Arbiter
    await transitionTrialState(trialId, "arbiter_designing")

    // Import and run arbiter
    const { runArbiter } = await import("../arbiter")
    await runArbiter(trialId, claudeToken)

  } catch (error) {
    console.error("Code battle error:", error)

    await broadcastTrialUpdate(trialId, {
      type: "error",
      phase: "code_battle",
      message: error instanceof Error ? error.message : "Unknown error",
    })

  } finally {
    // Always destroy container
    if (container) {
      await broadcastTrialUpdate(trialId, {
        type: "container_status",
        status: "cleanup",
        message: "Cleaning up container...",
      })

      await destroyTrialContainer(trialId)
    }
  }
}
```

### 4. Update Trial Start for Code Battles

Update `src/app/api/trials/[id]/start/route.ts`:
```typescript
// Add to existing file

import { runCodeBattle } from "@/lib/trial/code-battle/orchestrator"

// In POST handler, after checking trial type:

if (trial.trialType === "code_battle") {
  // Check setup exists
  const repoUrl = new URL(trial.repoUrl!)
  const [owner, repo] = repoUrl.pathname.slice(1).split("/")

  const setup = await db.query.repoSetups.findFirst({
    where: and(
      eq(repoSetups.userId, user.id),
      eq(repoSetups.repoUrl, trial.repoUrl!)
    ),
  })

  if (!setup) {
    return NextResponse.json(
      { error: "Repo setup required. Run Setup Discovery first." },
      { status: 400 }
    )
  }

  // Run code battle in background
  runCodeBattle(trial.id, user.id, claudeToken).catch(console.error)

  return NextResponse.json({ success: true, status: "container_starting" })
}
```

### 5. Branch Viewer Component

Create `src/components/trials/branch-viewer.tsx`:
```typescript
"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ExternalLink, GitBranch } from "lucide-react"

interface BranchViewerProps {
  repoUrl: string
  gladiators: Array<{
    id: string
    name: string
    branchName: string | null
    status: string
  }>
  winnerId: string | null
}

export function BranchViewer({ repoUrl, gladiators, winnerId }: BranchViewerProps) {
  // Parse repo URL to build GitHub links
  const repoPath = new URL(repoUrl).pathname.slice(1)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          Code Branches
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {gladiators.map((g) => (
            <div
              key={g.id}
              className={`flex items-center justify-between p-2 rounded border ${
                g.id === winnerId ? "border-yellow-500 bg-yellow-500/10" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span>{g.name}</span>
                {g.id === winnerId && <span>⭐</span>}
              </div>

              {g.branchName && (
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={`https://github.com/${repoPath}/tree/${g.branchName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View Branch <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t">
          <p className="text-sm text-muted-foreground mb-2">
            Quick actions:
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a
                href={`https://github.com/${repoPath}/branches/all?query=thunderdome`}
                target="_blank"
              >
                View All Trial Branches
              </a>
            </Button>
            {winnerId && (
              <Button size="sm" asChild>
                <a
                  href={`https://github.com/${repoPath}/compare/main...${
                    gladiators.find(g => g.id === winnerId)?.branchName
                  }`}
                  target="_blank"
                >
                  Create PR for Winner
                </a>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
```

### 6. FINDINGS.md Template

Create `src/lib/trial/code-battle/findings-template.ts`:
```typescript
export const FINDINGS_TEMPLATE = `# Thunderdome Findings

## Summary
[Brief description of what you found/built]

## Approach
[Explain your approach and reasoning]

## Changes Made
[List the files you modified and what you changed]

## Testing
[How to verify your changes work]

## Trade-offs
[Any trade-offs or concerns]

## Recommendations
[Your recommendations for next steps]
`

export function createFindingsPromptAddition(): string {
  return `

IMPORTANT: When you're done, create a file at \`.thunderdome/FINDINGS.md\` with your findings.
Use this structure:

\`\`\`markdown
${FINDINGS_TEMPLATE}
\`\`\`

This file is REQUIRED for your submission to be considered.`
}
```

## File Structure

```
src/lib/
├── git/
│   └── worktree.ts
└── trial/
    └── code-battle/
        ├── orchestrator.ts
        ├── gladiators.ts
        └── findings-template.ts

src/components/trials/
└── branch-viewer.tsx
```

## Acceptance Criteria

- [ ] Container spawns with repo cloned
- [ ] Setup script runs successfully
- [ ] Worktrees created for each gladiator
- [ ] Gladiators can read, edit, build, test
- [ ] FINDINGS.md required for submission
- [ ] Branches pushed to GitHub
- [ ] Container destroyed after completion
- [ ] Branch viewer shows all gladiator branches
- [ ] Can create PR for winning solution
- [ ] Handles setup/execution failures gracefully

## Security Notes

1. All code runs inside ephemeral container
2. Container destroyed after branches pushed
3. Resource limits prevent runaway processes
4. Tokens passed via env, not persisted
5. Network access limited to GitHub/npm/etc.

---

## Dependencies

**Depends on**: Issue 10 (containers), Issue 11 (setup discovery)
**Blocks**: None (final feature)
