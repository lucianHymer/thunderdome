# ⚡ Thunderdome Orchestration Plan

> How to execute issues in parallel using sub-agents

## Overview

This document describes how a master agent can orchestrate sub-agents to work on Thunderdome issues in parallel, using separate git worktrees for isolation.

## Issue Dependency Graph

```
                    Issue 0 (DONE)
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
      Issue 1         Issue 2         Issue 3
   (Foundation)      (Auth)         (SDK)
         │               │               │
         └───────┬───────┴───────────────┘
                 │
         ┌───────┼───────┐
         ▼       ▼       ▼
      Issue 4  Issue 5  Issue 8
      (API)  (Lanista) (Battle UI)
         │       │
         │       ▼
         │    Issue 6
         │  (Gladiators)
         │       │
         └───┬───┘
             │
             ▼
         Issue 7
    (Arbiter & Judges)
             │
             ▼
         Issue 9
    (Results & Consul)
             │
     ════════════════════
        MVP COMPLETE
     ════════════════════
             │
    ┌────────┼────────┐
    ▼        ▼        ▼
 Issue 10  Issue 11  Issue 12
(Container)(Setup)  (Code Battle)
```

## Execution Waves

### Wave 1: Foundation (3 parallel agents)
**No dependencies, start immediately**

| Issue | Agent | Worktree Branch |
|-------|-------|-----------------|
| Issue 1: Project Foundation | Agent-1 | `issue-1-foundation` |
| Issue 2: Authentication | Agent-2 | `issue-2-auth` |
| Issue 3: Claude SDK Integration | Agent-3 | `issue-3-sdk` |

**Wave 1 Completion Criteria:**
- All three branches merged to main
- `npm run dev` works
- Database migrations run
- Auth flow works
- SDK wrapper exports work

### Wave 2: Core Features (3 parallel agents)
**Depends on Wave 1 completion**

| Issue | Agent | Worktree Branch |
|-------|-------|-----------------|
| Issue 4: Trial Management API | Agent-1 | `issue-4-trial-api` |
| Issue 5: Lanista Implementation | Agent-2 | `issue-5-lanista` |
| Issue 8: Battle View UI | Agent-3 | `issue-8-battle-ui` |

**Wave 2 Completion Criteria:**
- Trial CRUD works
- Lanista produces gladiator designs
- Battle view renders with streaming

### Wave 3: Battle Engine (2 parallel agents)
**Depends on Wave 2 completion**

| Issue | Agent | Worktree Branch |
|-------|-------|-----------------|
| Issue 6: Gladiator Execution | Agent-1 | `issue-6-gladiators` |
| Issue 7: Arbiter & Judges | Agent-2 | `issue-7-judges` |

**Note:** Issue 7 needs Issue 6's output format, so there's a soft dependency. Agent-2 can start with Arbiter prompts while waiting for gladiator output format to stabilize.

**Wave 3 Completion Criteria:**
- Gladiators run in parallel, stream output
- Arbiter designs judges from outputs
- Judges evaluate and produce verdict

### Wave 4: Consul & MVP Complete (1 agent)
**Depends on Wave 3 completion**

| Issue | Agent | Worktree Branch |
|-------|-------|-----------------|
| Issue 9: Results & Consul | Agent-1 | `issue-9-consul` |

**Wave 4 Completion Criteria:**
- Results view shows verdict
- Consul dialogue works
- Export report works
- **MVP IS COMPLETE** 🎉

### Wave 5: Code Battles (3 parallel agents)
**Depends on MVP completion (Wave 4)**

| Issue | Agent | Worktree Branch |
|-------|-------|-----------------|
| Issue 10: Container Orchestration | Agent-1 | `issue-10-containers` |
| Issue 11: Setup Discovery | Agent-2 | `issue-11-setup` |
| Issue 12: Code Battle Mode | Agent-3 | `issue-12-code-battle` |

**Note:** Issues 11 and 12 depend on Issue 10. Agent-2 and Agent-3 can start with non-container-dependent work while Agent-1 completes container setup.

**Wave 5 Completion Criteria:**
- Containers spin up/destroy
- Setup discovery works
- Full code battle flow works
- **FULL IMPLEMENTATION COMPLETE** 🏆

---

## Master Agent Instructions

### Setup

```bash
# Clone repo
git clone git@github.com:lucianHymer/thunderdome.git
cd thunderdome

# Create worktrees for each wave
# (Example for Wave 1)
git worktree add ../thunderdome-issue-1 -b issue-1-foundation
git worktree add ../thunderdome-issue-2 -b issue-2-auth
git worktree add ../thunderdome-issue-3 -b issue-3-sdk
```

### Running Sub-Agents

For each agent, spawn with:

```bash
# Example: Agent working on Issue 1
cd ../thunderdome-issue-1
claude --prompt "Implement Issue 1: Project Foundation. See /issues/issue-1-foundation.md for full spec. Merge to main when complete."
```

### Merge Protocol

1. Agent completes work on branch
2. Agent creates PR to main
3. Master agent reviews PR (or auto-merge if tests pass)
4. After merge, delete worktree: `git worktree remove ../thunderdome-issue-X`

### Handling Conflicts

When merging causes conflicts:

1. Master agent pulls main into feature branch
2. Resolves conflicts (or delegates to relevant sub-agent)
3. Re-tests
4. Merges

### Wave Transition

Before starting next wave:

1. All previous wave PRs merged
2. Main branch builds and tests pass
3. Create new worktrees for next wave

---

## Timing Estimates

| Wave | Issues | Est. Parallel Time |
|------|--------|-------------------|
| Wave 1 | 3 | 2-3 hours |
| Wave 2 | 3 | 2-3 hours |
| Wave 3 | 2 | 2-3 hours |
| Wave 4 | 1 | 1-2 hours |
| **MVP Total** | **9** | **7-11 hours** |
| Wave 5 | 3 | 3-4 hours |
| Wave 6 | 1 | 1-2 hours |
| **Full Total** | **13** | **11-17 hours** |

With perfect parallelization and no conflicts, MVP could be done in under a day of agent time.

---

## Quick Reference

### Wave 1 (Foundation)
- [ ] Issue 1: Project Foundation
- [ ] Issue 2: Authentication System
- [ ] Issue 3: Claude Agent SDK Integration

### Wave 2 (Core)
- [ ] Issue 4: Trial Management API
- [ ] Issue 5: Lanista Implementation
- [ ] Issue 8: Battle View UI

### Wave 3 (Battle Engine)
- [ ] Issue 6: Gladiator Execution Engine
- [ ] Issue 7: Arbiter & Judge System

### Wave 4 (MVP Complete)
- [ ] Issue 9: Results & Consul UI

### Wave 5 (Code Battles)
- [ ] Issue 10: Container Orchestration
- [ ] Issue 11: Setup Discovery
- [ ] Issue 12: Code Battle Mode

### Wave 6 (Final Polish)
- [ ] Issue 13: Biome Setup & Repo Cleanup

---

## Files Reference

| Issue | Spec File |
|-------|-----------|
| Issue 0 | `issues/issue-0-infrastructure.md` |
| Issue 1 | GitHub #1 (inline) |
| Issue 2 | GitHub #2 (inline) |
| Issue 3 | GitHub #3 (inline) |
| Issue 4 | `issues/issue-4-trial-api.md` |
| Issue 5 | `issues/issue-5-lanista.md` |
| Issue 6 | `issues/issue-6-gladiator-engine.md` |
| Issue 7 | `issues/issue-7-arbiter-judges.md` |
| Issue 8 | `issues/issue-8-battle-view-ui.md` |
| Issue 9 | `issues/issue-9-results-consul.md` |
| Issue 10 | `issues/issue-10-container-orchestration.md` |
| Issue 11 | `issues/issue-11-setup-discovery.md` |
| Issue 12 | `issues/issue-12-code-battle-mode.md` |
| Issue 13 | `issues/issue-13-biome-cleanup.md` |

---

*Ave, Editor. Let the orchestration begin.* ⚡
