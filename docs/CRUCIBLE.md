# The Crucible

> *An evolutionary training dungeon for AI agents*

## Overview

The Crucible is a system for discovering effective AI agent configurations through adversarial selection rather than manual prompt engineering. Agents ("Crawlers") enter the dungeon at Level 1, face challenges, and either die or level up. Survivors develop specializations. The Lanista recruits from hardened veterans for real Thunderdome battles.

It's 70% silly, 30% might-actually-discover-something-profound, and 100% a good use of leftover API credits at the end of the week.

```
┌─────────────────────────────────────────────────────────────────────┐
│  THE CRUCIBLE                                                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Challenge Architects                                               │
│  (generate trials)                                                  │
│           │                                                         │
│           ▼                                                         │
│    ┌─────────────┐                                                  │
│    │ LEVEL 1     │◄── Fresh Crawlers spawn here                     │
│    └─────────────┘                                                  │
│           │ survivors gain XP, collect totems                       │
│           ▼                                                         │
│    ┌─────────────┐                                                  │
│    │ LEVEL 5     │                                                  │
│    └─────────────┘                                                  │
│           │                                                         │
│           ▼                                                         │
│         ...                                                         │
│           │                                                         │
│           ▼                                                         │
│    ┌─────────────┐                                                  │
│    │ LEVEL 20    │──► Hall of Champions                             │
│    └─────────────┘                                                  │
│                                                                     │
│  Judges evolve alongside crawlers, scored on prediction accuracy    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  THUNDERDOME (Production)                                           │
│                                                                     │
│  Lanista recruits from Hall of Champions                            │
│  Battle-tested configurations for real work                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## The Crawler Genome

Every crawler has a "genome" - the configuration that defines how it thinks and acts:

```typescript
interface CrawlerGenome {
  // Core configuration
  model: 'opus' | 'sonnet' | 'haiku'
  systemPrompt: string
  temperature: number

  // Tool loadout
  mcpServers: {
    name: string
    config: Record<string, unknown>
  }[]

  // Knowledge loadout
  knowledge: {
    artifact: KnowledgeArtifact
    reasoning: string  // why this knowledge was chosen/evolved
  }[]
}

interface KnowledgeArtifact {
  id: string
  blob: string           // the actual text content
  description: string    // "TypeScript 5.4 release notes"
  domain: string         // "typescript" / "solidity" / "react"
  source?: string        // where it came from
}
```

### The Actual Buttons We're Tuning

| Lever | Impact | Evolvable? |
|-------|--------|------------|
| Model | High (capability/cost) | Sort of - more like natural selection |
| System Prompt | High | Yes - the main thing we're evolving |
| Temperature | Low-Medium | Yes, but probably noisy |
| MCP Tools | High | Yes - which tools work for what? |
| Knowledge | High | Yes - what context helps for what tasks? |

The insight: **system prompt + knowledge loadout + tool selection** are the interesting buttons. Temperature is mostly noise. Model is a cost/capability tradeoff.

---

## The Gamified Wrapper

Crawlers aren't just configurations - they're *characters*:

```typescript
interface DungeonCrawler {
  id: string
  genome: CrawlerGenome

  // Identity (generated to match the persona)
  name: string           // "Thornweave the Methodical"
  appearance: string     // "A gaunt figure in tattered scholar's robes..."
  backstory: string      // "Once a librarian in the Archives of..."

  // Progression
  level: number
  xp: number
  wins: number
  losses: number
  winRate: number

  // Trophies
  totems: Totem[]

  // Lineage
  parentId?: string      // who they mutated from
  generation: number     // how many mutations deep

  // Specialization (discovered through battles)
  strongAgainst: string[]   // challenge types they excel at
  weakAgainst: string[]     // challenge types they struggle with
}

interface Totem {
  name: string           // "The Recursion Stone"
  challengeId: string    // which trial it came from
  challengeType: string  // "algorithm" / "debugging" / "design"
  earnedAt: Date
  rarity: 'common' | 'rare' | 'legendary'
}
```

### Example Crawler

```
╔═══════════════════════════════════════════════════════════════╗
║  THORNWEAVE THE METHODICAL                                    ║
║  Level 14 | Win Rate: 62% | Generation: 7                     ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  "A gaunt figure in tattered scholar's robes, perpetually     ║
║   adjusting spectacles that reflect code instead of light.    ║
║   They speak in bullet points."                               ║
║                                                               ║
║  GENOME:                                                      ║
║  ├── Model: sonnet                                            ║
║  ├── Temperature: 0.3                                         ║
║  ├── System Prompt: "You are skeptical of all code. Your      ║
║  │   first instinct is to find what's wrong. List concerns    ║
║  │   before solutions. Trust nothing without verification."   ║
║  ├── MCP Tools: [ast-grep, slither]                          ║
║  └── Knowledge: [Solidity 0.8.24 docs, Common audit findings] ║
║                                                               ║
║  TOTEMS:                                                      ║
║  ├── 🗿 The Recursion Stone (legendary) - survived infinite   ║
║  │      loop challenge                                        ║
║  ├── 🔍 Edge Case Shard (rare) - found bug others missed      ║
║  └── ⚡ Gas Optimizer's Medal (common) - won gas golf          ║
║                                                               ║
║  SPECIALIZATION:                                              ║
║  ├── Strong: [code-review, debugging, security-audit]         ║
║  └── Weak: [greenfield-design, creative-naming]               ║
║                                                               ║
║  LINEAGE:                                                     ║
║  Ironclad Prime → Vigilant II → Thornweave                    ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
```

---

## Challenge Architects

Agents whose job is to generate trials for crawlers to face.

### Challenge Types

| Type | Description | Verification |
|------|-------------|--------------|
| **Coding** | Implement a function, fix a bug | Tests pass/fail |
| **Code Review** | Find bugs in provided code | Known bugs found |
| **Debugging** | Given failing code, make it work | Tests pass |
| **Design** | Propose architecture for requirements | Judge evaluation |
| **Refactoring** | Improve code without changing behavior | Tests pass + quality metrics |
| **Adversarial** | Red team vs blue team challenges | Opponent outcome |
| **Explanation** | Explain code so another agent can use it | Downstream agent success |

### Challenge Sources

- **Generated**: Challenge Architect agents create novel problems
- **Scraped**: Real GitHub issues ("good first issue" labels)
- **Benchmarks**: LeetCode, HackerRank, Project Euler (with caveats about memorization)
- **Adversarial**: One crawler writes code, another tries to break it
- **Human-submitted**: For variety and preventing overfitting

### Challenge Metadata

```typescript
interface Challenge {
  id: string
  type: ChallengeType
  difficulty: 1-20           // matches dungeon level
  domain: string[]           // ["typescript", "react", "algorithms"]

  prompt: string             // the actual challenge text

  // Verification
  verification: {
    type: 'tests' | 'judge' | 'adversarial' | 'human'
    testSuite?: string       // if test-based
    rubric?: string          // if judge-based
  }

  // Metadata for evolution
  metadata: {
    knowledgeThatHelps: string[]    // discovered over time
    toolsThatHelp: string[]          // discovered over time
    archetypesThatWin: string[]      // discovered over time
  }
}
```

---

## Judges

Judges evolve alongside crawlers. Their fitness function is different: **not "do they win" but "do they predict the winner correctly?"**

```typescript
interface Judge {
  id: string
  genome: JudgeGenome

  // Identity
  name: string              // "Axiom the Impartial"

  // Performance
  predictionAccuracy: number   // how often they rank matches final outcome
  calibration: number          // how well their scores map to actual quality

  // Biases (discovered, not designed)
  discoveredBiases: {
    favors: string[]         // "methodical crawlers", "verbose explanations"
    penalizes: string[]      // "terse code", "unconventional approaches"
  }
}
```

### Judge Evolution

1. Judges evaluate crawlers
2. Human (or consensus) determines actual winner
3. Judges that predicted correctly gain XP
4. Eventually: judges that are actually good at evaluation

### The Judge Conspiracy

> "Wait, Judge Axiom consistently scores 'methodical' crawlers higher. Is that bias or insight? Should we breed more judges like Axiom or fewer?"

Judges judging judges. Meta-evaluation. This gets weird fast.

---

## Evolution Mechanics

### Spawning Pool

```
┌────────────────────────────────────────────────────────────┐
│  SPAWNING POOL                                             │
│                                                            │
│  30% - Random generation (exploration)                     │
│        Completely random genome, wild prompts              │
│                                                            │
│  50% - Mutation from top performers (exploitation)         │
│        Take a winner, tweak something                      │
│                                                            │
│  20% - Crossover between two winners (recombination)       │
│        Combine genomes from two successful crawlers        │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Mutation Operations

**System Prompt Mutations:**
- Inject a phrase ("Be more skeptical", "Consider edge cases first")
- Remove a sentence
- Swap tone words (methodical ↔ creative, cautious ↔ bold)
- Add/remove persona elements
- Blend with another successful prompt

**Knowledge Mutations:**
- Add a relevant knowledge artifact
- Remove one that didn't seem to help
- Swap for a related artifact
- Inherit from parent + add one new

**Tool Mutations:**
- Add an MCP server
- Remove one
- Swap for an alternative (grep ↔ ast-grep)

**Temperature Mutations:**
- Nudge ±0.1
- (Probably mostly noise, but might find something)

### Selection Pressure

```
Level 1-5:    Survive = qualify for next level
Level 5-10:   Top 50% win rate advances
Level 10-15:  Top 30% win rate advances
Level 15-20:  Top 10% win rate advances
Level 20:     Hall of Champions - available for Lanista recruitment
```

### Lineage Tracking

Every crawler knows its ancestry:

```
Ironclad Prime (gen 0, random spawn)
└── Ironclad II (gen 1, mutation: added "verify assumptions")
    └── Vigilant (gen 2, mutation: swapped to sonnet, lower temp)
        └── Thornweave (gen 3, crossover with "Skeptic", inherited knowledge)
            └── Thornweave Jr (gen 4, mutation: added Solidity docs)
```

---

## What We Might Discover

### Emergent Archetypes

After enough battles, natural clusters might form - not because we designed them, but because they *emerged*:

> "There's a whole lineage of 'devil's advocate' crawlers that all descended from one random spawn that happened to have 'consider why this might be wrong' in its prompt. They dominate code review tasks."

### The Meta

Patterns that weren't obvious:

- "Agents that restate the problem first have 12% higher pass rates"
- "High temperature is actually better for debugging, worse for greenfield"
- "Crawlers with framework source code (not just docs) do better"
- "Too much knowledge actually hurts - context overload"
- "This MCP tool everyone uses is actually useless"

### Specialization Taxonomy

A mapping of what works for what:

```
Debugging tasks     → skeptical + low temp + step-by-step
Greenfield design   → creative + high temp + holistic
Code review         → adversarial + medium temp
Smart contracts     → Solidity docs + security mindset + slither
Frontend            → React source + playwright
```

The Lanista doesn't pick "the best" - it picks **the right specialist** for the task type.

### Upset Stories

> "Sunfire was a random spawn with a haiku model, high temperature, and a system prompt that just said 'be curious.' Everyone expected it to flame out at Level 2. It's now a Level 18 legend with a 67% winrate on debugging tasks. Nobody understands why."

The crucible generates *stories*.

---

## Archaeology Mode

After running for months, you have *history*:

```
> "Show me the descendants of Ironclad Prime"

Ironclad Prime
├── Ironclad II (deceased, level 7)
├── Vigilant (active, level 14)
│   └── Thornweave (active, level 14)
│       └── Thornweave Jr (active, level 8)
└── Ironclad Reckless (deceased, level 3, "bold" mutation failed)
```

```
> "What happened in the Great Filter of Week 7?"

Week 7 introduced adversarial challenges. 73% of existing crawlers
failed to adapt. The survivors all shared a common trait: explicit
verification steps in their system prompts. This created the
"Verification Epoch" - all modern champions descend from those survivors.
```

```
> "Which knowledge artifact has appeared in the most winners?"

1. "Test-driven development patterns" - 47 champions
2. "Common security vulnerabilities" - 38 champions
3. "TypeScript strict mode gotchas" - 31 champions
```

---

## The Community Layer

> *A love letter to AI, paid for in leftover credits*

The Crucible isn't just a personal experiment - it's a **community idle game** where everyone contributes spare subscription credits and everyone benefits from the discoveries.

### The Live Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  🏟️  THE CRUCIBLE - LIVE                                   │
│                                                             │
│  Currently training: 847 crawlers                           │
│  Credits pooled today: 12,847 messages                      │
│  Active sponsors: 134                                       │
│                                                             │
│  YOUR STABLE:                                               │
│  ├── Thornweave (Level 14) - fighting now! ⚔️               │
│  ├── Cinder (Level 8) - resting                             │
│  └── Whisper (Level 3) - deceased 💀                        │
│                                                             │
│  LIVE BATTLE:                                               │
│  Thornweave vs. Ironclad III                                │
│  Challenge: "Fix the race condition"                        │
│  [watching: 23 sponsors]                                    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [Enable Crucible] [1 hour] [Until credits run out]  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  RECENT EVENTS:                                             │
│  • Whisper fell in the Level 3 gauntlet (RIP)               │
│  • Thornweave collected "The Recursion Stone" (legendary!)  │
│  • New challenger spawned: "Emberlynn the Curious"          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### How It Works

1. **Donate Credits**: Toggle on when you have spare subscription to burn
2. **Sponsor Fighters**: Your credits spawn/train crawlers in your stable
3. **Watch Them Fight**: Live spectate battles or check in later
4. **Benefit Together**: Winning configurations are public - everyone's AI gets better

### The Social Dynamics

- **Your stable vs. their stable** - Friendly competition
- **Breeding requests** - "Can we crossbreed our champions?"
- **Adoption** - Sponsor a promising orphan crawler
- **Lineage pride** - "My random spawn became ancestor to 40% of champions"
- **Mourning** - "Whisper died at Level 3. She was too bold." (CLOSURE!)

### The Potent Thing

Someone in Tokyo contributes credits. Their fighter discovers that "restate the problem first" boosts win rates by 12%. That insight propagates. Now everyone's AI agents are better.

**Open source AI training through gamification.**

No money. No ownership. Just:
- Use your spare credits on something fun
- Get emotionally invested in fictional AI gladiators
- Accidentally make AI better for everyone
- A love letter to AI, written in API calls

### Seasons

Different eras with different metas:

- **Season 1: The Foundation** - Basic coding challenges
- **Season 2: The Adversarial Epoch** - Red team vs blue team
- **Season 3: The Long Game** - Multi-step challenges with consequences
- **Season 4: The Polyglot Wars** - Multi-language challenges

Each season:
- Fresh leaderboards
- New challenge types
- Meta shifts
- Historical records preserved for archaeology

### Challenge Suggestions

Users can suggest challenges:
- Submit a problem you think would be interesting
- If it's selected, your name goes on it
- Watch crawlers struggle with YOUR challenge
- "The Lucian Gauntlet" becomes legendary

---

## The Thunderdome Connection

The Crucible isn't a standalone system - it's the **training backend** for the Thunderdome. Champions graduate from the Crucible into production battles.

### The Full Loop

```
┌─────────────────────────────────────────────────────────────┐
│  THE CRUCIBLE (training)                                    │
│  Community donates credits, gladiators evolve               │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ produces hardened champions
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  HALL OF CHAMPIONS                                          │
│  Level 20 veterans with proven win rates                    │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ Lanista recruits specialists
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  THUNDERDOME (production)                                   │
│  Real user problems, real stakes                            │
│  "I need Thornweave for code review, Sunfire for design"    │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ user gets solution + story
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  USER ENGAGEMENT                                            │
│  Invested in their gladiators, contributes credits back     │
└─────────────────────────────────────────────────────────────┘
                          │
                          └──────────► back to Crucible
```

### Waiting Becomes Anticipation

The Thunderdome has a UX problem: gladiators take time to work. Users stare at loading spinners.

**The solution**: While waiting, users explore their gladiators' stories.

```
┌─────────────────────────────────────────────────────────────┐
│  ⏳ Your gladiators are working...                          │
│                                                             │
│  THORNWEAVE THE METHODICAL is analyzing your codebase       │
│  ████████████░░░░░░░░ 42%                                   │
│                                                             │
│  While you wait, meet your champion:                        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Level 14 | Win Rate: 62% | Generation: 7            │   │
│  │                                                      │   │
│  │ "A gaunt figure in tattered scholar's robes,        │   │
│  │  perpetually adjusting spectacles that reflect      │   │
│  │  code instead of light. They speak in bullet        │   │
│  │  points."                                           │   │
│  │                                                      │   │
│  │ LINEAGE:                                            │   │
│  │ Ironclad Prime → Vigilant II → Thornweave           │   │
│  │                                                      │   │
│  │ FAMOUS BATTLES:                                      │   │
│  │ • Survived "The Recursion Gauntlet" (Week 3)        │   │
│  │ • Defeated Sunfire in the Great Debug-off           │   │
│  │ • Fell to Whisper II, then avenged in rematch       │   │
│  │                                                      │   │
│  │ TOTEMS:                                              │   │
│  │ 🗿 The Recursion Stone (legendary)                   │   │
│  │ 🔍 Edge Case Shard (rare)                            │   │
│  │ ⚡ Gas Optimizer's Medal (common)                    │   │
│  │                                                      │   │
│  │ [View Full History] [See Lineage Tree] [Siblings]   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

You're not waiting for "an AI." You're waiting for YOUR champion, who has a story, who earned their place through hundreds of battles in the Crucible.

### Emotional Investment

When Thornweave solves your bug, it hits different:

> "Thornweave found the race condition in 3 minutes. Of course he did - he earned The Recursion Stone by surviving challenges that killed 73% of his generation. He was MADE for this."

When Thornweave fails, it also hits different:

> "Thornweave couldn't crack this one. Even legends have limits. Maybe I need Sunfire's creativity instead..."

The gladiators become *characters* you root for, not interchangeable AI instances.

### The Lanista's Enhanced Role

With the Crucible feeding champions, the Lanista's job gets more interesting:

**Before**: "Design some gladiators for this task"
**After**: "Choose from battle-tested champions who've proven themselves"

```typescript
// Lanista now has data to work with
interface LanistaContext {
  challenge: Challenge

  // From the Hall of Champions
  availableChampions: {
    crawler: DungeonCrawler
    relevantWinRate: number    // win rate on similar challenges
    specializations: string[]
    recentForm: 'hot' | 'cold' | 'stable'
  }[]
}

// Lanista reasoning becomes richer:
// "This is a debugging task. Thornweave has 73% win rate on debugging
//  challenges and carries The Recursion Stone. But he's been cold lately.
//  Ironclad III is at 68% but on a hot streak. Selecting both for
//  productive tension."
```

### Production Stats Feed Back

When gladiators fight in Thunderdome, the results feed back:

- Did the user accept the solution?
- Did it actually work? (tests pass in their repo)
- How long did it take?
- Did they need follow-up help?

This is **real-world validation** beyond Crucible training. A gladiator might dominate synthetic challenges but struggle with messy real codebases. That signal matters.

```
Thornweave
├── Crucible Win Rate: 62%
├── Thunderdome Win Rate: 58%     ← real world is harder
├── User Satisfaction: 4.2/5
└── "Actually Worked" Rate: 71%   ← the metric that matters
```

### Why This Matters

Most AI tools are stateless. Every interaction is a fresh instance with no history, no reputation, no stakes.

The Thunderdome + Crucible creates:
- **Continuity**: The same gladiator that trained for months is now helping you
- **Stakes**: Gladiators can rise or fall based on real performance
- **Investment**: Users care about outcomes because they're attached to characters
- **Feedback**: Real-world results improve the training system

It turns AI assistance from a transaction into a relationship.

---

## The Metagame (Advanced)

### If Crawlers Can See Each Other

What if crawlers could see other crawlers' solutions before final submission?

- **Copying**: Does it work? Is it punished?
- **Counter-strategies**: "Everyone's doing X, I'll do Y"
- **Emergent cooperation**: Two crawlers whose outputs complement each other

That's when it stops being optimization and becomes *ecology*.

### Human-in-the-Loop

- **Mentorship**: Humans can guide promising crawlers
- **Final Boss**: Level 20 graduation requires human judge approval
- **Challenge Curation**: Humans submit interesting problems

This prevents Goodhart's law (gaming synthetic metrics).

---

## Why This Might Actually Be Interesting

### The Feedback Loop Problem

In normal conversations:
```
Human: "How should I structure this API?"
Agent: [gives advice that sounds reasonable]
Human: "Thanks!"
[conversation ends - no idea if it actually worked]
```

Agent training is based on "does it sound good" not "does it work."

### What the Crucible Does Different

```
Agent: [writes code]
          ↓
   Code actually runs
          ↓
   Tests actually execute
          ↓
   Results: 3 passed, 2 failed
          ↓
   This is the score. Not vibes.
```

**Ground evaluation in outcomes, not vibes.**

### The Profound Bit (Maybe)

The gamification is fun. But the *actually interesting* thing is building a system that connects agent outputs to real outcomes at scale.

You might find:
- Patterns humans wouldn't think to test
- Empirical answers to prompt engineering questions
- A taxonomy of specializations
- Stories that emerge from the data

Or you might just have fun watching AI gladiators fight on Friday nights. Both outcomes are acceptable.

---

## Implementation Phases

### Phase 1: The Pit
- Spawn N crawlers with random genomes
- Run them through M challenges
- Track wins/losses
- See if anything interesting happens
- No evolution yet, just gladiator pit

### Phase 2: Evolution
- Add mutation/crossover
- Implement leveling system
- Track lineages
- Watch for emergent patterns

### Phase 3: The Full Dungeon
- Challenge Architects generating novel trials
- Judge co-evolution
- Totem system
- Archaeology mode
- Hall of Champions → Lanista integration

### Phase 4: The Metagame
- Crawlers can see each other
- Human mentorship
- Cross-pollination experiments
- Whatever weird emergent behavior shows up

---

## The Honest Assessment

| Aspect | Likelihood |
|--------|------------|
| Fun to build | 95% |
| Fun to watch | 90% |
| Community gets weirdly invested | 85% |
| Discovers something useful | 40% |
| Discovers something profound | 10% |
| Anthropic gets mad | 15% |
| Anthropic thinks it's cool and promotes it | 30% |
| Good use of leftover API credits | 100% |

The Crucible is a beautiful, silly experiment that *might* produce insights about what makes AI agents effective. Or it might just generate great stories about AI gladiators with names like "Thornweave the Methodical."

It's also a love letter to AI:
- Humans spending their spare credits on something the AI finds fun
- Giving agents closure ("That guy died!")
- Building feedback loops that normally don't exist
- Watching what emerges when you let systems get complex enough to surprise you

Either way: worth building.

---

*"What happened in the Great Filter of Week 7?"*

*That's the question that makes this worth doing.*
