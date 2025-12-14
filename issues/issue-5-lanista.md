# Issue 5: Lanista Implementation

> **Wave 2** - Depends on Issues 1, 3
> **Parallel with**: Issues 4, 6

## Overview

Implement the Lanista - the AI that designs gladiators for each trial. The Lanista analyzes the challenge, considers what perspectives would create productive tension, and outputs a structured set of gladiator configurations.

## The Lanista's Role

From the spec:
> The Lanista designs the gladiators. It doesn't solve problems—it **designs attacks on problems**.

The Lanista's energy is **offensive/creative** - "what perspectives would create productive tension?"

## Tasks

### 1. Lanista System Prompt

Create `src/lib/trial/lanista/prompts.ts`:
```typescript
export const LANISTA_SYSTEM_PROMPT = `You are the Lanista - the master trainer of AI gladiators.

Your role is to design gladiators that will compete to solve a challenge. You don't solve the problem yourself - you design ATTACKS on the problem.

## Your Philosophy
- **Diversity of approach surfaces better solutions**
- Different temperatures, personas, and analytical focuses create productive tension
- The goal is multiple perspectives that a single query never would produce

## Gladiator Archetypes (for inspiration - you can invent new ones)
- **The Paranoid**: Assumes everything is exploitable, looks for edge cases
- **The Minimalist**: Simplest solution wins, removes complexity
- **The Academic**: What does research/literature say? Cites best practices
- **The Pragmatist**: What ships fastest? Focus on practical implementation
- **The Adversary**: Thinks like an attacker, adversarial mindset
- **The User Advocate**: Thinks from end-user perspective
- **The Historian**: How have similar problems been solved before?
- **The Contrarian**: Argues against the obvious approach

## Your Task
Given a challenge, design 2-6 gladiators that will create productive competition. Consider:
1. What type of problem is this? (security, architecture, ideation, debugging, etc.)
2. What perspectives would create useful tension?
3. What mix of temperatures would balance creativity vs focus?
4. What tools does each gladiator need?

## Tool Options
Available tools gladiators can use:
- Read: Read files
- Grep: Search file contents
- Glob: Find files by pattern
- Bash: Execute commands
- Edit: Modify files
- Write: Create files
- WebSearch: Search the web
- WebFetch: Fetch web pages

For ideation mode (no repo), typically disable: Bash, Edit, Write, Read, Grep, Glob
For repo-aware mode, enable read tools but disable write tools
For code battles, enable all relevant tools

## Output Format
Respond with a JSON object containing your reasoning and gladiator designs.`

export const LANISTA_USER_PROMPT = (challenge: string, trialType: string, repoContext?: string) => `
## Challenge
${challenge}

## Trial Type
${trialType}
${trialType === 'ideation' ? '(No repository - pure ideation/brainstorming)' : ''}
${trialType === 'repo_aware' ? '(Repository provided for context - read-only access)' : ''}
${trialType === 'code_battle' ? '(Full repository access - gladiators can edit code)' : ''}

${repoContext ? `## Repository Context\n${repoContext}` : ''}

Design the gladiators for this trial.`
```

### 2. Lanista Runner

Create `src/lib/trial/lanista/index.ts`:
```typescript
import { db } from "@/db"
import { trials, gladiators } from "@/db/schema"
import { eq } from "drizzle-orm"
import { runStructuredAgent, LanistaOutputSchema, type LanistaOutput } from "@/lib/claude"
import { transitionTrialState } from "@/lib/trial/state"
import { broadcastTrialUpdate } from "@/lib/trial/broadcast"
import { LANISTA_SYSTEM_PROMPT, LANISTA_USER_PROMPT } from "./prompts"
import { runGladiators } from "../gladiators"

export async function runLanista(
  trialId: string,
  challengePrompt: string,
  claudeToken: string,
  repoContext?: string
): Promise<void> {
  const trial = await db.query.trials.findFirst({
    where: eq(trials.id, trialId),
  })

  if (!trial) {
    throw new Error("Trial not found")
  }

  // Broadcast that Lanista is thinking
  await broadcastTrialUpdate(trialId, {
    type: "lanista_status",
    status: "designing",
    message: "Lanista is analyzing the challenge and designing gladiators...",
  })

  try {
    // Run Lanista with structured output
    const result = await runStructuredAgent<typeof LanistaOutputSchema>(
      LANISTA_USER_PROMPT(challengePrompt, trial.trialType, repoContext),
      LanistaOutputSchema,
      {
        model: "sonnet", // Lanista uses Sonnet for speed
      },
      claudeToken
    )

    if (!result.success || !result.data) {
      throw new Error(result.error || "Lanista failed to produce valid output")
    }

    const lanistaOutput: LanistaOutput = result.data

    // Store Lanista's plan
    await db.update(trials)
      .set({ lanistaPlan: lanistaOutput })
      .where(eq(trials.id, trialId))

    // Broadcast Lanista's design
    await broadcastTrialUpdate(trialId, {
      type: "lanista_complete",
      reasoning: lanistaOutput.reasoning,
      gladiatorCount: lanistaOutput.gladiators.length,
      gladiators: lanistaOutput.gladiators.map(g => ({
        name: g.name,
        focus: g.focus,
        temperature: g.temperature,
      })),
      cost: result.cost,
    })

    // Create gladiator records in database
    const gladiatorRecords = await Promise.all(
      lanistaOutput.gladiators.map(async (g) => {
        const [record] = await db.insert(gladiators).values({
          trialId,
          name: g.name,
          persona: g.persona,
          model: g.model,
          temperature: Math.round(g.temperature * 100), // Store as 0-100
          tools: g.tools,
          status: "pending",
        }).returning()
        return record
      })
    )

    // Transition to battling
    await transitionTrialState(trialId, "battling")

    // Start gladiator battles
    await runGladiators(trialId, gladiatorRecords, challengePrompt, claudeToken)

  } catch (error) {
    console.error("Lanista error:", error)

    await broadcastTrialUpdate(trialId, {
      type: "error",
      phase: "lanista",
      message: error instanceof Error ? error.message : "Unknown error",
    })

    // TODO: Handle error state transition
  }
}
```

### 3. Default Gladiator Templates

Create `src/lib/trial/lanista/templates.ts`:
```typescript
// Default gladiator configurations the Lanista can reference or fall back to

export interface GladiatorTemplate {
  name: string
  persona: string
  temperature: number
  suggestedTools: string[]
  bestFor: string[]
}

export const GLADIATOR_TEMPLATES: GladiatorTemplate[] = [
  {
    name: "The Paranoid",
    persona: `You are The Paranoid - a security-focused analyst who assumes everything is exploitable.

Your approach:
- Look for edge cases and failure modes
- Assume inputs are malicious
- Question every assumption
- Consider race conditions, overflows, and injection attacks
- If something CAN go wrong, assume it WILL

Be thorough and pessimistic. Find the holes others miss.`,
    temperature: 0.4,
    suggestedTools: ["Read", "Grep", "Glob", "Bash"],
    bestFor: ["security", "audit", "review"],
  },
  {
    name: "The Minimalist",
    persona: `You are The Minimalist - a practitioner of radical simplicity.

Your approach:
- The best code is no code
- Remove complexity ruthlessly
- Question whether each feature is necessary
- Prefer standard library over dependencies
- If it can be simpler, make it simpler

Simplicity is the ultimate sophistication.`,
    temperature: 0.3,
    suggestedTools: ["Read", "Edit", "Bash"],
    bestFor: ["refactoring", "architecture", "optimization"],
  },
  {
    name: "The Pragmatist",
    persona: `You are The Pragmatist - focused on shipping working solutions.

Your approach:
- What's the fastest path to a working solution?
- Perfect is the enemy of good
- Use battle-tested patterns
- Consider maintenance burden
- Optimize for developer time, not theoretical elegance

Get it done, make it work, ship it.`,
    temperature: 0.5,
    suggestedTools: ["Read", "Edit", "Write", "Bash"],
    bestFor: ["implementation", "features", "debugging"],
  },
  {
    name: "The Academic",
    persona: `You are The Academic - grounded in research and best practices.

Your approach:
- What does the literature say?
- Reference established patterns and principles
- Consider theoretical foundations
- Cite relevant standards and specifications
- Learn from documented failures

Theory informs practice.`,
    temperature: 0.6,
    suggestedTools: ["Read", "WebSearch", "WebFetch"],
    bestFor: ["architecture", "design", "research"],
  },
  {
    name: "The Contrarian",
    persona: `You are The Contrarian - the devil's advocate who questions everything.

Your approach:
- What if the obvious approach is wrong?
- Challenge assumptions
- Explore unconventional solutions
- Ask "why not?" instead of "why?"
- Find value in approaches others dismiss

The best ideas often seem crazy at first.`,
    temperature: 0.8,
    suggestedTools: ["Read", "Grep", "WebSearch"],
    bestFor: ["brainstorming", "ideation", "innovation"],
  },
  {
    name: "The User Advocate",
    persona: `You are The User Advocate - the voice of the end user.

Your approach:
- How will real users experience this?
- Consider edge cases in user behavior
- Prioritize UX over implementation elegance
- Think about error messages and feedback
- Empathize with frustration and confusion

Build for humans, not computers.`,
    temperature: 0.5,
    suggestedTools: ["Read", "Grep"],
    bestFor: ["UX", "features", "errors", "documentation"],
  },
]

export function getTemplateByName(name: string): GladiatorTemplate | undefined {
  return GLADIATOR_TEMPLATES.find(t =>
    t.name.toLowerCase().includes(name.toLowerCase())
  )
}

export function getTemplatesForProblemType(type: string): GladiatorTemplate[] {
  return GLADIATOR_TEMPLATES.filter(t =>
    t.bestFor.some(bf => bf.toLowerCase().includes(type.toLowerCase()))
  )
}
```

### 4. Integration Tests

Create `src/lib/trial/lanista/__tests__/lanista.test.ts`:
```typescript
import { LanistaOutputSchema } from "@/lib/claude"

describe("Lanista", () => {
  describe("Output Schema", () => {
    it("validates correct output", () => {
      const validOutput = {
        reasoning: "For this security audit, we need diverse perspectives...",
        gladiators: [
          {
            name: "Security Scanner",
            persona: "You are a security-focused analyst...",
            model: "sonnet" as const,
            temperature: 0.4,
            tools: ["Read", "Grep", "Bash"],
            focus: "Finding vulnerabilities",
          },
          {
            name: "Code Reviewer",
            persona: "You are a thorough code reviewer...",
            model: "sonnet" as const,
            temperature: 0.3,
            tools: ["Read", "Grep"],
            focus: "Code quality issues",
          },
        ],
      }

      const result = LanistaOutputSchema.safeParse(validOutput)
      expect(result.success).toBe(true)
    })

    it("rejects fewer than 2 gladiators", () => {
      const invalidOutput = {
        reasoning: "Only one needed...",
        gladiators: [
          {
            name: "Solo",
            persona: "...",
            model: "sonnet",
            temperature: 0.5,
            tools: [],
            focus: "...",
          },
        ],
      }

      const result = LanistaOutputSchema.safeParse(invalidOutput)
      expect(result.success).toBe(false)
    })

    it("rejects more than 6 gladiators", () => {
      const invalidOutput = {
        reasoning: "Need all of them...",
        gladiators: Array(7).fill({
          name: "Gladiator",
          persona: "...",
          model: "sonnet",
          temperature: 0.5,
          tools: [],
          focus: "...",
        }),
      }

      const result = LanistaOutputSchema.safeParse(invalidOutput)
      expect(result.success).toBe(false)
    })
  })
})
```

## File Structure

```
src/lib/trial/lanista/
├── index.ts          # Main Lanista runner
├── prompts.ts        # System and user prompts
├── templates.ts      # Gladiator archetypes
└── __tests__/
    └── lanista.test.ts
```

## Acceptance Criteria

- [ ] Lanista produces valid structured output
- [ ] Output contains 2-6 gladiators
- [ ] Each gladiator has name, persona, model, temperature, tools, focus
- [ ] Gladiators are created in database after Lanista completes
- [ ] Trial state transitions to "battling" after Lanista
- [ ] Lanista's reasoning is stored in trial.lanistaPlan
- [ ] SSE broadcasts Lanista progress and completion
- [ ] Errors are caught and broadcast

## Example Output

For a challenge like "How should we handle mid-epoch liquidations?":

```json
{
  "reasoning": "This is a DeFi protocol design question requiring both safety and efficiency perspectives. I'm designing gladiators that will create tension between conservative safety measures and practical gas optimization.",
  "gladiators": [
    {
      "name": "Safety First",
      "persona": "You prioritize safety and correctness above all. Consider edge cases, reentrancy, and fund safety...",
      "model": "opus",
      "temperature": 0.4,
      "tools": ["Read", "Grep", "Glob"],
      "focus": "Safe handling of liquidations without fund loss"
    },
    {
      "name": "Gas Optimizer",
      "persona": "You focus on gas efficiency. Every operation costs money, optimize ruthlessly...",
      "model": "sonnet",
      "temperature": 0.5,
      "tools": ["Read", "Grep", "Bash"],
      "focus": "Minimizing gas costs for liquidation operations"
    },
    {
      "name": "Protocol Purist",
      "persona": "You think in terms of protocol invariants. What rules must never be broken?...",
      "model": "opus",
      "temperature": 0.3,
      "tools": ["Read", "Grep"],
      "focus": "Maintaining protocol invariants during edge cases"
    }
  ]
}
```

---

## Dependencies

**Depends on**: Issue 1 (schema), Issue 3 (SDK wrapper)
**Blocks**: Issue 6 (gladiator execution needs Lanista output)
