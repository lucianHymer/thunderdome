# Issue 11: Setup Discovery

> **Wave 4** - Depends on Issues 10 (containers)
> **Parallel with**: Issue 12

## Overview

Implement interactive Setup Discovery - a Claude session that explores a repo and figures out how to build and test it. This creates `.thunderdome/setup.md` and `.thunderdome/setup.sh` files.

## The Setup Discovery Flow

From the spec:
> Before running code battles on a repo, Thunderdome needs to know how to build and test it. This is the **Setup Discovery** phase—an interactive session where you and Claude figure out how to work with the repo.

1. User selects a repo for a code battle
2. Thunderdome checks for existing `.thunderdome/setup.md`
3. **If no setup exists**: Interactive discovery session begins
4. Claude explores the repo, proposes commands
5. User can watch and intervene
6. Claude writes setup files
7. User approves

## Tasks

### 1. Setup Discovery Service

Create `src/lib/setup/discovery.ts`:
```typescript
import { runAgent, type StreamEvent } from "@/lib/claude"
import { SETUP_DISCOVERY_PROMPT } from "./prompts"

export interface SetupDiscoveryConfig {
  repoUrl: string
  claudeToken: string
  onEvent: (event: StreamEvent) => void
}

export interface SetupResult {
  setupMd: string
  setupSh: string
  projectType: string
  buildCommand: string
  testCommand: string
}

export async function runSetupDiscovery(
  config: SetupDiscoveryConfig
): Promise<SetupResult> {
  let setupMd = ""
  let setupSh = ""

  for await (const event of runAgent(
    SETUP_DISCOVERY_PROMPT,
    {
      systemPrompt: SETUP_DISCOVERY_SYSTEM_PROMPT,
      model: "sonnet",
      maxTurns: 20,
      allowedTools: ["Read", "Glob", "Grep", "Bash"], // No Edit/Write yet
    },
    config.claudeToken
  )) {
    config.onEvent(event)

    // Parse setup files from output
    if (event.type === "text") {
      const mdMatch = event.content.match(
        /```markdown:\.thunderdome\/setup\.md\n([\s\S]*?)```/
      )
      if (mdMatch) setupMd = mdMatch[1]

      const shMatch = event.content.match(
        /```bash:\.thunderdome\/setup\.sh\n([\s\S]*?)```/
      )
      if (shMatch) setupSh = shMatch[1]
    }
  }

  if (!setupMd || !setupSh) {
    throw new Error("Setup discovery failed to generate setup files")
  }

  // Parse project info from setupMd
  const projectTypeMatch = setupMd.match(/## Project Type\n(.+)/)
  const buildMatch = setupMd.match(/## Build\n```bash\n(.+)\n```/)
  const testMatch = setupMd.match(/## Test\n```bash\n(.+)\n```/)

  return {
    setupMd,
    setupSh,
    projectType: projectTypeMatch?.[1] || "unknown",
    buildCommand: buildMatch?.[1] || "",
    testCommand: testMatch?.[1] || "",
  }
}
```

### 2. Setup Discovery Prompts

Create `src/lib/setup/prompts.ts`:
```typescript
export const SETUP_DISCOVERY_SYSTEM_PROMPT = `You are a build system detective. Your job is to figure out how to build and test a codebase.

## Your Approach
1. Look for common configuration files (package.json, Cargo.toml, foundry.toml, pyproject.toml, etc.)
2. Read them to understand dependencies and scripts
3. Identify the project type and toolchain
4. Propose build and test commands
5. Try running them to verify they work
6. Generate setup documentation

## Tools Available
- Read: Read files
- Glob: Find files by pattern
- Grep: Search file contents
- Bash: Run commands (use carefully, verify before running)

## Output Format
After exploration, generate two files:

1. \`.thunderdome/setup.md\` - Human-readable documentation
2. \`.thunderdome/setup.sh\` - Executable setup script

Format your output as:
\`\`\`markdown:.thunderdome/setup.md
[content]
\`\`\`

\`\`\`bash:.thunderdome/setup.sh
[content]
\`\`\`

## Safety
- Don't run destructive commands
- Verify commands before executing
- Ask for clarification if unsure`

export const SETUP_DISCOVERY_PROMPT = `Explore this repository and figure out how to build and test it.

1. First, look for configuration files to identify the project type
2. Read the README if it exists
3. Identify dependencies and how to install them
4. Find the build command
5. Find the test command
6. Try running build and test to verify they work
7. Generate the setup files

Start by listing the root directory contents.`
```

### 3. Setup Discovery API

Create `src/app/api/repos/[owner]/[repo]/setup/route.ts`:
```typescript
import { NextRequest } from "next/server"
import { requireUser } from "@/lib/session"
import { db } from "@/db"
import { repoSetups } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { decrypt } from "@/lib/encryption"
import { runSetupDiscovery } from "@/lib/setup/discovery"

// GET - Check if setup exists
export async function GET(
  req: NextRequest,
  { params }: { params: { owner: string; repo: string } }
) {
  const user = await requireUser()
  const repoUrl = `https://github.com/${params.owner}/${params.repo}`

  const setup = await db.query.repoSetups.findFirst({
    where: and(
      eq(repoSetups.userId, user.id),
      eq(repoSetups.repoUrl, repoUrl)
    ),
  })

  if (setup) {
    return Response.json({
      exists: true,
      setup: {
        setupMd: setup.setupMd,
        setupSh: setup.setupSh,
        updatedAt: setup.updatedAt,
      },
    })
  }

  return Response.json({ exists: false })
}

// POST - Run setup discovery (streaming)
export async function POST(
  req: NextRequest,
  { params }: { params: { owner: string; repo: string } }
) {
  const user = await requireUser()

  if (!user.claudeOauthToken || !user.githubAccessToken) {
    return new Response("Missing tokens", { status: 400 })
  }

  const repoUrl = `https://github.com/${params.owner}/${params.repo}`
  const claudeToken = decrypt(user.claudeOauthToken)

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const result = await runSetupDiscovery({
          repoUrl,
          claudeToken,
          onEvent: (event) => {
            const message = `data: ${JSON.stringify(event)}\n\n`
            controller.enqueue(new TextEncoder().encode(message))
          },
        })

        // Store setup in database
        await db.insert(repoSetups)
          .values({
            userId: user.id,
            repoUrl,
            setupMd: result.setupMd,
            setupSh: result.setupSh,
          })
          .onConflictDoUpdate({
            target: [repoSetups.userId, repoSetups.repoUrl],
            set: {
              setupMd: result.setupMd,
              setupSh: result.setupSh,
              updatedAt: new Date(),
            },
          })

        // Send completion
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ type: "complete", result })}\n\n`
          )
        )
      } catch (error) {
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({
              type: "error",
              error: error instanceof Error ? error.message : "Unknown error",
            })}\n\n`
          )
        )
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  })
}
```

### 4. Setup Discovery UI

Create `src/components/setup/setup-discovery.tsx`:
```typescript
"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"

interface SetupDiscoveryProps {
  owner: string
  repo: string
  onComplete: (setup: { setupMd: string; setupSh: string }) => void
}

export function SetupDiscovery({ owner, repo, onComplete }: SetupDiscoveryProps) {
  const [status, setStatus] = useState<"idle" | "running" | "complete" | "error">("idle")
  const [output, setOutput] = useState<string>("")
  const [setupMd, setSetupMd] = useState<string>("")
  const [setupSh, setSetupSh] = useState<string>("")
  const [userInput, setUserInput] = useState<string>("")
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [output])

  async function startDiscovery() {
    setStatus("running")
    setOutput("")

    try {
      const response = await fetch(`/api/repos/${owner}/${repo}/setup`, {
        method: "POST",
      })

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split("\n").filter(l => l.startsWith("data: "))

        for (const line of lines) {
          const data = JSON.parse(line.replace("data: ", ""))

          if (data.type === "text") {
            setOutput(prev => prev + data.content)
          } else if (data.type === "complete") {
            setSetupMd(data.result.setupMd)
            setSetupSh(data.result.setupSh)
            setStatus("complete")
          } else if (data.type === "error") {
            setStatus("error")
            setOutput(prev => prev + `\n\nError: ${data.error}`)
          }
        }
      }
    } catch (error) {
      setStatus("error")
      setOutput(prev => prev + `\n\nError: ${error}`)
    }
  }

  function handleApprove() {
    onComplete({ setupMd, setupSh })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>🔧 Setup Discovery: {owner}/{repo}</CardTitle>
        </CardHeader>
        <CardContent>
          {status === "idle" && (
            <div className="space-y-4">
              <p className="text-muted-foreground">
                No setup found for this repository. Run Setup Discovery to figure out
                how to build and test it.
              </p>
              <Button onClick={startDiscovery}>
                🔍 Start Setup Discovery
              </Button>
            </div>
          )}

          {status === "running" && (
            <div className="space-y-4">
              <ScrollArea className="h-96 border rounded p-4">
                <pre className="whitespace-pre-wrap text-sm font-mono">
                  {output}
                </pre>
                <div ref={scrollRef} />
              </ScrollArea>

              <div className="flex gap-2">
                <Textarea
                  placeholder="Intervene: type a message to guide Claude..."
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  rows={2}
                />
                <Button variant="outline" disabled>
                  Send (coming soon)
                </Button>
              </div>
            </div>
          )}

          {status === "complete" && (
            <div className="space-y-4">
              <div className="p-4 bg-green-500/10 border border-green-500/50 rounded">
                ✅ Setup discovery complete!
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium mb-2">setup.md</h3>
                  <Textarea
                    value={setupMd}
                    onChange={(e) => setSetupMd(e.target.value)}
                    rows={10}
                    className="font-mono text-sm"
                  />
                </div>
                <div>
                  <h3 className="font-medium mb-2">setup.sh</h3>
                  <Textarea
                    value={setupSh}
                    onChange={(e) => setSetupSh(e.target.value)}
                    rows={10}
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleApprove}>
                  ✓ Approve & Continue
                </Button>
                <Button variant="outline" onClick={startDiscovery}>
                  🔄 Re-run Discovery
                </Button>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-4">
              <div className="p-4 bg-red-500/10 border border-red-500/50 rounded">
                ❌ Setup discovery failed
              </div>
              <ScrollArea className="h-48 border rounded p-4">
                <pre className="whitespace-pre-wrap text-sm">{output}</pre>
              </ScrollArea>
              <Button onClick={startDiscovery}>
                🔄 Try Again
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

### 5. Repo Selection Component

Create `src/components/trials/repo-selector.tsx`:
```typescript
"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface RepoSelectorProps {
  onSelect: (repoUrl: string) => void
}

interface GitHubRepo {
  full_name: string
  private: boolean
  description: string | null
}

export function RepoSelector({ onSelect }: RepoSelectorProps) {
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchRepos() {
      const res = await fetch("/api/github/repos")
      if (res.ok) {
        const data = await res.json()
        setRepos(data)
      }
      setLoading(false)
    }
    fetchRepos()
  }, [])

  const filteredRepos = repos.filter(r =>
    r.full_name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search repositories..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <p className="text-muted-foreground">Loading repositories...</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-auto">
          {filteredRepos.map((repo) => (
            <Card
              key={repo.full_name}
              className="cursor-pointer hover:bg-accent"
              onClick={() => onSelect(`https://github.com/${repo.full_name}`)}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{repo.full_name}</span>
                  {repo.private && (
                    <span className="text-xs text-muted-foreground">🔒 Private</span>
                  )}
                </div>
                {repo.description && (
                  <p className="text-sm text-muted-foreground truncate">
                    {repo.description}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
```

### 6. GitHub Repos API

Create `src/app/api/github/repos/route.ts`:
```typescript
import { NextResponse } from "next/server"
import { requireUser } from "@/lib/session"
import { decrypt } from "@/lib/encryption"

export async function GET() {
  const user = await requireUser()

  if (!user.githubAccessToken) {
    return NextResponse.json({ error: "GitHub not connected" }, { status: 400 })
  }

  const token = decrypt(user.githubAccessToken)

  const response = await fetch(
    "https://api.github.com/user/repos?sort=updated&per_page=100",
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    }
  )

  if (!response.ok) {
    return NextResponse.json({ error: "GitHub API error" }, { status: 500 })
  }

  const repos = await response.json()

  return NextResponse.json(
    repos.map((r: any) => ({
      full_name: r.full_name,
      private: r.private,
      description: r.description,
    }))
  )
}
```

## File Structure

```
src/
├── app/api/
│   ├── github/repos/route.ts
│   └── repos/[owner]/[repo]/setup/route.ts
├── components/
│   ├── setup/
│   │   └── setup-discovery.tsx
│   └── trials/
│       └── repo-selector.tsx
└── lib/setup/
    ├── discovery.ts
    └── prompts.ts
```

## Acceptance Criteria

- [ ] Can fetch user's GitHub repositories
- [ ] Can check if setup exists for a repo
- [ ] Setup discovery streams Claude's exploration
- [ ] User can watch Claude work in real-time
- [ ] Setup files generated and stored
- [ ] User can edit setup files before approval
- [ ] Can re-run discovery if needed
- [ ] Setup cached per-repo per-user

---

## Dependencies

**Depends on**: Issue 10 (containers for running setup)
**Blocks**: Issue 12 (code battles need setup)
