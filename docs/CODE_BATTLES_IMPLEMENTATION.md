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

### Recently Completed
- [x] **Setup Discovery Integration in Trial Creation Flow**
  - Frontend checks if setup exists when repo is selected
  - Shows status badges: "Checking...", "Setup ready", "Setup needed"
  - Prompts user to run setup discovery if missing
  - Setup discovery auto-clones repo (no local path needed)
  - Saves setup to DB, then trial can proceed

---

## Phase 1: GitHub App Integration ✅ COMPLETE

### Single GitHub App for Everything

We use ONE GitHub App for both user login (OAuth) and repo access (installations).
No separate OAuth App needed.

| Old Approach (2 apps) | New Approach (1 app) |
|----------------------|----------------------|
| OAuth App for login | GitHub App OAuth for login |
| GitHub App for repos | Same app for repo access |
| 2 sets of credentials | 3 credentials total |

### 1.1 Create GitHub App

**Settings to configure:**

```
Name: Thunderdome
Homepage URL: https://your-domain.com
Callback URL: https://your-domain.com/api/auth/callback/github  (for OAuth login)
Setup URL: https://your-domain.com/api/github/app/callback      (post-install redirect)
Webhook: Disabled (unless you want push notifications)
```

**Permissions needed:**
- Repository permissions:
  - Contents: Read & Write (for git push)
  - Metadata: Read (required)

**User authorization:**
- Enable "Request user authorization (OAuth) during installation"

### 1.2 Environment Variables

```env
# Single GitHub App handles both login AND repo access
GITHUB_APP_CLIENT_ID=Iv1.xxxx      # Client ID (used for OAuth + JWT)
GITHUB_APP_CLIENT_SECRET=xxxx      # Client secret (for OAuth login)
GITHUB_APP_PRIVATE_KEY=base64...   # Private key (for installation tokens)
```

Note: GitHub recommends using Client ID (not App ID) for JWT generation.
See: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app

### 1.3 Database Schema

**Implemented in:** `src/db/schema.ts`

- `github_app_installations` - Tracks user's app installations
- `github_app_repos` - Caches repos accessible per installation

### 1.4 API Endpoints

**Implemented in:** `src/app/api/github/app/*`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/github/app/install` | GET | Redirect to GitHub App installation |
| `/api/github/app/callback` | GET | Handle post-installation redirect |
| `/api/github/app/repos` | GET | List repos accessible via installations |
| `/api/github/app/repos` | POST | Sync/refresh repos from GitHub |
| `/api/github/app/installations` | GET | List user's installations |
| `/api/github/app/installations/:id` | DELETE | Remove installation tracking |

### 1.5 User Onboarding Flow

1. User clicks "Sign in with GitHub" → OAuth via GitHub App
2. User is logged in (no repo access yet)
3. User creates code battle → prompted to "Install Thunderdome"
4. User selects repos to grant access
5. GitHub redirects back → installation saved, repos synced
6. User can now run code battles on those repos

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
| `src/app/api/repos/[owner]/[repo]/setup/route.ts` | ✅ Done | Auto-clones repo for setup discovery (no local path needed) |
| `src/components/setup/setup-discovery.tsx` | ✅ Done | Simplified - no workingDir prop needed |
| `src/components/trials/new-trial-form.tsx` | ✅ Done | Checks setup status, shows discovery UI when needed |
| `src/lib/docker/container.ts` | 🔲 TODO | Add credential injection (env vars for Claude API key) |
| `src/lib/trial/code-battle/orchestrator.ts` | 🔲 TODO | Remove blockers, wire up flow |
| `src/lib/trial/code-battle/gladiators.ts` | 🔲 TODO | Real Claude execution |
| `src/components/trials/repo-selector.tsx` | 🔲 TODO | Show only App-accessible repos |
