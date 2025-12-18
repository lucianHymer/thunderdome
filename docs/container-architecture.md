# Container Architecture for Code Battles

## Overview

All code battle operations run inside ephemeral Docker containers. Containers are stateless - they can die at any point and trials can resume from GitHub + DB state.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  Container (ephemeral, can be destroyed/recreated anytime)          │
│                                                                     │
│  Agent Server (:3000)                                               │
│  └── HTTP API for Claude sessions                                   │
│  └── Multiple concurrent sessions (setup, gladiators, consul)       │
│                                                                     │
│  /workspace/repo  ← cloned from GitHub at container start           │
│       │                                                             │
│       ├── Setup Discovery explores here                             │
│       │                                                             │
│       ├── gladiator-1/ (git worktree)                              │
│       ├── gladiator-2/ (git worktree)                              │
│       └── gladiator-3/ (git worktree)                              │
│                                                                     │
│  All actors push branches to origin (GitHub)                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
         │
         │ Push branches to origin
         ▼
    ┌─────────┐
    │ GitHub  │  ← branches persist here, container is stateless
    └─────────┘
```

## State Persistence

Containers are **stateless**. All persistent state lives externally:

| State | Storage | Purpose |
|-------|---------|---------|
| Setup files (setup.md, setup.sh) | Database | Reused for future trials on same repo |
| Trial metadata | Database | Status, phase, config |
| Gladiator records | Database | Names, branches, responses |
| Judge evaluations | Database | Scores, feedback |
| Verdict | Database | Winner, reasoning |
| **Actual code changes** | **GitHub branches** | Gladiator work product |

## Lifecycle

### 1. Container Startup

```
POST /api/trials/:id/start (with repoUrl)
    │
    ▼
startTrialContainer(trialId)
    │
    ▼
Wait for agent server healthy (:3000)
    │
    ▼
Clone repo: git clone <repoUrl> /workspace/repo
    │
    ▼
Container ready for operations
```

### 2. Setup Discovery (if needed)

```
Create session on agent server:
POST /sessions
{
  model: "opus",
  systemPrompt: <setup discovery prompt>,
  tools: ["Read", "Glob", "Grep", "Bash"],
  cwd: "/workspace/repo"
}

Claude explores repo, generates:
- setup.md (documentation)
- setup.sh (setup script)

Save to database (repoSetups table)
Optionally commit to .thunderdome/ and push
```

### 3. Run Setup Script

```
container.exec(["bash", "/workspace/repo/.thunderdome/setup.sh"])
```

### 4. Gladiator Execution

For each gladiator (in parallel):

```
1. Create worktree:
   git worktree add /workspace/<gladiator-slug> -b thunderdome/<trial-id>/<gladiator-slug>

2. Create session on agent server:
   POST /sessions
   {
     model: <gladiator.model>,
     systemPrompt: <gladiator prompt with persona>,
     tools: <gladiator.tools>,
     cwd: "/workspace/<gladiator-slug>"
   }

3. Run gladiator:
   POST /sessions/:id/message
   { content: "Begin your work..." }

4. Commit and push:
   cd /workspace/<gladiator-slug>
   git add -A
   git commit -m "Gladiator <name> submission"
   git push origin thunderdome/<trial-id>/<gladiator-slug>
```

### 5. Arbiter & Judges

Arbiter and judges don't need repo access - they evaluate based on:
- Gladiator response content (from DB)
- FINDINGS.md content (from DB)

Can run on host or in container (doesn't matter).

### 6. Consul

```
Create session on agent server:
POST /sessions
{
  model: "opus",
  systemPrompt: <consul prompt with verdict context>,
  tools: ["Read", "Bash", "Glob", "Grep"],  // git access for merging
  cwd: "/workspace/repo"
}

Consul can:
- Review branches: git log, git diff
- Merge winner: git merge <branch>
- Create PR: gh pr create
- Synthesize: cherry-pick from multiple branches
- Push to main: git push origin main (with user approval)
```

### 7. Container Cleanup

```
Container destroyed after:
- Consul completes and user confirms
- 30 minute idle timeout
- Explicit user cancellation

No data lost - everything persisted to DB + GitHub
```

## Resume Capability

If container dies mid-trial:

```
1. Check trial state in DB
2. Spin up new container
3. Clone repo (branches already exist on GitHub)
4. Run setup.sh (from DB or .thunderdome/)
5. Resume from last completed phase:
   - No gladiators? Resume from gladiator phase
   - Gladiators done? Resume from arbiter
   - Verdict exists? Resume consul
```

## Agent Server API

The container runs an HTTP server for Claude sessions:

```
POST   /sessions              Create session
POST   /sessions/:id/message  Send message (SSE stream response)
GET    /sessions/:id          Get session status
DELETE /sessions/:id          End session
GET    /health                Health check
```

See `packages/agent-server/` for implementation.

## Files to Modify

### Setup Discovery
- `src/lib/setup/discovery.ts` - Use agent server client instead of direct `runAgent()`
- `src/app/api/repos/[owner]/[repo]/setup/route.ts` - Start container, use agent client

### Code Battle Orchestrator
- `src/lib/trial/code-battle/orchestrator.ts` - Already updated, but needs:
  - Setup discovery integration
  - Consul integration
  - Better resume logic

### Consul
- `src/lib/trial/consul/` - Create consul runner using agent server
- `src/app/api/trials/[id]/consul/route.ts` - Use container session

### Container Service
- `src/lib/trial/container-service.ts` - May need longer timeouts, better lifecycle

## Security Considerations

1. **Git credentials**: Container needs push access to user's repos
   - Pass GitHub token at container start
   - Use git credential helper or .netrc

2. **OAuth tokens**: Passed per-request to agent server
   - Not stored in container
   - Session-scoped

3. **Sandboxing**: Container has limited capabilities
   - No privilege escalation
   - Memory/CPU limits
   - Network access only to GitHub + Claude API

## Open Questions

1. **Git auth**: How to give container push access?
   - GitHub App installation token?
   - User's GitHub token?
   - Deploy key per repo?

2. **Container reuse**: Should setup discovery + gladiators + consul all use same container?
   - Pros: Faster, no re-clone
   - Cons: Longer container lifetime, more resource usage
   - Recommendation: Same container for one trial session, destroy after

3. **Parallel trials**: Multiple trials on same repo?
   - Each gets own container
   - Branch naming includes trial ID to avoid conflicts
