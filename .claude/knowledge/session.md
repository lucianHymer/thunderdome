# Knowledge Capture Session - 2025-12-14

### [22:43] [auth] Claude Agent SDK authentication
**Details**: The Claude Agent SDK (@anthropic-ai/claude-agent-sdk) authenticates using CLAUDE_CODE_OAUTH_TOKEN. Generate the token with `claude setup-token` command from Claude Code CLI. Users store their token in settings, which is encrypted and passed to agents at runtime.
**Files**: issues/issue-0-infrastructure.md
---

### [00:02] [workflow] Use blocking sub-agents for large tasks
**Details**: When orchestrating large multi-issue tasks with the Task tool, NEVER use non-blocking sub-agents (run_in_background: true) and periodically check on them. This approach rapidly fills up context with status checks and partial results. Instead, use blocking sub-agents that complete fully before returning. For parallel work, spawn multiple blocking agents simultaneously in a single message - they will run in parallel but each will return complete results without polluting context with incremental checks.
**Files**: ORCHESTRATOR.md
---

### [00:23] [architecture] Lanista role and design philosophy
**Details**: The Lanista is the AI that designs gladiators for trials. Its energy is "offensive/creative" - it asks "what perspectives would create productive tension?"

Key design principles:
1. Productive Tension: Select perspectives that genuinely disagree
2. Coverage: Ensure all critical aspects covered by at least one gladiator
3. Diversity: Vary models, temperatures, toolsets
4. Feasibility: Give each gladiator the tools they need
5. Clarity: Make personas specific and actionable

The Lanista itself uses Claude Opus for strong reasoning and doesn't need tools - it just reasons about what perspectives to create.
**Files**: src/lib/trial/lanista/prompts.ts, src/lib/trial/lanista/index.ts
---

### [00:23] [pattern] Structured output with Zod schema validation
**Details**: The codebase uses runStructuredAgentWithRetry for getting validated structured output from Claude:

1. Define Zod schema (e.g., LanistaOutputSchema) in src/lib/claude/schemas.ts
2. Use runStructuredAgentWithRetry with the schema
3. Check result.success AND result.data (TypeScript doesn't narrow properly otherwise)
4. The function automatically retries on validation failures (default: 2 retries)

Important: Always check both result.success AND result.data to avoid TypeScript errors about possibly undefined data.
**Files**: src/lib/claude/structured.ts, src/lib/trial/lanista/index.ts
---

### [00:23] [database] Trial state transitions and gladiator creation
**Details**: Trial state flow for Lanista:
1. PENDING → PLANNING (when Lanista starts)
2. PLANNING → RUNNING (when gladiators are created)
3. Any state → FAILED (on error)

Gladiator creation pattern:
- Create records with: trialId, name, persona, model (mapped from opus/sonnet/haiku), temperature (stored as 0-100 integer), tools (JSON string), branchName
- Use .returning() to get inserted records with IDs
- Store Lanista's reasoning in trial.lanistaPlan as JSON

Temperature is stored as integer 0-100 in database but used as 0.0-1.0 in schemas.
**Files**: src/lib/trial/lanista/index.ts, src/db/schema.ts
---

### [00:23] [testing] Schema validation testing pattern
**Details**: For testing Zod schemas, create a simple test runner with:
1. test() function that catches errors and prints results
2. assert() helper for conditions
3. Use schema.safeParse() to test validation
4. Test both success and failure cases
5. Run with: npx tsx path/to/test.ts

No need for a full test framework - Node's built-in capabilities work fine for schema validation tests. This keeps the test dependencies minimal.
**Files**: src/lib/trial/lanista/__tests__/lanista.test.ts
---

### [00:23] [architecture] Trial State Machine Design
**Details**: The trial state machine follows a specific lifecycle: pending → lanista_designing → battling → arbiter_designing → judging → decree → complete, with any state able to transition to "failed". 

The state machine uses a dual-mapping system:
1. Internal states (e.g., "lanista_designing") map to database statuses (e.g., "PLANNING")
2. This allows for more granular state tracking than the database schema supports
3. The STATE_MAPPING constant maps states to their corresponding database status values

State transitions are validated before execution to ensure only valid transitions occur. When a state changes, the system:
1. Updates the database with the new status
2. Broadcasts the change to all SSE subscribers
3. Marks completedAt timestamp for terminal states (complete/failed)
**Files**: src/lib/trial/state.ts
---

### [00:23] [pattern] Next.js 16 Route Handler Params
**Details**: In Next.js 16, dynamic route parameters are now passed as Promises rather than synchronous objects. This is a breaking change from previous versions.

Correct pattern:
```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // use id...
}
```

Incorrect (old) pattern:
```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params.id; // TypeScript error in Next.js 16
}
```

This applies to all route handlers with dynamic segments like [id], [slug], etc.
**Files**: src/app/api/trials/[id]/route.ts, src/app/api/trials/[id]/stream/route.ts, src/app/api/trials/[id]/start/route.ts
---

### [00:23] [architecture] SSE Broadcasting with In-Memory Subscribers
**Details**: The SSE broadcasting system uses an in-memory Map structure to track subscribers:
- Map<trialId, Map<subscriberId, Subscriber>>
- Each subscriber has a ReadableStreamDefaultController and userId

The system handles:
1. Connection lifecycle: subscribe on connection, unsubscribe on disconnect
2. Broadcasting updates to all subscribers of a trial
3. Automatic cleanup of dead connections (when enqueue throws)
4. Clean shutdown of all subscriptions when a trial is deleted

SSE message format follows the standard:
```
data: {"type": "event_type", "trialId": "...", ...}\n\n
```

The stream endpoint combines an initial state message with the subscription stream to ensure clients receive current state immediately upon connection.
**Files**: src/lib/trial/broadcast.ts, src/app/api/trials/[id]/stream/route.ts
---

### [00:23] [pattern] React SSE Hook with Auto-Reconnect
**Details**: The useTrialStream hook implements a robust SSE client with:

1. EventSource connection management
2. Automatic reconnection with configurable max attempts and delay
3. Event history tracking
4. Lifecycle callbacks (onConnect, onDisconnect, onEvent, onError)

Key patterns:
- Uses refs for EventSource and reconnection timeout to avoid recreation on render
- Reconnect attempts are tracked separately from state
- Cleanup in useEffect ensures connections are closed when component unmounts
- Manual reconnect/disconnect functions for user control
- Enabled/disabled flag to conditionally connect

The hook automatically parses JSON from SSE events and maintains a complete event history for debugging and state recovery.
**Files**: src/hooks/use-trial-stream.ts
---

### [00:25] [architecture] Battle View UI Architecture
**Details**: The battle view UI is built with a streaming-first architecture:

1. **SSE Streaming Pattern**: Uses Server-Sent Events for real-time updates
   - Trial stream: Polls database every 2s for status changes
   - Gladiator stream: Polls every 1s for output updates
   - Auto-reconnection with exponential backoff (max 5 attempts)

2. **Component Hierarchy**:
   - Pages (server components) load initial data
   - BattleView (client) manages trial stream and tabs
   - GladiatorPanel (client) manages individual gladiator streams
   - StatusBanner shows current phase with animations

3. **Real-time Updates**: 
   - Trial status changes propagate via SSE
   - Gladiator output streams character-by-character
   - Auto-scroll to bottom on new content
   - Connection status indicators

4. **Styling**: Dark theme with status-based colors
   - Orange/yellow accents for fire/lightning feel
   - Pulsing animations during active phases
   - Monospace font for code output
**Files**: src/components/trials/battle-view.tsx, src/hooks/use-trial-stream.ts, src/hooks/use-gladiator-stream.ts, src/app/api/trials/[id]/stream/route.ts, src/app/api/gladiators/[id]/stream/route.ts
---

### [00:25] [pattern] Next.js 15+ Async Params Pattern
**Details**: Next.js 15+ requires async params in dynamic routes:

WRONG (old pattern):
```typescript
export async function GET(req, { params }: { params: { id: string } }) {
  const id = params.id; // Error!
}
```

CORRECT (new pattern):
```typescript
export async function GET(req, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // Must await!
}
```

This applies to:
- API route handlers (GET, POST, etc.)
- Page components with dynamic segments
- All [param] and [...param] routes

The build will fail with type errors if you use the old synchronous pattern.
**Files**: src/app/api/trials/[id]/stream/route.ts, src/app/api/gladiators/[id]/stream/route.ts, src/app/trials/[id]/page.tsx
---

### [00:25] [api] SSE Streaming Implementation
**Details**: Server-Sent Events implementation pattern in Next.js:

1. **Response Setup**:
```typescript
const encoder = new TextEncoder();
const stream = new ReadableStream({
  async start(controller) {
    // Send events with controller.enqueue()
  }
});
return new Response(stream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  },
});
```

2. **Event Format**:
```typescript
// Named event
const event = `event: status_change\ndata: ${JSON.stringify(data)}\n\n`;

// Generic message
const msg = `data: ${JSON.stringify(data)}\n\n`;
```

3. **Cleanup**:
```typescript
request.signal.addEventListener('abort', () => {
  clearInterval(interval);
  controller.close();
});
```

4. **Client Side** (EventSource):
```typescript
const eventSource = new EventSource('/api/endpoint');
eventSource.addEventListener('event_name', (e) => {
  const data = JSON.parse(e.data);
});
```
**Files**: src/app/api/trials/[id]/stream/route.ts, src/app/api/gladiators/[id]/stream/route.ts, src/hooks/use-trial-stream.ts
---

### [00:39] [architecture] Gladiator execution flow and parallel streaming
**Details**: The gladiator execution engine runs multiple AI agents in parallel using Claude SDK:

1. Fetches all gladiators from database for a trial
2. Runs each gladiator using runAgent from Claude SDK
3. Streams events in real-time to:
   - Gladiator-specific SSE subscribers (via broadcastGladiatorUpdate)
   - Trial-wide SSE subscribers (via broadcastTrialUpdate)
4. Stores complete stream log as JSON in database
5. Uses Promise.allSettled to run all gladiators in parallel
6. Aggregates costs across all gladiators using aggregateCosts
7. Transitions trial state to arbiter_designing when all complete
8. Handles individual gladiator failures gracefully without failing entire trial

Key design decisions:
- Default timeout: 30 minutes per gladiator
- Default max turns: 25
- Permission mode: bypassPermissions (autonomous execution)
- Temperature stored as 0-100 in DB, converted to 0-1 for Claude API
- Tools stored as JSON string array in database
**Files**: src/lib/trial/gladiators/index.ts, src/lib/trial/broadcast.ts
---

### [00:39] [pattern] Dual-level SSE broadcasting (trial + gladiator)
**Details**: The broadcasting system supports two levels of subscriptions:

1. Trial-level subscriptions (existing):
   - Subscribe with subscribeToTrial(trialId, userId)
   - Receive high-level trial events (battle started, gladiator progress, battle completed)
   - Good for dashboard/trial overview UI

2. Gladiator-level subscriptions (new):
   - Subscribe with subscribeToGladiator(gladiatorId, userId)
   - Receive detailed stream events from specific gladiator
   - Good for watching individual gladiator execution in detail

Both systems use the same infrastructure:
- In-memory Map<id, Map<subscriberId, Subscriber>>
- ReadableStream with controller
- Dead subscriber cleanup
- Automatic close on cancel

Events are broadcast to both levels simultaneously during gladiator execution for maximum flexibility.
**Files**: src/lib/trial/broadcast.ts
---

### [00:39] [pattern] Timeout handling for async generators
**Details**: Created timeout utilities that handle both promises and async generators:

1. withTimeout - Simple promise timeout wrapper
2. withStreamTimeout - Per-event timeout for async generators
   - Resets timeout on each yielded value
   - Useful for streaming where total time is unknown but events should be regular
3. withTotalTimeout - Total execution time limit for async generators
   - Checks elapsed time after each yield
   - Useful when you want to cap total execution time

All timeout utilities:
- Use custom TimeoutError class for identification
- Clean up generators properly on timeout (call generator.return())
- Clear setTimeout properly to avoid leaks
- Use Promise.race for timeout implementation

This is important for gladiators because they run indefinitely otherwise - we need per-gladiator timeouts to prevent runaway execution.
**Files**: src/lib/trial/gladiators/timeout.ts
---

### [00:39] [architecture] Arbiter & Judge System Design
**Details**: The Arbiter & Judge system implements a two-phase evaluation pipeline:

1. **Arbiter Phase**: The Arbiter analyzes actual gladiator outputs BEFORE designing judges. This evidence-based approach ensures judges are tailored to the specific challenge and outputs, not generic quality criteria.

2. **Judge Phase**: Judges run in parallel for efficiency, each evaluating all successful gladiators against specific criteria. They use structured output with Zod schemas (JudgeOutputSchema).

3. **Verdict Synthesis**: Winner is determined by averaging scores across all judges. This simple aggregation method is transparent and fair.

Key design decisions:
- Claude Opus used for both Arbiter and Judges (need strong analytical reasoning)
- Judges run in parallel via Promise.all() for speed
- StatusCallback type shared across all trial phases for consistent SSE broadcasting
- State transitions: arbiter_designing → judging → decree
- Judge evaluations stored in database with full output for audit trail
**Files**: src/lib/trial/arbiter/index.ts, src/lib/trial/judges/index.ts, src/lib/trial/types.ts
---

### [00:39] [pattern] Structured Output with Zod Schemas
**Details**: All AI agents in Thunderdome use structured output via runStructuredAgentWithRetry():

- Takes a Zod schema (e.g., ArbiterOutputSchema, JudgeOutputSchema)
- Automatically retries up to N times if validation fails
- Returns { success, data, error, cost } for type-safe handling
- Schemas defined in src/lib/claude/schemas.ts and exported via src/lib/claude/index.ts

This pattern ensures reliable, type-safe JSON output from Claude agents without manual parsing or validation.
**Files**: src/lib/claude/structured.ts, src/lib/claude/schemas.ts, src/lib/trial/arbiter/index.ts, src/lib/trial/judges/index.ts
---

### [00:39] [workflow] Trial State Machine Flow
**Details**: Complete trial flow with all phases:

1. pending → lanista_designing (Lanista creates gladiators)
2. lanista_designing → battling (Gladiators execute in parallel)
3. battling → arbiter_designing (Arbiter analyzes outputs, designs judges)
4. arbiter_designing → judging (Judges evaluate gladiators in parallel)
5. judging → decree (Verdict synthesized, winner determined)
6. decree → complete (Consul decides actions)

Any phase can transition to 'failed' on error.

State transitions managed by transitionTrialState() in src/lib/trial/state.ts, which validates transitions and broadcasts SSE events.
**Files**: src/lib/trial/state.ts, src/lib/trial/arbiter/index.ts, src/lib/trial/judges/index.ts
---

### [00:53] [architecture] Docker container orchestration for Thunderdome trials
**Details**: Implemented a comprehensive Docker container management system for code battle trials. Key architectural decisions:

1. **Resource Constraints**: Each trial container has 2GB RAM limit and 1 CPU core to prevent resource exhaustion
2. **Security Model**: Containers run with no-new-privileges flag and minimal Linux capabilities (CHOWN, DAC_OVERRIDE, FOWNER, SETGID, SETUID only)
3. **Auto-Cleanup**: 30-minute timeout with automatic container destruction to prevent orphaned containers
4. **Singleton Pattern**: Docker client uses singleton pattern for connection pooling
5. **In-Memory Registry**: Trial containers stored in Map for fast lookup during trial execution
6. **Next.js Integration**: dockerode added to serverExternalPackages to avoid bundling issues with Turbopack

The container service provides file copy operations (in/out) and command execution, which will be essential for running gladiator code in isolated environments.
**Files**: src/lib/docker/client.ts, src/lib/docker/container.ts, src/lib/docker/health.ts, src/lib/trial/container-service.ts, src/app/api/admin/health/route.ts, next.config.ts
---

### [00:53] [gotcha] dockerode package requires Next.js externalization
**Details**: The dockerode package contains non-ECMAScript modules (specifically ssh2 crypto modules) that cause Turbopack build failures. Solution is to add 'dockerode' to serverExternalPackages in next.config.ts. This prevents Next.js from trying to bundle dockerode and allows it to be required at runtime.

Also needed to install @types/tar-stream for TypeScript support of archive operations used in file copy methods.
**Files**: next.config.ts, package.json
---

### [03:33] [architecture] Trial System Architecture - Complete Flow
**Details**: ## Core Concepts

**Trial**: A complete problem-solving session where AI gladiators compete to solve a challenge, judged by AI judges, with human editor approval.

### Trial Lifecycle (State Machine)
pending → lanista_designing → battling → arbiter_designing → judging → decree → complete

Key states mapped to database statuses:
- PENDING: Trial created, awaiting start
- PLANNING: Lanista is designing gladiators
- RUNNING: Gladiators are executing/battling
- JUDGING: Judges are evaluating
- COMPLETED: Verdict reached
- FAILED: Error occurred

### Database Schema

**trials table**: Stores trial metadata
- id, userId, repoUrl, challengePrompt, trialType (GLADIATOR|LEGION), status
- lanistaPlan, arbiterPlan (JSON storage for reasoning and designs)
- createdAt, completedAt

**gladiators table**: AI agents competing in the trial
- id, trialId, name, persona, model, temperature, tools (JSON array)
- branchName (for code battles), status, responseContent, streamLog

**judges table**: AI evaluators of gladiator outputs
- id, trialId, name, focus, model, evaluation (JSON)

**verdicts table**: Final judgment
- id, trialId, summary, winnerGladiatorId, reasoning

**decrees table**: Actions taken after verdict
- id, trialId, actionType (MERGE|CLOSE_PR|CREATE_ISSUE|COMMENT), actionDetails

### Trial Types

**GLADIATOR Mode (Ideation)**
- Multiple AI agents compete with different, even opposing perspectives
- Each gladiator gets distinct persona, temperature, tools
- Creates "productive tension" through diversity
- Currently enabled and working

**LEGION Mode (Implementation)**
- AI agents work together as coordinated team
- Complementary roles with specialization
- Currently disabled ("Coming soon!" in UI)
- Not yet implemented

### What "Ideation" Means
Refers to the GLADIATOR mode's primary use case: exploring solution space through diverse AI perspectives rather than collaborative implementation. "Ideation" emphasizes creative, competitive problem-solving where different approaches illuminate the solution space through their differences.
**Files**: src/db/schema.ts, src/lib/trial/state.ts, src/lib/trial/types.ts, src/app/api/trials/route.ts, thunderdome-spec.md
---

### [03:33] [architecture] GLADIATOR Mode - The Lanista System
**Details**: ## GLADIATOR Mode Execution Flow

### 1. Trial Creation
POST /api/trials with:
- challengePrompt: The problem to solve
- trialType: "GLADIATOR" (currently the only enabled option)
- repoUrl: Optional, only for code battles (currently not working - code battle mode incomplete)

Trial starts in PENDING status.

### 2. Trial Start (POST /api/trials/{id}/start)
If trial has repoUrl:
- Checks that setup discovery completed (repo setup cached in repoSetups table)
- Attempts to start code battle (currently throws "not fully implemented" error)
- Code battle would use containers, git worktrees, and push changes

If no repoUrl (pure ideation mode - currently working):
- Transitions to lanista_designing (PLANNING status)
- Placeholder for future: "Kick off Lanista agent in background"

### 3. Lanista Phase (runLanista)
The Lanista is an Claude Opus agent that:

**Input**: 
- challengePrompt
- trialType ("GLADIATOR" generates competitive guidance)
- optional repoContext (from setup discovery)

**Process**:
1. Invokes Claude Opus with structured output schema (LanistaOutputSchema)
2. Lanista analyzes the challenge
3. Lanista invents 2-6 gladiators with:
   - name: Descriptive name
   - persona: Detailed system prompt defining approach
   - model: "opus"|"sonnet"|"haiku"
   - temperature: 0.0-1.0 (flexibility/creativity)
   - tools: Array of available tool names
   - focus: What this gladiator prioritizes

**Gladiator Archetypes Available** (Lanista can use or create custom):
- The Paranoid: Security/edge cases, temp 0.3-0.5
- The Minimalist: Simplicity, temp 0.4-0.6
- The Pragmatist: Fast shipping, temp 0.5-0.7
- The Academic: Correctness/theory, temp 0.3-0.5
- The Contrarian: Challenge assumptions, temp 0.7-0.9
- The User Advocate: UX/usability, temp 0.5-0.7
- The Performance Engineer: Speed/efficiency, temp 0.4-0.6
- The Test Engineer: Testing/quality, temp 0.4-0.6

**Output Storage**:
- Creates gladiator records in database with generated personas
- Stores lanistaPlan JSON in trial (reasoning, gladiators, cost)
- Status transitions: PLANNING → RUNNING

### 4. Gladiator Execution (runGladiators)
Each gladiator runs in parallel with timeout (default 30 min):

**System Prompt**:
- Gladiator's unique persona (from Lanista)
- Challenge description
- Competition mode note: "You are competing against other AI agents with different approaches"
- Focus area for that gladiator
- For code battles: repository context + working directory

**User Prompt**:
Simple: "Begin your work on the challenge described in your mission"

**Execution**:
- Claude agent with up to 25 turns max
- Streams all events (thinking, tool calls, results) to SSE
- Events stored in database streamLog (JSON)
- Final response stored in responseContent

**Repo URL Usage in Code Battles** (Not currently working):
If repoUrl exists and setup completed:
- Container started from Docker image
- Repo cloned into container
- Setup script runs
- Gladiator gets worktree for isolated branch
- Can use Bash, Read, Write, Edit, Glob, Grep tools
- Creates commits on trial-specific branch
- Branch pushed to repo after battle complete

For pure ideation (no repo):
- No container needed
- Gladiators just think and respond
- Can use thinking, tools like WebSearch, WebFetch, but not filesystem tools

### 5. Arbiter Phase (runArbiter)
After all gladiators complete:

**Input**: Challenge + all gladiator outputs (successful only)

**Process**:
1. Transition to arbiter_designing (JUDGING status)
2. Invoke Claude Opus with ArbiterOutputSchema
3. Arbiter analyzes:
   - What each gladiator produced
   - Dimensions that matter for fair evaluation
   - Creates 3-5 judges with evaluation criteria

**Judges Created**:
- Each gets a name, focus area, evaluation criteria
- Stored in judges table
- Status transitions to judging

### 6. Judge Phase (runJudges)
All judges run in parallel:

**Input Per Judge**:
- Challenge description
- All gladiator outputs (successful ones)
- Judge's specific focus area
- Evaluation criteria from Arbiter

**Output**:
- Structured evaluation from each judge
- Scores/assessment per gladiator
- Reasoning for each assessment

### 7. Verdict & Decree Phases
**Verdict Synthesis**:
- Combines all judge evaluations
- Creates verdict record with summary, reasoning
- May select winnerGladiatorId
- Status transitions: judging → decree → complete

**Decree**:
- Post-trial action (MERGE, CLOSE_PR, CREATE_ISSUE, COMMENT)
- Consul helper for interactive decisions
- Can combine approaches, synthesize code, export results

## Broadcast & SSE
- SSE stream at /api/trials/{id}/stream
- Real-time events: lanista_thinking, gladiator_started, judge_thinking, verdict_complete, etc.
- Each phase broadcasts updates to connected clients
- Frontend shows live progress during trial
**Files**: src/lib/trial/lanista/index.ts, src/lib/trial/gladiators/index.ts, src/lib/trial/arbiter/index.ts, src/lib/trial/judges/index.ts, src/lib/trial/gladiators/prompts.ts, src/app/api/trials/[id]/start/route.ts
---

### [03:33] [architecture] Repo URL Usage in Trials (Code Battles)
**Details**: ## How Repo URL is Used

### Where repoUrl is stored
- trials table, repoUrl field (text, not nullable for code battles)
- Provided when creating trial, optional
- Can be GitHub HTTPS URL like: https://github.com/owner/repo

### Setup Discovery (Pre-Trial)
Before code battles can run, repo needs setup information:

**runSetupDiscovery** function:
- Takes repoUrl + workingDir (local clone)
- Uses Claude Sonnet agent with Read/Glob/Grep/Bash
- Explores repo to understand: dependencies, build steps, test commands
- Generates and caches:
  - setupMd: Documentation of how to build/test
  - setupSh: Shell script to set up environment

**Stored in repoSetups table**:
- userId, repoUrl (unique), setupMd, setupSh, createdAt, updatedAt
- Cached per user per repo to avoid re-discovering

### Trial Start Check
When POST /api/trials/{id}/start with repoUrl:
1. Verifies repoSetups entry exists
2. If missing: returns error "Repo setup required. Run Setup Discovery first"
3. If exists: attempts to start code battle

### Code Battle Execution (Not fully implemented)
If repo URL present, would:
1. Start Docker container (startTrialContainer)
2. Clone repo into container
3. Run setup commands from setupSh
4. Create git worktrees for each gladiator
5. Each gladiator gets isolated branch in working container
6. Gladiators can modify code in their worktree
7. After battle: push all branches to origin with `git push origin --all --force-with-lease`
8. Results visible as PRs/branches in repo

### Current Status
- Code battle mode NOT FULLY IMPLEMENTED
- runCodeBattle throws error: "Code battle mode is not fully implemented"
- Pure ideation mode (no repoUrl) IS WORKING
- repoUrl field exists but not used for active trials yet
- Setup discovery infrastructure in place but frontend/e2e not complete

### Why Repo URL Matters
- **With URL**: Gladiators can work on real code, make commits, run tests
- **Without URL**: Pure ideation - gladiators think through problems, no file modifications
- **Setup Required**: System needs to know how to build/test the specific repo before attempting code battles
**Files**: src/app/api/trials/[id]/start/route.ts, src/lib/setup/discovery.ts, src/lib/trial/code-battle/orchestrator.ts, src/lib/git/worktree.ts, src/db/schema.ts
---

### [03:47] [architecture] Trial Status Display System with SSE Real-Time Updates
**Details**: Trial progress is displayed to users through a comprehensive real-time streaming system using Server-Sent Events (SSE). The system has multiple layers:

1. **Status States**: Trials transition through 6 main states:
   - PENDING (initial) -> PLANNING (lanista designing) -> RUNNING (battle) -> JUDGING (arbiter judging) -> COMPLETED (decree) -> COMPLETED
   - Can fail at any point -> FAILED
   
2. **SSE Broadcasting Architecture**:
   - Central broadcast system in `/src/lib/trial/broadcast.ts` manages in-memory subscriptions
   - Maintains maps: Map<trialId, Map<subscriberId, Subscriber>> for trial updates
   - Maintains maps: Map<gladiatorId, Map<subscriberId, Subscriber>> for gladiator updates
   - Uses ReadableStream controllers to push SSE events to all connected clients
   - Handles dead subscriber cleanup automatically

3. **Trial-level Updates** (/api/trials/[id]/stream):
   - Endpoint sends initial state immediately (trial data + status)
   - Uses subscribeToTrial() to create subscription stream
   - Broadcasts state_change events via transitionTrialState() in state.ts
   - Events include type, state, status, timestamp, and metadata

4. **Gladiator-level Updates** (/api/gladiators/[id]/stream):
   - Uses 1-second polling to check database for updates
   - Reads streamLog (JSON) from gladiators table for event history
   - Sends individual event types: text, tool_use, status, complete, error
   - Closes stream when gladiator status is COMPLETED or FAILED
   - Manages timer-based polling with proper cleanup on connection close

5. **Event Types** (from types.ts):
   - Lanista events: lanista_thinking, lanista_complete, lanista_error, gladiators_created
   - Arbiter events: arbiter_thinking, arbiter_complete, arbiter_error, judges_created, judging_started
   - Judge events: judge_thinking, judge_complete, judge_error, all_judges_complete
   - Verdict events: verdict_synthesizing, verdict_complete

6. **Client-Side Hooks**:
   - useTrialStream(trialId): Connects to /api/trials/[id]/stream, manages SSE connection, includes auto-reconnect (10 attempts, 2s delay), accumulates events in state
   - useGladiatorStream(gladiatorId): Connects to /api/gladiators/[id]/stream, parses typed events, accumulates output, tracks streaming/complete status

7. **UI Components**:
   - BattleView: Main component showing challenge, status banner, verdict, and gladiator tabs
   - StatusBanner: Displays current status with emoji and color coding (PENDING:gray, PLANNING:yellow, RUNNING:orange, JUDGING:purple, COMPLETED:green, FAILED:red), pulse animation for active states
   - GladiatorPanel: Shows streaming output in scrollable area, status dots, auto-scroll to bottom, winner badge if applicable
   - ResultsView: Final results including verdict, gladiator responses with scores, judge evaluations with strengths/weaknesses, export and consult options
**Files**: /workspace/project/src/lib/trial/broadcast.ts, /workspace/project/src/lib/trial/state.ts, /workspace/project/src/hooks/use-trial-stream.ts, /workspace/project/src/hooks/use-gladiator-stream.ts, /workspace/project/src/components/trials/battle-view.tsx, /workspace/project/src/components/trials/status-banner.tsx, /workspace/project/src/components/trials/gladiator-panel.tsx, /workspace/project/src/app/api/trials/[id]/stream/route.ts, /workspace/project/src/app/api/gladiators/[id]/stream/route.ts
---

### [14:48] [workflow] Never amend git commits
**Details**: User strongly dislikes git commit --amend. Always create new commits instead of amending, even for small fixes to previous commits. This is a firm user preference.
---

