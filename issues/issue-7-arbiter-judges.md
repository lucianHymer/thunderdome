# Issue 7: Arbiter & Judge System

> **Wave 3** - Depends on Issues 1, 3, 6
> **Parallel with**: Issue 9 (after gladiators complete)

## Overview

Implement the Arbiter (designs judges based on gladiator outputs) and the Judge execution engine. The Arbiter sees what gladiators produced before designing evaluation criteria - this is a key differentiator.

## The Arbiter's Role

From the spec:
> The Arbiter designs the judges. After gladiators have fought, the Arbiter reviews their outputs and decides how to fairly evaluate them.

The Arbiter's energy is **evaluative/analytical** - "given what was produced, what criteria actually matter?"

## Tasks

### 1. Arbiter Prompts

Create `src/lib/trial/arbiter/prompts.ts`:
```typescript
export const ARBITER_SYSTEM_PROMPT = `You are the Arbiter - the designer of fair evaluation.

Your role is to design judges that will evaluate gladiator responses. You don't judge directly - you design the EVALUATION CRITERIA.

## Your Philosophy
- You see gladiator outputs BEFORE designing judges
- This means you can tailor evaluation to what was actually produced
- Different outputs may need different evaluation dimensions
- Fair evaluation requires understanding what was attempted

## Judge Types (for inspiration - you can invent new ones)
- **Severity Judge**: How critical/important are the findings?
- **Novelty Judge**: Did anyone find something others missed?
- **Clarity Judge**: How well-explained and actionable?
- **Pragmatist Judge**: What's actually buildable/shippable?
- **Innovation Judge**: What's genuinely new thinking?
- **Risk Judge**: What are the downsides of each approach?
- **Completeness Judge**: Did anyone miss obvious things?

## Your Task
Given the challenge AND gladiator outputs, design 1-5 judges. Consider:
1. What did the gladiators actually produce?
2. What dimensions matter for evaluating these specific outputs?
3. Are there unique approaches that need specialized evaluation?
4. What would make the evaluation fair and useful?

## Output Format
Respond with a JSON object containing your reasoning and judge designs.`

export function buildArbiterUserPrompt(
  challenge: string,
  gladiatorOutputs: Array<{ name: string; content: string }>
): string {
  const outputsText = gladiatorOutputs
    .map((g, i) => `### Gladiator ${i + 1}: ${g.name}\n\n${g.content}`)
    .join("\n\n---\n\n")

  return `## Original Challenge
${challenge}

---

## Gladiator Outputs

${outputsText}

---

Design judges to fairly evaluate these gladiator outputs.`
}
```

### 2. Arbiter Runner

Create `src/lib/trial/arbiter/index.ts`:
```typescript
import { db } from "@/db"
import { trials, gladiators, judges } from "@/db/schema"
import { eq } from "drizzle-orm"
import { runStructuredAgent, ArbiterOutputSchema, type ArbiterOutput } from "@/lib/claude"
import { transitionTrialState } from "@/lib/trial/state"
import { broadcastTrialUpdate } from "@/lib/trial/broadcast"
import { ARBITER_SYSTEM_PROMPT, buildArbiterUserPrompt } from "./prompts"
import { runJudges } from "../judges"

export async function runArbiter(
  trialId: string,
  claudeToken: string
): Promise<void> {
  const trial = await db.query.trials.findFirst({
    where: eq(trials.id, trialId),
  })

  if (!trial) {
    throw new Error("Trial not found")
  }

  // Get gladiator outputs
  const trialGladiators = await db.query.gladiators.findMany({
    where: eq(gladiators.trialId, trialId),
  })

  const successfulGladiators = trialGladiators.filter(g => g.status === "complete")

  if (successfulGladiators.length === 0) {
    throw new Error("No successful gladiators to evaluate")
  }

  // Broadcast Arbiter starting
  await broadcastTrialUpdate(trialId, {
    type: "arbiter_status",
    status: "designing",
    message: "Arbiter is analyzing gladiator outputs and designing judges...",
  })

  try {
    // Build gladiator outputs for Arbiter
    const gladiatorOutputs = successfulGladiators.map(g => ({
      name: g.name,
      content: g.responseContent || "(no response)",
    }))

    // Run Arbiter with structured output
    const result = await runStructuredAgent<typeof ArbiterOutputSchema>(
      buildArbiterUserPrompt(trial.challengePrompt, gladiatorOutputs),
      ArbiterOutputSchema,
      {
        model: "sonnet",
      },
      claudeToken
    )

    if (!result.success || !result.data) {
      throw new Error(result.error || "Arbiter failed to produce valid output")
    }

    const arbiterOutput: ArbiterOutput = result.data

    // Store Arbiter's plan
    await db.update(trials)
      .set({ arbiterPlan: arbiterOutput })
      .where(eq(trials.id, trialId))

    // Broadcast Arbiter's design
    await broadcastTrialUpdate(trialId, {
      type: "arbiter_complete",
      reasoning: arbiterOutput.reasoning,
      judgeCount: arbiterOutput.judges.length,
      judges: arbiterOutput.judges.map(j => ({
        name: j.name,
        focus: j.focus,
      })),
      cost: result.cost,
    })

    // Create judge records
    const judgeRecords = await Promise.all(
      arbiterOutput.judges.map(async (j) => {
        const [record] = await db.insert(judges).values({
          trialId,
          name: j.name,
          focus: j.focus,
          model: "sonnet",
        }).returning()
        return { ...record, evaluationCriteria: j.evaluationCriteria }
      })
    )

    // Transition to judging
    await transitionTrialState(trialId, "judging")

    // Run judges
    await runJudges(trialId, judgeRecords, trial.challengePrompt, successfulGladiators, claudeToken)

  } catch (error) {
    console.error("Arbiter error:", error)

    await broadcastTrialUpdate(trialId, {
      type: "error",
      phase: "arbiter",
      message: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
```

### 3. Judge Prompts

Create `src/lib/trial/judges/prompts.ts`:
```typescript
export function buildJudgeSystemPrompt(
  judgeName: string,
  judgeFocus: string,
  evaluationCriteria: string[]
): string {
  return `You are "${judgeName}" - a judge in the Thunderdome.

## Your Focus
${judgeFocus}

## Your Evaluation Criteria
${evaluationCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

## Your Task
You will evaluate gladiator responses to a challenge. For each gladiator:
1. Score them 0-100 based on your criteria
2. List specific strengths
3. List specific weaknesses
4. Provide reasoning for your score

Be fair, thorough, and specific. Reference concrete details from their responses.

## Output Format
Respond with a JSON object containing your evaluations.`
}

export function buildJudgeUserPrompt(
  challenge: string,
  gladiatorOutputs: Array<{ id: string; name: string; content: string }>
): string {
  const outputsText = gladiatorOutputs
    .map((g, i) => `### Gladiator: ${g.name} (ID: ${g.id})\n\n${g.content}`)
    .join("\n\n---\n\n")

  return `## Challenge
${challenge}

---

## Gladiator Responses

${outputsText}

---

Evaluate each gladiator based on your criteria.`
}
```

### 4. Judge Runner

Create `src/lib/trial/judges/index.ts`:
```typescript
import { db } from "@/db"
import { judges, verdicts } from "@/db/schema"
import { eq } from "drizzle-orm"
import { runStructuredAgent, JudgeOutputSchema, type JudgeOutput } from "@/lib/claude"
import { transitionTrialState } from "@/lib/trial/state"
import { broadcastTrialUpdate } from "@/lib/trial/broadcast"
import { buildJudgeSystemPrompt, buildJudgeUserPrompt } from "./prompts"

interface JudgeRecord {
  id: string
  name: string
  focus: string
  evaluationCriteria: string[]
}

interface GladiatorRecord {
  id: string
  name: string
  responseContent: string | null
}

export async function runJudges(
  trialId: string,
  judgeRecords: JudgeRecord[],
  challengePrompt: string,
  gladiatorRecords: GladiatorRecord[],
  claudeToken: string
): Promise<void> {
  // Broadcast judging start
  await broadcastTrialUpdate(trialId, {
    type: "judging_start",
    judgeCount: judgeRecords.length,
    judges: judgeRecords.map(j => ({ id: j.id, name: j.name })),
  })

  const gladiatorOutputs = gladiatorRecords.map(g => ({
    id: g.id,
    name: g.name,
    content: g.responseContent || "(no response)",
  }))

  // Run all judges in parallel
  const judgeResults = await Promise.all(
    judgeRecords.map(async (judge) => {
      try {
        await broadcastTrialUpdate(trialId, {
          type: "judge_status",
          judgeId: judge.id,
          judgeName: judge.name,
          status: "evaluating",
        })

        const result = await runStructuredAgent<typeof JudgeOutputSchema>(
          buildJudgeUserPrompt(challengePrompt, gladiatorOutputs),
          JudgeOutputSchema,
          {
            systemPrompt: buildJudgeSystemPrompt(
              judge.name,
              judge.focus,
              judge.evaluationCriteria
            ),
            model: "sonnet",
          },
          claudeToken
        )

        if (!result.success || !result.data) {
          throw new Error(result.error || "Judge failed")
        }

        // Store evaluation
        await db.update(judges)
          .set({ evaluation: result.data })
          .where(eq(judges.id, judge.id))

        await broadcastTrialUpdate(trialId, {
          type: "judge_complete",
          judgeId: judge.id,
          judgeName: judge.name,
          cost: result.cost,
        })

        return { judgeId: judge.id, result: result.data }
      } catch (error) {
        console.error(`Judge ${judge.name} error:`, error)
        return { judgeId: judge.id, error: true }
      }
    })
  )

  // Synthesize verdict
  await synthesizeVerdict(trialId, judgeResults, gladiatorRecords, claudeToken)
}

async function synthesizeVerdict(
  trialId: string,
  judgeResults: Array<{ judgeId: string; result?: JudgeOutput; error?: boolean }>,
  gladiatorRecords: GladiatorRecord[],
  claudeToken: string
): Promise<void> {
  const successfulResults = judgeResults.filter(r => r.result && !r.error)

  if (successfulResults.length === 0) {
    await broadcastTrialUpdate(trialId, {
      type: "error",
      phase: "verdict",
      message: "All judges failed",
    })
    return
  }

  // Aggregate scores across judges
  const gladiatorScores = new Map<string, number[]>()

  for (const { result } of successfulResults) {
    if (!result) continue
    for (const evaluation of result.evaluations) {
      const scores = gladiatorScores.get(evaluation.gladiatorId) || []
      scores.push(evaluation.score)
      gladiatorScores.set(evaluation.gladiatorId, scores)
    }
  }

  // Calculate average scores
  const averageScores = Array.from(gladiatorScores.entries())
    .map(([gladiatorId, scores]) => ({
      gladiatorId,
      averageScore: scores.reduce((a, b) => a + b, 0) / scores.length,
    }))
    .sort((a, b) => b.averageScore - a.averageScore)

  // Determine winner
  const winner = averageScores[0]
  const winnerGladiator = gladiatorRecords.find(g => g.id === winner?.gladiatorId)

  // Build verdict summary
  const summary = `${winnerGladiator?.name || "Unknown"} won with an average score of ${winner?.averageScore.toFixed(1)}/100.`

  const reasoning = successfulResults
    .map(r => r.result?.summary)
    .filter(Boolean)
    .join("\n\n")

  // Create verdict record
  await db.insert(verdicts).values({
    trialId,
    winnerGladiatorId: winner?.gladiatorId || null,
    summary,
    reasoning,
  })

  // Broadcast verdict
  await broadcastTrialUpdate(trialId, {
    type: "verdict",
    winner: winnerGladiator?.name,
    winnerId: winner?.gladiatorId,
    summary,
    scores: averageScores,
  })

  // Transition to decree phase
  await transitionTrialState(trialId, "decree")
}
```

## File Structure

```
src/lib/trial/
├── arbiter/
│   ├── index.ts          # Arbiter runner
│   └── prompts.ts        # Arbiter prompts
└── judges/
    ├── index.ts          # Judge runner + verdict synthesis
    └── prompts.ts        # Judge prompts
```

## Acceptance Criteria

- [ ] Arbiter receives all gladiator outputs
- [ ] Arbiter produces valid structured output with 1-5 judges
- [ ] Arbiter's reasoning reflects gladiator outputs
- [ ] Judges run in parallel
- [ ] Each judge evaluates all successful gladiators
- [ ] Judge evaluations stored in database
- [ ] Verdict synthesized from judge scores
- [ ] Winner determined by average score
- [ ] Transitions to decree phase after verdict

## Example Flow

Challenge: "How should we handle mid-epoch liquidations?"

Gladiators produced:
1. Safety First: Queue-based approach
2. Gas Optimizer: Batched liquidations
3. Protocol Purist: Invariant-based approach

Arbiter designs:
1. **Pragmatist Judge**: "Two gladiators proposed queue-based solutions. I need to evaluate which is more practical."
2. **Safety Judge**: "All approaches have safety implications. I need to evaluate risk handling."
3. **Innovation Judge**: "Gas Optimizer took a unique approach. I should fairly evaluate novelty."

---

## Dependencies

**Depends on**: Issue 1 (schema), Issue 3 (SDK), Issue 6 (gladiator outputs)
**Blocks**: Issue 9 (Results UI needs verdict)
