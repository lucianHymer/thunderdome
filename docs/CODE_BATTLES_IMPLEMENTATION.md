# Code Battles Implementation Plan

## Overview

Code Battles allow AI gladiators to compete by making real changes to a user's repository. Each gladiator works in an isolated Docker container with its own git worktree/branch, then pushes results for comparison.

---

## Current State

### Done
- [x] Docker container orchestration with security hardening
- [x] Git worktree creation and branch management
- [x] Setup Discovery (Claude explores repo, generates `setup.sh`)
- [x] Database schema (`trials.repoUrl`, `repoSetups`, `gladiators.branchName`)
- [x] Frontend UI (repo selector, trial creation, battle view)
- [x] GitHub OAuth for user authentication (read-only repo listing)
- [x] **GitHub App integration** (Phase 1 complete)
  - Database schema: `github_app_installations`, `github_app_repos`
  - Library: `src/lib/github/app.ts` with octokit SDK
  - API endpoints: install, callback, repos, installations
  - Just-in-time token generation for clone/push
- [x] **Git worktree improvements**
  - Proper repo structure: `/workspace/repo/` + worktree directories
  - Token embedded in git URL (no credential helper needed)
  - `cloneRepo()`, `createWorktree()`, `commitWorktreeChanges()`, `pushAllWorktrees()`
  - Git identity configured automatically

### Remaining Work
- [ ] Claude Agent SDK execution in containers
- [ ] Real-time stream handling from container → client
- [ ] Orchestrator wiring (currently throws error immediately)
- [ ] Container image with Claude CLI installed

---

## Phase 1: GitHub App Integration ✅ COMPLETE

### Why GitHub App Instead of OAuth?

| OAuth App | GitHub App |
|-----------|------------|
| User grants access to ALL repos | User selects specific repos |
| Token has all user permissions | Scoped to installation permissions |
| Long-lived tokens | Short-lived installation tokens (1hr) |
| Can't revoke per-repo | Revocable per-installation |
| Less audit trail | Webhook events, audit log |

### 1.1 Create GitHub App

**Settings to configure:**

```
Name: Thunderdome Code Battles
Homepage URL: https://your-domain.com
Callback URL: https://your-domain.com/api/github/app/callback
Setup URL: https://your-domain.com/api/github/app/setup (optional)
Webhook URL: https://your-domain.com/api/github/webhooks (optional)
```

**Permissions needed:**
- Repository permissions:
  - Contents: Read & Write (for git push)
  - Metadata: Read (required)
  - Pull requests: Read & Write (optional, for auto-PR creation)
- Account permissions:
  - None required

**Events to subscribe (optional):**
- Installation
- Push (to detect external changes)

### 1.2 Environment Variables

```env
# GitHub App (for code battles - repo write access)
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=  # Base64 encoded .pem file
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
GITHUB_APP_WEBHOOK_SECRET=  # Optional
```

### 1.3 Database Schema Changes

```sql
-- Track GitHub App installations per user
CREATE TABLE github_app_installations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  installation_id INTEGER NOT NULL,
  account_login TEXT NOT NULL,      -- GitHub username or org
  account_type TEXT NOT NULL,       -- 'User' or 'Organization'
  repository_selection TEXT,         -- 'all' or 'selected'
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Cache which repos are accessible via which installation
CREATE TABLE github_app_repos (
  id TEXT PRIMARY KEY,
  installation_id INTEGER NOT NULL,
  repo_full_name TEXT NOT NULL,     -- 'owner/repo'
  repo_id INTEGER NOT NULL,
  permissions TEXT,                  -- JSON of granted permissions
  created_at INTEGER DEFAULT (unixepoch())
);
```

### 1.4 API Endpoints

```
POST /api/github/app/callback     - Handle OAuth callback for app installation
GET  /api/github/app/install      - Redirect to GitHub App installation
GET  /api/github/app/repos        - List repos accessible via installations
POST /api/github/app/token        - Generate installation access token
DELETE /api/github/app/installation/:id - Revoke installation
```

### 1.5 Installation Flow

1. User clicks "Connect Repository" for code battle
2. If no installation → redirect to GitHub App install page
3. User selects repos to grant access
4. GitHub redirects back with `installation_id`
5. We store installation, fetch accessible repos
6. User can now select from those repos for trials

---

## Phase 2: Container Credential Injection ✅ COMPLETE

### 2.1 Token Generation Strategy

**Important:** GitHub installation tokens expire after 1 hour. For trials that may run longer, we use **just-in-time token generation** - get the token right before we need it for git operations, not at trial start.

**Implemented in:** `src/lib/github/app.ts`

```typescript
// Get token scoped to specific repo
const { token } = await getRepoToken("owner/repo", userId);
```

**Token usage timeline:**
1. Trial starts - NO token needed yet
2. Container clones repo - Use token (generate fresh)
3. Gladiators run - NO token needed (local git operations)
4. Git push - Generate FRESH token right before push

This way, even a 4-hour trial won't hit token expiration.

### 2.2 Git Authentication (Simplified)

Instead of credential helpers, we embed the token directly in the git URL:

**Implemented in:** `src/lib/git/worktree.ts`

```typescript
// Clone with embedded auth
const url = new URL(repoUrl);
url.username = "x-access-token";
url.password = token;
await container.exec(["git", "clone", url.toString(), "/workspace/repo"]);

// Push with fresh token
const freshToken = await getRepoToken(repoFullName, userId);
url.password = freshToken;
await container.exec(["git", "-C", REPO_PATH, "push", url.toString(), ...branches]);
```

**Benefits:**
- No credential helper configuration needed
- Token never stored in container filesystem
- Fresh token generated just-in-time for each operation

### 2.3 Git Identity Configuration

**Implemented in:** `cloneRepo()` function

```typescript
await container.exec(["git", "-C", REPO_PATH, "config", "user.email", "gladiator@thunderdome.app"]);
await container.exec(["git", "-C", REPO_PATH, "config", "user.name", "Thunderdome Gladiator"]);
```

---

## Phase 3: Claude Agent SDK in Container

### 3.1 Container Image Requirements

The container image needs:
- `git` CLI
- `claude` CLI (Claude Agent SDK)
- Language runtimes as needed (Node, Python, etc.)
- Standard build tools

```dockerfile
FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    git curl build-essential \
    nodejs npm python3 python3-pip

# Install Claude Agent SDK
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /workspace
```

### 3.2 Gladiator Execution

```typescript
async function executeGladiator(
  container: TrialContainer,
  gladiator: Gladiator,
  worktreePath: string,
  prompt: string
): Promise<AsyncGenerator<GladiatorEvent>> {
  // Stream claude execution
  const stream = container.execStream([
    'claude',
    '--dangerously-skip-permissions',  // Non-interactive
    '--output-format', 'stream-json',
    '--prompt', prompt,
    '--allowedTools', 'Edit,Write,Bash,Read,Glob,Grep',
    '--cwd', worktreePath
  ]);

  for await (const chunk of stream) {
    yield parseClaudeEvent(chunk);
    await broadcastToClient(gladiator.id, chunk);
  }
}
```

### 3.3 Stream Handling Refactor

Current `execStream` in `container.ts` needs callback support:

```typescript
async function* execStream(
  command: string[],
  options?: { onStdout?: (data: string) => void }
): AsyncGenerator<{ type: 'stdout' | 'stderr'; data: string }> {
  const exec = await this.container.exec({
    Cmd: command,
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await exec.start({ hijack: true, stdin: false });

  // Demux and yield chunks
  for await (const chunk of demuxStream(stream)) {
    yield chunk;
    options?.onStdout?.(chunk.data);
  }
}
```

---

## Phase 4: Orchestrator Wiring

### 4.1 Remove Blockers

```typescript
// orchestrator.ts - REMOVE these lines:
// @ts-nocheck - Code battle mode not fully implemented yet
// throw new Error("Code battle mode not implemented");
```

### 4.2 Full Execution Flow

```typescript
async function runCodeBattle(
  trialId: string,
  userId: string,
  claudeToken: string
): Promise<void> {
  const trial = await getTrial(trialId);
  const gladiators = await getGladiators(trialId);

  // 1. Get GitHub App installation token
  const githubToken = await getInstallationToken(trial.repoUrl, userId);

  // 2. Create container with credentials
  const container = await createContainer(BATTLE_IMAGE, trial.repoUrl, {
    githubToken,
    claudeApiKey: claudeToken,
    gitEmail: 'gladiator@thunderdome.app',
    gitName: 'Thunderdome',
  });

  // 3. Clone repo
  await container.exec(['git', 'clone', trial.repoUrl, '/workspace/repo']);

  // 4. Run setup script
  const setup = await getRepoSetup(trial.repoUrl, userId);
  await container.exec(['bash', '-c', setup.setupSh]);

  // 5. Create worktrees for each gladiator
  for (const gladiator of gladiators) {
    await createWorktree(container, {
      trialId,
      gladiatorId: gladiator.id,
      gladiatorName: gladiator.name,
    });
  }

  // 6. Run gladiators in parallel
  await Promise.all(gladiators.map(g =>
    executeGladiator(container, g, `/workspace/${slugify(g.name)}`, trial.prompt)
  ));

  // 7. Commit and push all branches
  for (const gladiator of gladiators) {
    await commitGladiatorWork(container, gladiator);
  }
  await pushAllWorktrees(container, trial.repoUrl);

  // 8. Cleanup
  await container.destroy();

  // 9. Mark trial complete
  await updateTrialStatus(trialId, 'COMPLETED');
}
```

---

## Phase 5: Testing & Polish

- [ ] Unit tests for GitHub App token generation
- [ ] Integration tests for container credential injection
- [ ] E2E test: full code battle flow
- [ ] Error handling: container crashes, git conflicts, rate limits
- [ ] Timeout handling: kill containers that exceed time limit
- [ ] Cleanup: ensure containers are destroyed on error
- [ ] Audit logging: track all git operations

---

## Security Considerations

1. **Token Scoping**: Installation tokens scoped to specific repos only
2. **Short-lived Tokens**: GitHub App tokens expire in 1 hour
3. **Container Isolation**: Dropped capabilities, memory limits, no network to other containers
4. **No Token Logging**: Never log tokens to stdout/stderr
5. **Credential Cleanup**: Tokens not persisted in container filesystem
6. **Rate Limiting**: Respect GitHub API rate limits (5000/hr per installation)

---

## Files Modified

| File | Status | Changes |
|------|--------|---------|
| `.env.example` | ✅ Done | Added GitHub App env vars |
| `src/db/schema.ts` | ✅ Done | Added `githubAppInstallations`, `githubAppRepos` tables |
| `src/lib/github/app.ts` | ✅ Done | GitHub App client, token generation, repo sync |
| `src/app/api/github/app/*` | ✅ Done | Installation endpoints (install, callback, repos, installations) |
| `src/lib/git/worktree.ts` | ✅ Done | Fixed worktree creation, added cloneRepo, token-in-URL auth |
| `README.md` | ✅ Done | GitHub App setup instructions |
| `src/lib/docker/container.ts` | 🔲 TODO | Add credential injection (env vars for Claude API key) |
| `src/lib/trial/code-battle/orchestrator.ts` | 🔲 TODO | Remove blockers, wire up flow |
| `src/lib/trial/code-battle/gladiators.ts` | 🔲 TODO | Real Claude execution |
| `src/components/trials/repo-selector.tsx` | 🔲 TODO | Show only App-accessible repos |
