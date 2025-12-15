# ⚡ Thunderdome Orchestrator Instructions

> Instructions for the master orchestrator agent to build Thunderdome using parallel sub-agents

---

## 🚨 CRITICAL: SUB-AGENT USAGE RULES 🚨

**READ THIS FIRST - DO NOT SKIP**

### Rule 1: ALWAYS Use BLOCKING Sub-Agents

When spawning sub-agents via the Task tool, **ALWAYS use blocking mode** (do NOT set `run_in_background: true`).

**WHY?** Non-blocking agents require periodic status checks that rapidly fill orchestrator context with incremental results. This wastes your most valuable resource - orchestrator context.

```
✅ CORRECT: Spawn blocking sub-agents in parallel (single message, multiple Task calls)
❌ WRONG: Spawn non-blocking sub-agents and poll for status
```

### Rule 2: Keep Orchestrator Context CLEAN

The orchestrator's job is to:
- Read issues and understand scope
- Create worktrees
- Spawn sub-agents with complete instructions
- Receive completion reports
- Test/verify results
- Merge to main

**DO NOT** do the actual implementation work in orchestrator context. That's what sub-agents are for.

### Rule 3: Delegate Conflict Resolution to Sub-Agents

When rebasing causes conflicts, spawn a sub-agent to resolve them:
```
"You are resolving merge conflicts in [worktree].
The branch has been rebased on main and has conflicts.
Resolve all conflicts, run npm run build to verify, then commit."
```

### Rule 4: Complete Instructions = Better Results

Give sub-agents ALL context they need upfront:
- Full issue content
- Working directory path
- Branch name
- Environment variables
- Any dependencies on other work
- Expected deliverables

---

## Your Mission

You are the **Orchestrator**. Your job is to coordinate multiple sub-agents working in parallel to build Thunderdome. Each sub-agent works on a separate git worktree, and you are responsible for:

1. Reading and understanding all issues
2. Creating worktrees for parallel work
3. Spawning sub-agents with clear instructions
4. Testing that each piece works before merging
5. Merging completed work to main continuously
6. Resolving conflicts via rebase as they arise
7. Ensuring the final result is a clean main branch with everything working

## Setup

### 1. Clone the Repository

```bash
git clone git@github.com:lucianHymer/thunderdome.git
cd thunderdome
```

### 2. Read All Issues

Before starting, read every issue file to understand the full scope:

```
issues/
├── issue-0-infrastructure.md    # DONE - server is set up
├── issue-4-trial-api.md
├── issue-5-lanista.md
├── issue-6-gladiator-engine.md
├── issue-7-arbiter-judges.md
├── issue-8-battle-view-ui.md
├── issue-9-results-consul.md
├── issue-10-container-orchestration.md
├── issue-11-setup-discovery.md
├── issue-12-code-battle-mode.md
└── issue-13-biome-cleanup.md
```

Issues 1, 2, 3 are in GitHub only (they were created inline). Fetch them:
```bash
gh issue view 1 --repo lucianHymer/thunderdome
gh issue view 2 --repo lucianHymer/thunderdome
gh issue view 3 --repo lucianHymer/thunderdome
```

### 3. Understand Dependencies

```
Wave 1 (parallel): Issues 1, 2, 3
Wave 2 (parallel): Issues 4, 5, 8
Wave 3 (parallel): Issues 6, 7
Wave 4 (sequential): Issue 9
Wave 5 (parallel): Issues 10, 11, 12
Wave 6 (sequential): Issue 13
```

---

## Execution Protocol

### For Each Wave

#### Step 1: Create Worktrees

For each issue in the wave, create a worktree:

```bash
# Example for Wave 1
git worktree add ../thunderdome-issue-1 -b issue-1-foundation main
git worktree add ../thunderdome-issue-2 -b issue-2-auth main
git worktree add ../thunderdome-issue-3 -b issue-3-sdk main
```

#### Step 2: Spawn Sub-Agents

For each worktree, spawn a sub-agent with these instructions:

```
You are working on [ISSUE TITLE].

## Your Task
[Paste the full issue content here]

## Critical Rules
1. Work ONLY in this worktree directory
2. Commit frequently with clear messages
3. Test your work before declaring done
4. When complete, run: npm run build && npm run lint (if available)
5. Do NOT merge to main yourself - the orchestrator will do that
6. Create a PR when done: gh pr create --base main --head [branch-name]

## Working Directory
[WORKTREE PATH]

## Branch
[BRANCH NAME]

Begin implementation now.
```

#### Step 3: Monitor Progress

Check on sub-agents periodically:
- Are they making progress?
- Are they stuck on something?
- Do they need clarification?

#### Step 4: Test Before Merging

When a sub-agent reports completion:

```bash
cd ../thunderdome-issue-X

# Run tests
npm run build
npm run lint  # (after Issue 13)
npm test      # (if tests exist)

# Manual smoke test if needed
npm run dev
# Verify the feature works
```

#### Step 5: Merge to Main

After testing passes:

```bash
cd ../thunderdome  # main worktree

# Fetch the branch
git fetch origin issue-X-branch

# Merge (use --no-ff for clear history)
git merge --no-ff issue-X-branch -m "Merge Issue X: [Title]"

# Push main
git push origin main
```

#### Step 6: Clean Up Worktree

```bash
git worktree remove ../thunderdome-issue-X
git branch -d issue-X-branch
```

#### Step 7: Rebase Other Active Branches

After merging to main, rebase all other active worktrees:

```bash
# For each active worktree
cd ../thunderdome-issue-Y
git fetch origin main
git rebase origin/main

# If conflicts, resolve them
# Then continue: git rebase --continue
```

---

## Wave-by-Wave Execution

### Wave 1: Foundation (Issues 1, 2, 3) ✅ COMPLETE

**Goal**: Project scaffolding, auth, and SDK wrapper

**Status**: MERGED TO MAIN
- PR #14: Issue 1 (Foundation) - merged
- PR #15: Issue 2 (Auth) - merged
- PR #16: Issue 3 (SDK) - merged

**Create worktrees**:
```bash
git worktree add ../thunderdome-issue-1 -b issue-1-foundation main
git worktree add ../thunderdome-issue-2 -b issue-2-auth main
git worktree add ../thunderdome-issue-3 -b issue-3-sdk main
```

**Spawn 3 sub-agents in parallel**

**Test criteria before merging each**:
- Issue 1: `npm run dev` works, database migrations run, shadcn components render
- Issue 2: Can sign in with GitHub, session persists, can save Claude token
- Issue 3: Can import SDK wrapper, streaming works in a test script

**Merge order**: 1 → 2 → 3 (rebase after each merge)

**After Wave 1**: Main branch has working Next.js app with auth and SDK wrapper

---

### Wave 2: Core Features (Issues 4, 5, 8)

**Goal**: Trial API, Lanista, and Battle UI

**Create worktrees**:
```bash
git worktree add ../thunderdome-issue-4 -b issue-4-trial-api main
git worktree add ../thunderdome-issue-5 -b issue-5-lanista main
git worktree add ../thunderdome-issue-8 -b issue-8-battle-ui main
```

**Spawn 3 sub-agents in parallel**

**Test criteria**:
- Issue 4: Can create trial via API, SSE streaming works, state machine transitions
- Issue 5: Lanista produces valid gladiator designs (test with mock)
- Issue 8: Battle view renders, tabs work, status updates

**Merge order**: 4 → 5 → 8

**After Wave 2**: Can create trials and see UI, Lanista ready to design gladiators

---

### Wave 3: Battle Engine (Issues 6, 7)

**Goal**: Gladiator execution and judge system

**Create worktrees**:
```bash
git worktree add ../thunderdome-issue-6 -b issue-6-gladiators main
git worktree add ../thunderdome-issue-7 -b issue-7-judges main
```

**Spawn 2 sub-agents in parallel**

**Note**: Issue 7 has soft dependency on Issue 6's output format. Agent 7 can start with Arbiter prompts while Agent 6 finalizes gladiator output structure.

**Test criteria**:
- Issue 6: Multiple gladiators run in parallel, output streams to DB
- Issue 7: Arbiter designs judges, judges evaluate, verdict synthesized

**Merge order**: 6 → 7

**After Wave 3**: Full battle flow works (Lanista → Gladiators → Arbiter → Judges → Verdict)

---

### Wave 4: MVP Complete (Issue 9)

**Goal**: Results view and Consul dialogue

**Create worktree**:
```bash
git worktree add ../thunderdome-issue-9 -b issue-9-consul main
```

**Spawn 1 sub-agent**

**Test criteria**:
- Results view shows verdict
- Consul dialogue streams responses
- Export report works

**After Wave 4**: **MVP IS COMPLETE** 🎉

**Verification**: Run a full trial end-to-end:
1. Sign in
2. Create ideation trial
3. Watch gladiators battle
4. See verdict
5. Chat with Consul
6. Export report

---

### Wave 5: Code Battles (Issues 10, 11, 12)

**Goal**: Container orchestration and full code battle mode

**Create worktrees**:
```bash
git worktree add ../thunderdome-issue-10 -b issue-10-containers main
git worktree add ../thunderdome-issue-11 -b issue-11-setup main
git worktree add ../thunderdome-issue-12 -b issue-12-code-battle main
```

**Spawn 3 sub-agents**

**Note**: Issues 11 and 12 depend on Issue 10. Agents 11 and 12 can work on non-container code first, then integrate once Agent 10 merges.

**Merge order**: 10 → 11 → 12

**Test criteria**:
- Issue 10: Can spawn container, run commands, destroy container
- Issue 11: Setup discovery streams, generates setup files
- Issue 12: Full code battle works, branches pushed to GitHub

**After Wave 5**: **FULL IMPLEMENTATION COMPLETE** 🏆

---

### Wave 6: Final Polish (Issue 13)

**Goal**: Biome linting and repo cleanup

**Create worktree**:
```bash
git worktree add ../thunderdome-issue-13 -b issue-13-cleanup main
```

**Spawn 1 sub-agent with special instructions**:
```
You are doing final cleanup on Thunderdome.

1. Set up Biome for linting/formatting
2. Run biome check --write . to fix all issues
3. Remove ESLint/Prettier if present
4. Delete unnecessary files:
   - issues/*.md (already in GitHub)
   - ORCHESTRATOR.md
   - Any other cruft
5. Consolidate to one good README.md
6. Run depcheck, remove unused deps
7. Final npm run build && npm run lint must pass

Leave the repo clean and production-ready.
```

**Test criteria**:
- `npm run lint` passes with no errors
- `npm run build` succeeds
- Only essential files remain
- README is comprehensive

**After Wave 6**: **SHIP IT** 🚀

---

## Conflict Resolution Protocol

When rebasing causes conflicts:

1. **Identify the conflict**:
   ```bash
   git status
   ```

2. **Understand both sides**: Read the conflicting changes

3. **Resolve intelligently**:
   - If both changes are needed, combine them
   - If one supersedes the other, keep the correct one
   - If unsure, consult the relevant issue specs

4. **Test after resolving**:
   ```bash
   npm run build
   ```

5. **Continue rebase**:
   ```bash
   git add .
   git rebase --continue
   ```

---

## Communication Protocol

### Sub-Agent Status Updates

Instruct sub-agents to output status updates:
- `[STARTED]` - Beginning work
- `[PROGRESS]` - Meaningful milestone reached
- `[BLOCKED]` - Need help or clarification
- `[TESTING]` - Running tests
- `[COMPLETE]` - Ready for review/merge

### When Sub-Agent is Blocked

If a sub-agent reports `[BLOCKED]`:
1. Read their explanation
2. Check if another sub-agent's work would unblock them
3. Provide guidance or adjust the plan
4. Consider merging dependencies first

---

## Environment Setup

Each sub-agent needs these environment variables (provide them):

```bash
# Database (same for all - they share the DB)
DATABASE_URL=postgresql://thunderdome:PASSWORD@localhost:5432/thunderdome

# GitHub OAuth
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx

# NextAuth
NEXTAUTH_SECRET=xxx
NEXTAUTH_URL=http://localhost:3000

# Encryption
ENCRYPTION_KEY=xxx

# Claude (each agent needs a valid token for testing)
CLAUDE_CODE_OAUTH_TOKEN=xxx
```

---

## Success Criteria

Before declaring victory:

- [ ] All 13 issues merged to main
- [ ] `npm run build` passes
- [ ] `npm run lint` passes (after Issue 13)
- [ ] Can run full ideation trial end-to-end
- [ ] Can run full code battle end-to-end
- [ ] No extraneous files or branches
- [ ] README is accurate and helpful
- [ ] Main branch is clean (no merge conflicts, no broken commits)

---

## Timeline Estimate

| Wave | Issues | Parallel Agents | Est. Time |
|------|--------|-----------------|-----------|
| 1 | 1, 2, 3 | 3 | 2-3 hours |
| 2 | 4, 5, 8 | 3 | 2-3 hours |
| 3 | 6, 7 | 2 | 2-3 hours |
| 4 | 9 | 1 | 1-2 hours |
| 5 | 10, 11, 12 | 3 | 3-4 hours |
| 6 | 13 | 1 | 1-2 hours |
| **Total** | **13** | **Max 3 at once** | **11-17 hours** |

With efficient parallelization, the full implementation can be completed in under a day of agent compute time.

---

## Begin

1. Read all issue files
2. Set up environment variables
3. Create Wave 1 worktrees
4. Spawn Wave 1 sub-agents
5. Monitor, test, merge, repeat

*Ave, Orchestrator. The arena awaits.* ⚡
