# Issue 12 Implementation Notes

## Completed Tasks

### 1. Worktree Management (`src/lib/git/worktree.ts`)
✅ Implemented `createWorktree`, `pushWorktree`, and `pushAllWorktrees` functions
✅ Added `slugify` helper for branch name generation

### 2. Code Battle Gladiator Runner (`src/lib/trial/code-battle/gladiators.ts`)
✅ Implemented `runCodeBattleGladiator` function
✅ Creates worktree and runs Claude agent inside container
✅ Commits changes and stores FINDINGS.md
✅ Broadcasts status updates via SSE

### 3. Code Battle Orchestrator (`src/lib/trial/code-battle/orchestrator.ts`)
✅ Implemented `runCodeBattle` function
✅ Spawns container, runs setup, and runs gladiators in parallel
✅ Pushes branches and destroys container
✅ Transitions to arbiter phase after completion

### 4. FINDINGS Template (`src/lib/trial/code-battle/findings-template.ts`)
✅ Exported `FINDINGS_TEMPLATE` constant
✅ Implemented `createFindingsPromptAddition` function

### 5. Trial Start Route Update (`src/app/api/trials/[id]/start/route.ts`)
✅ Added code_battle handling
✅ Checks for repo setup existence
✅ Calls `runCodeBattle` for trials with repo URLs

### 6. Branch Viewer Component (`src/components/trials/branch-viewer.tsx`)
✅ Shows gladiator branches with GitHub links
✅ Highlights winner
✅ Provides "Create PR for Winner" button

### 7. Container Infrastructure (Dependency from Issue 10)
Since container infrastructure was not yet implemented, also created:
✅ `src/lib/docker/client.ts` - Docker connection
✅ `src/lib/docker/container.ts` - Container lifecycle management
✅ `src/lib/trial/container-service.ts` - High-level trial container operations

### 8. Dependencies
✅ Installed `dockerode` and `@types/dockerode`
✅ Updated `next.config.ts` to mark dockerode as server-external package

## Known Issues

### Build Warnings
The build currently fails due to **pre-existing issues** in the codebase (not related to this PR):

1. **Import Extension Issue**: `src/lib/trial/arbiter/index.ts` uses `.js` extensions in imports (e.g., `from '../../../db/index.js'`), but the actual files are `.ts`. This is a TypeScript/Turbopack compatibility issue that exists before this PR.

2. **TypeScript Validation**: All new code added in this PR passes TypeScript type checking with `npx tsc --noEmit --skipLibCheck`.

These build issues should be addressed separately as they affect the entire codebase, not just this feature.

## Testing Notes

To test this implementation:

1. **Container Setup**: Ensure Docker is running and the `trial-base:latest` image exists
2. **Setup Discovery**: Run setup discovery for a repository first (Issue 11)
3. **Create Trial**: Create a trial with a repository URL
4. **Start Battle**: Start the trial to trigger the code battle flow

## Security Considerations

✅ All code runs inside ephemeral containers
✅ Containers destroyed after branches pushed
✅ Resource limits enforced (2GB RAM, 1 CPU)
✅ Tokens passed via environment, not persisted
✅ Minimal Linux capabilities (only CHOWN, SETUID, SETGID for git)

## Architecture

```
Trial Start (with repo URL)
    ↓
Check Repo Setup Exists
    ↓
Start Container
    ↓
Run Setup Script
    ↓
Create Worktrees (one per gladiator)
    ↓
Run Gladiators in Parallel
    ↓
Commit Changes + FINDINGS.md
    ↓
Push All Branches
    ↓
Destroy Container
    ↓
Transition to Arbiter Phase
```

## Files Created

- `src/lib/git/worktree.ts`
- `src/lib/trial/code-battle/findings-template.ts`
- `src/lib/trial/code-battle/gladiators.ts`
- `src/lib/trial/code-battle/orchestrator.ts`
- `src/lib/docker/client.ts`
- `src/lib/docker/container.ts`
- `src/lib/trial/container-service.ts`
- `src/components/trials/branch-viewer.tsx`

## Files Modified

- `src/app/api/trials/[id]/start/route.ts` - Added code battle handling
- `next.config.ts` - Added server external packages for Docker
- `package.json` - Added dockerode dependencies
