# ⚡ THUNDERDOME ⚡

> *Many gladiators enter. One answer leaves.*

A multi-agent LLM battle arena where AI gladiators compete to solve challenges, judged by AI judges, with you—the Editor—as the final arbiter.

*"Yo we can't agree on the architecture." "TAKE IT TO THE THUNDERDOMEEEEEEE"*

---

## Overview

Thunderdome is a web application that orchestrates competitive AI problem-solving. Instead of asking one LLM for an answer, Thunderdome's **Lanista** (the AI competition designer) spawns multiple Claude instances ("gladiators") with different perspectives, has them compete, then uses judge instances to evaluate responses before presenting results to you—the **Editor**—for your final decree.

The key insight: **diversity of approach surfaces better solutions**. By having gladiators with different temperatures, system prompts, and analytical focuses attack the same problem, you get multiple perspectives that a single query never would.

---

## Core Concepts

### The Battle Flow

```
User submits challenge (+ optional repo context)
                ↓
            Lanista
   (designs the gladiators)
                ↓
    Analyzes challenge & context
    "What perspectives would create productive tension?"
    - Invents gladiators tailored to this challenge
    - Decides tool access per gladiator
    - Picks fighting styles that will surface different approaches
                ↓
        Spawns Gladiators
    (N parallel Claude instances)
    Each with unique:
    - System prompt / persona
    - Temperature
    - Tool access level
    - Focus area
                ↓
     Gladiators do their work
    (stream progress to UI)
                ↓
        Collects responses
                ↓
            Arbiter
    (designs the judges)
                ↓
    Sees challenge AND gladiator outputs
    "Given what was produced, what judges would evaluate fairly?"
    - Invents judges appropriate for these specific outputs
    - Maybe one gladiator went creative, needs an Innovation Judge
    - Maybe two found the same bug, needs a Clarity Judge
                ↓
         Spawns Judges
    (M Claude instances)
    Each evaluates all gladiator responses
    from a different angle
                ↓
       Synthesizes verdict
                ↓
     Editor (you) decrees
```

### The Lanista

The Lanista designs the gladiators. It doesn't solve problems—it **designs attacks on problems**.

In ancient Rome, the Lanista was the owner/trainer of a gladiator school (ludus). They knew their fighters' strengths, matched styles that would create entertaining combat, and decided who to send into which battles. Our Lanista does the same with AI.

Given a challenge and optional repo context, the Lanista:
1. Reads the challenge and any CLAUDE.md / codebase context
2. Determines what type of bout this is (security audit, ideation, architecture, etc.)
3. Invents gladiators tailored to this specific challenge
4. Decides tool access per gladiator (read-only vs full code access)
5. Kicks off the battle

The Lanista's energy is **offensive/creative** - "what perspectives would create productive tension?"

The Lanista has access to gladiator archetypes as inspiration but can invent new ones:

**Example Archetypes:**
- The Paranoid (assumes everything is exploitable)
- The Minimalist (simplest solution wins)
- The Academic (what does the literature/research say)
- The Pragmatist (what ships fastest)
- The Adversary (thinks like an attacker)
- The User Advocate (thinks from end-user perspective)
- The Historian (how have similar problems been solved)
- The Contrarian (argues against the obvious approach)

### The Arbiter

The Arbiter designs the judges. After gladiators have fought, the Arbiter reviews their outputs and decides how to fairly evaluate them.

In ancient Rome, the **Summa Rudis** was the senior referee who judged gladiatorial combat. Our Arbiter serves a similar role—but instead of judging directly, it designs the judges.

The key insight: **the Arbiter sees the gladiator outputs before designing judges**. This means it can tailor evaluation to what was actually produced:

- "Two gladiators found the same bug but explained it differently → I need a Clarity Judge"
- "One gladiator went off-script with a creative approach → I need an Innovation Judge to fairly evaluate that"
- "The outputs are all very technical → I need a Practicality Judge to ground this"

Given the challenge AND gladiator responses, the Arbiter:
1. Analyzes what the gladiators actually produced
2. Identifies what dimensions matter for evaluation
3. Invents judges tailored to fairly evaluate these specific outputs
4. Kicks off the judging phase

The Arbiter's energy is **evaluative/analytical** - "given what was produced, what criteria actually matter?"

**Example Judge Types:**
- Severity Judge (how critical are the findings?)
- Novelty Judge (did anyone find something others missed?)
- Clarity Judge (how well-explained and actionable?)
- Pragmatist Judge (what's actually buildable/shippable?)
- Innovation Judge (what's genuinely new thinking?)
- Risk Judge (what are the downsides?)
- Completeness Judge (did anyone miss obvious things?)

### Trial Types (Bout Modes)

The Lanista categorizes challenges into modes that determine gladiator capabilities:

| Mode | Repo | Gladiators Can | Use Case |
|------|------|--------------|----------|
| **Pure Ideation** | None | Think & respond only | Philosophy, brainstorming, non-code problems |
| **Repo-Aware Ideation** | Read-only | Read code, run analysis tools, no edits | Architecture decisions, design discussions |
| **Code Battle** | Full access | Read, edit, build, test; each gets own worktree | Security audits, bug hunts, implementation challenges |

The Lanista can even mix modes—some gladiators get read-only while one "Implementer" gets a full worktree to prototype.

---

## Setup Discovery (Interactive)

Before running code battles on a repo, Thunderdome needs to know how to build and test it. This is the **Setup Discovery** phase—an interactive session where you and Claude figure out how to work with the repo.

### When Does Setup Run?

- **First time a repo is used**: Setup is required
- **Setup file exists**: Skip straight to trial creation
- **User requests re-setup**: Can re-run if things changed

### The Flow

1. User selects a repo for a code battle
2. Thunderdome checks for existing `.thunderdome/setup.md` in the repo
3. **If no setup exists**: Interactive discovery session begins
4. A Claude Agent SDK session is spawned (streaming to web UI)
5. Claude explores the repo:
   - Reads README, package.json, Cargo.toml, foundry.toml, etc.
   - Identifies the project type (Node, Rust, Solidity/Foundry, Python, etc.)
   - Proposes build and test commands
6. **User can watch and intervene** - it's interactive, not fire-and-forget
7. Claude attempts to run build/test to verify they work
8. Claude writes setup output files
9. User approves
10. Setup is committed to their repo (or stored in DB per-repo)

### Setup Output

Two files are generated:

**`.thunderdome/setup.md`** - Human-readable setup documentation:
```markdown
# Thunderdome Setup

## Project Type
Foundry/Solidity smart contract project

## Prerequisites
- Foundry toolchain (forge, cast, anvil)

## Install Dependencies
\`\`\`bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
forge install
\`\`\`

## Build
\`\`\`bash
forge build
\`\`\`

## Test
\`\`\`bash
forge test
\`\`\`

## Notes
- Tests require mass mainnet fork (set ETH_RPC_URL)
- Some tests are slow, use `forge test --match-test testQuick` for fast feedback
```

**`.thunderdome/setup.sh`** - Executable setup script:
```bash
#!/bin/bash
set -e

# Install Foundry if not present
if ! command -v forge &> /dev/null; then
    curl -L https://foundry.paradigm.xyz | bash
    foundryup
fi

# Install dependencies
forge install

# Build
forge build

# Verify tests pass
forge test
```

### In the Container

When a code battle trial starts:
1. Container spins up
2. Repo cloned
3. `.thunderdome/setup.sh` is executed to prepare the environment
4. Worktrees created for each gladiator
5. Battle begins

This ensures gladiators can actually build and test the code.

### Gladiators

Gladiators are Claude instances configured to approach the problem from a specific angle. Each gladiator has:

- **Persona/System Prompt**: Their perspective and focus
- **Model**: Which Claude model (opus, sonnet)
- **Temperature**: How creative vs focused (0.3 conservative → 0.9 creative)
- **Tool Access**: What they're allowed to do
- **Working Directory**: For code battles, their own git worktree/branch

Example gladiators for a security audit:
```
Gladiator: "Reentrancy Hunter"
- Focus: Call patterns, external calls, state changes
- Temp: 0.4
- Tools: Full (can write PoC exploits)
- Branch: thunderdome/trial-xxx/gladiator-reentrancy-hunter

Gladiator: "Math Auditor"  
- Focus: Arithmetic edge cases, overflow, precision loss
- Temp: 0.3
- Tools: Full
- Branch: thunderdome/trial-xxx/gladiator-math-auditor

Gladiator: "MEV Searcher"
- Focus: Thinks like an attacker, front-running, sandwich attacks
- Temp: 0.7
- Tools: Full
- Branch: thunderdome/trial-xxx/gladiator-mev-searcher
```

### Judges

Judges are designed by the Arbiter after gladiators have fought. They evaluate gladiator responses from specific angles, seeing all outputs and scoring/ranking them.

Because the Arbiter sees gladiator outputs first, judges are tailored to what was actually produced—not generic evaluation criteria.

Example judges for a security audit (designed by Arbiter after seeing findings):
- **Severity Judge**: How critical are the findings?
- **Novelty Judge**: Did anyone find something others missed?
- **Clarity Judge**: How well-explained and actionable are the findings?

Example judges for ideation (designed by Arbiter after seeing proposals):
- **Pragmatist Judge**: What's actually buildable?
- **Innovation Judge**: What's genuinely new thinking?
- **Risk Judge**: What are the downsides of each approach?

### Git Integration (Code Battles)

For code-focused trials:
1. **A fresh container is spun up for each trial** (destroyed after completion)
2. User's repo is cloned into the container
3. **Each gladiator gets their own git worktree**: `thunderdome/trial-{id}/gladiator-{name}`
4. Gladiators can read, edit, build, test within their worktree
5. A required summary file is created: `.thunderdome/FINDINGS.md`
6. Worktree branches are pushed to user's repo for history
7. Judges branch contains all evaluations + verdict
8. Container is destroyed after branches are pushed

This means for security audits, you get branches with actual PoC exploits you can run and test—and the ephemeral container ensures isolation between trials.

**Worktree structure inside container:**
```
/trial-workspace/
├── main/                          # Clean clone for reference
├── gladiator-reentrancy-hunter/   # Worktree for this gladiator
├── gladiator-math-auditor/        # Worktree for this gladiator
├── gladiator-mev-searcher/        # Worktree for this gladiator
└── judges/                        # Worktree for judge evaluations
```

### Gladiator Limits

To manage costs and keep battles focused:
- **Minimum**: 2 gladiators (otherwise it's not a competition)
- **Default**: 3-4 gladiators (good balance of diversity vs cost)
- **Maximum**: 6 gladiators (diminishing returns beyond this)

The Lanista can be instructed to use fewer for simple challenges or more for complex ones, but these are the guardrails.

### Terminology Reference

| Concept | Term | Description |
|---------|------|-------------|
| The app | **Thunderdome** | The arena where battles happen |
| Gladiator designer | **Lanista** | AI that designs the gladiators (offensive/creative) |
| Judge designer | **Arbiter** | AI that designs the judges (evaluative/analytical) |
| Competing LLMs | **Gladiators** | Claude instances with different perspectives |
| Evaluators | **Judges** | Claude instances that score gladiators |
| A competition | **Trial** or **Bout** | One challenge with its gladiators and judges |
| Final decision | **Verdict** | The synthesized result |
| User | **Editor** | You—the one who gives the final decree |

---

## Technical Architecture

### Stack

- **Frontend**: Web app (Next.js or similar)
- **Backend**: Node.js server
- **AI**: Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)
- **Auth**: GitHub OAuth (for repo access) + user-provided Claude token
- **Database**: PostgreSQL or SQLite (trials, users, history)
- **Real-time**: WebSocket for streaming warrior/judge output to UI

### Authentication

Two credentials per user:

1. **GitHub OAuth**: For identity and repo access (including private repos)
2. **Claude Code OAuth Token**: User runs `claude setup-token` locally, pastes long-lived token into Thunderdome settings. This token is used to spawn Claude Agent SDK sessions.

Users bring their own Claude Max subscription. Thunderdome just provides the arena.

```
users:
  - id
  - github_id
  - github_username
  - github_access_token (encrypted)
  - claude_code_oauth_token (encrypted)
  - created_at
```

### Claude Agent SDK

The SDK (`@anthropic-ai/claude-agent-sdk`) provides:

- **Streaming async generator**: Messages stream as they arrive
- **Built-in tools**: Read, Edit, Bash, Glob, WebSearch
- **Sessions**: Track and resume conversations
- **System prompts**: Configure gladiator personas
- **MCP support**: Custom tools if needed

```typescript
import { query, ClaudeAgentOptions } from '@anthropic-ai/claude-agent-sdk'

async function* runGladiator(challenge: string, config: GladiatorConfig, cwd: string) {
  const options: ClaudeAgentOptions = {
    model: config.model,
    systemPrompt: config.systemPrompt,
    allowedTools: config.tools,
    cwd: cwd,
  }
  
  for await (const message of query({ prompt: challenge, options })) {
    yield message // Stream to websocket → web UI
  }
}
```

### Containerization / Isolation

**Each trial runs in an ephemeral container:**
- Fresh container spun up when trial starts
- Repo cloned, worktrees created for each gladiator
- All gladiators run inside this single container (in their own worktrees)
- Container destroyed after trial completes and branches are pushed

This ensures:
- Trials can't interfere with each other
- Malicious code in a repo can't persist or affect other users
- Clean slate every time
- No state leakage between trials

The server itself runs on an LXC container and spawns Docker/Podman containers for each trial.

### Data Model

```sql
-- Users (Editors)
users:
  - id
  - github_id
  - github_username  
  - github_access_token (encrypted)
  - claude_code_oauth_token (encrypted)
  - created_at

-- Trials (Bouts)
trials:
  - id
  - user_id
  - repo_url (nullable)
  - challenge_prompt
  - trial_type (ideation | repo_aware | code_battle)
  - status (pending | lanista_designing | battling | arbiter_designing | judging | complete)
  - lanista_plan (JSON - gladiators designed)
  - arbiter_plan (JSON - judges designed, after gladiators finish)
  - created_at
  - completed_at

-- Gladiators
gladiators:
  - id
  - trial_id
  - name
  - persona (system prompt)
  - model
  - temperature
  - tools (JSON array)
  - branch_name (nullable, for code battles)
  - status (pending | fighting | complete | failed)
  - response_content
  - created_at

-- Judges
judges:
  - id
  - trial_id
  - name
  - focus (what they evaluate)
  - model
  - evaluation (JSON - scores, reasoning per gladiator)
  - created_at

-- Verdicts
verdicts:
  - id
  - trial_id
  - summary
  - winner_gladiator_id (nullable)
  - reasoning
  - created_at
```

---

## User Interface

### Main Flow

1. **Sign in with GitHub**
2. **Settings**: Add Claude Code OAuth token (`claude setup-token`)
3. **New Trial**:
   - Optional: Select repo (shows your GitHub repos)
   - **If repo selected and no setup exists**: Interactive Setup Discovery
   - Write challenge prompt
   - "ENTER THE THUNDERDOME"
4. **Battle View**:
   - Lanista's plan (gladiators designed)
   - Live streaming tabs for each gladiator
   - Arbiter's plan (judges designed after gladiators finish)
   - Progress indicators
5. **Results View**:
   - Verdict summary
   - Expandable gladiator responses
   - Judge evaluations
   - For code battles: links to branches
6. **History**: Past trials, searchable

### Setup Discovery View

```
┌─────────────────────────────────────────────────────────┐
│  🔧 SETUP: myprotocol/staking-contracts                 │
├─────────────────────────────────────────────────────────┤
│  No .thunderdome/setup.md found. Let's figure out how   │
│  to build and test this repo.                           │
├─────────────────────────────────────────────────────────┤
│  │ Analyzing repository...                            │ │
│  │ Found foundry.toml - this is a Foundry project     │ │
│  │ Reading foundry.toml...                            │ │
│  │ Found remappings, dependencies: forge-std, solmate │ │
│  │                                                    │ │
│  │ Attempting: forge build                            │ │
│  │ ✓ Build successful                                 │ │
│  │                                                    │ │
│  │ Attempting: forge test                             │ │
│  │ ✓ 47/47 tests passing                              │ │
│  │                                                    │ │
│  │ Writing .thunderdome/setup.md...                   │ │
│  │ Writing .thunderdome/setup.sh...                   │ │
│  │ █                                                  │ │
├─────────────────────────────────────────────────────────┤
│  [Intervene / Chat]                                     │
│  > Actually we need ETH_RPC_URL set for fork tests...   │
└─────────────────────────────────────────────────────────┘
```

### Battle View (Live)

```
┌─────────────────────────────────────────────────────────┐
│  ⚡ TRIAL: How should we handle mid-epoch liquidation?  │
│  Status: GLADIATORS BATTLING                            │
├─────────────────────────────────────────────────────────┤
│  LANISTA DESIGNED:                                      │
│  Gladiators: Safety First, Protocol Purist, Gas Optimizer│
├─────────────────────────────────────────────────────────┤
│  [Safety First] [Protocol Purist] [Gas Optimizer]       │
│  ─────────────────────────────────────────────────────  │
│  │ Currently analyzing epoch boundary conditions...   │ │
│  │ Reading src/staking/EpochManager.sol...            │ │
│  │ > Found potential issue: liquidation check doesn't │ │
│  │   account for pending rewards...                   │ │
│  │ █                                                  │ │
└─────────────────────────────────────────────────────────┘
```

After gladiators finish:

```
┌─────────────────────────────────────────────────────────┐
│  ⚡ TRIAL: How should we handle mid-epoch liquidation?  │
│  Status: ARBITER DESIGNING JUDGES                       │
├─────────────────────────────────────────────────────────┤
│  LANISTA DESIGNED:                                      │
│  Gladiators: Safety First, Protocol Purist, Gas Optimizer│
│  ✓ All gladiators complete                              │
├─────────────────────────────────────────────────────────┤
│  ARBITER ANALYZING:                                     │
│  "Two gladiators proposed queue-based solutions...      │
│   I'll need a Clarity Judge to differentiate.           │
│   Gas Optimizer took a novel approach...                │
│   Adding an Innovation Judge."                          │
│                                                         │
│  Judges: Pragmatist, Clarity, Innovation                │
└─────────────────────────────────────────────────────────┘
```

### Results View

```
┌─────────────────────────────────────────────────────────┐
│  ⚡ TRIAL COMPLETE                                       │
├─────────────────────────────────────────────────────────┤
│  VERDICT                                                │
│  ────────                                               │
│  Winner: Protocol Purist                                │
│  "The queue-based approach maintains epoch integrity    │
│   while handling edge cases gracefully..."              │
│                                                         │
│  [View Full Verdict]                                    │
├─────────────────────────────────────────────────────────┤
│  GLADIATOR RESPONSES                                    │
│  ├─ Safety First        [Expand] [View Branch]          │
│  ├─ Protocol Purist ⭐  [Expand] [View Branch]          │
│  └─ Gas Optimizer       [Expand] [View Branch]          │
├─────────────────────────────────────────────────────────┤
│  JUDGE EVALUATIONS                                      │
│  ├─ Pragmatist Judge    [Expand]                        │
│  └─ Security Judge      [Expand]                        │
├─────────────────────────────────────────────────────────┤
│  [Export Report]  [New Trial]  [Re-run with Tweaks]     │
└─────────────────────────────────────────────────────────┘
```

### Aesthetic

- Dark mode
- Heavy metal / post-apocalyptic vibes
- Gritty textures, industrial feel
- Fire/lightning accents
- Progress feels intense, not sterile

---

---

## Implementation Phases

### Phase 1: Validation
- [ ] Verify Claude Max OAuth token works with Agent SDK
- [ ] Test parallel Claude sessions with same token
- [ ] Basic streaming from Agent SDK to WebSocket to React

### Phase 2: MVP (Ideation Mode)
- [ ] GitHub OAuth login
- [ ] Claude token settings page
- [ ] Simple trial creation (no repo, just prompt)
- [ ] Lanista → gladiators → Arbiter → judges flow
- [ ] Stream to UI
- [ ] Display results

### Phase 3: Setup Discovery
- [ ] Repo selection from GitHub
- [ ] Interactive Claude session for setup discovery
- [ ] Stream setup exploration to UI
- [ ] Generate `.thunderdome/setup.md` and `.thunderdome/setup.sh`
- [ ] Store/commit setup files

### Phase 4: Repo-Aware Ideation
- [ ] Clone repo, provide read-only context
- [ ] Gladiators can read code, see CLAUDE.md
- [ ] Run analysis tools (no edits)

### Phase 5: Code Battles
- [ ] Container orchestration (spin up/destroy per trial)
- [ ] Run setup.sh in container
- [ ] Git worktree creation per gladiator
- [ ] Full tool access (edit, bash, etc.)
- [ ] Push worktree branches to user's repo
- [ ] Required FINDINGS.md file

### Phase 6: Polish
- [ ] Trial history
- [ ] Export reports
- [ ] Re-run trials with tweaks
- [ ] Usage tracking
- [ ] Better UI/UX
- [ ] Gladiator archetype library

---

## Open Questions

1. **Concurrency limits**: How many parallel gladiators can one Claude Max subscription support?

2. **Container isolation**: Worth the complexity, or just trust the code? Start simple with worktrees?

3. **Lanista/Arbiter guardrails**: Should there be limits on gladiator/judge count? (Cost consideration for user)

4. **Gladiator archetypes**: Build a library over time? Surface which types win certain challenges?

5. **Arbiter learning**: Can the Arbiter get better at designing judges based on past trials?

6. **Sharing**: Can users share trial results publicly? Leaderboards?

7. **Team features**: Multiple users, shared repos, collaborative trials?

---

## References

- [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Claude Agent SDK TypeScript](https://github.com/anthropics/claude-agent-sdk-typescript)
- [AGENTS.md Standard](https://agents.md/)
- [Agentic AI Foundation (AAIF)](https://aaif.io/)
- [A2A Protocol](https://a2a-protocol.org/)

---

## Related Projects

- [Homunculus](https://github.com/lucianHymer/homunculus) - Single-agent GitHub automation (patterns to reuse)
- [L8s](https://github.com/lucianHymer/l8s) - Container management system (potential infrastructure patterns)

---

*Ave, Editor. Morituri te salutant.*

*(Hail, Editor. Those about to die salute you.)*

⚡🔥💀
