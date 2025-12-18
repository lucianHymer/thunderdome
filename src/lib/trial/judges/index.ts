/**
 * Judge runner - evaluates gladiator outputs and synthesizes verdict
 *
 * Now runs inside the trial container with repo access so judges can:
 * - Run tests to verify gladiator claims
 * - Inspect actual code changes
 * - Provide evidence-based evaluations
 */

import { eq } from "drizzle-orm";
import { db } from "../../../db/index";
import { judges, trials, verdicts } from "../../../db/schema";
import {
  type CostInfo,
  type JudgeOutput,
  JudgeOutputSchema,
  runStructuredAgentInContainerWithRetry,
  runStructuredAgentWithRetry,
} from "../../claude/index";
import type { TrialContainer } from "../../docker/container";
import { transitionTrialState } from "../state";
import type { StatusCallback } from "../types";
import { buildJudgeSystemPrompt, buildJudgeUserPrompt } from "./prompts";

/**
 * Type for a judge record from the database
 */
type JudgeRecord = {
  id: string;
  trialId: string;
  name: string;
  focus: string;
  model: string;
  evaluation: string | null;
  createdAt: Date;
};

/**
 * Type for a gladiator record from the database
 */
type GladiatorRecord = {
  id: string;
  trialId: string;
  name: string;
  persona: string;
  model: string;
  temperature: number;
  tools: string;
  branchName: string;
  status: string;
  responseContent: string | null;
  streamLog: string | null;
  createdAt: Date;
};

/**
 * Runs a single judge to evaluate gladiators
 */
async function runSingleJudge(
  judge: JudgeRecord,
  challenge: string,
  gladiatorOutputs: Array<{
    id: string;
    name: string;
    responseContent: string;
    branchName?: string;
  }>,
  oauthToken: string,
  onStatus?: StatusCallback,
  container?: TrialContainer,
): Promise<{ judgeId: string; output: JudgeOutput; cost: CostInfo }> {
  try {
    // Notify that judge is thinking
    onStatus?.({
      type: "judge_thinking",
      data: {
        judgeId: judge.id,
        judgeName: judge.name,
        focus: judge.focus,
      },
    });

    // Parse evaluation criteria from the stored evaluation JSON
    const storedEvaluation = judge.evaluation
      ? JSON.parse(judge.evaluation)
      : { evaluationCriteria: [] };
    const evaluationCriteria = storedEvaluation.evaluationCriteria || [];

    // Build prompts
    const systemPrompt = buildJudgeSystemPrompt(judge.name, judge.focus, evaluationCriteria);
    const userPrompt = buildJudgeUserPrompt(challenge, gladiatorOutputs);

    // Run the judge - in container if available (code battles), otherwise host-based
    const result = container
      ? await runStructuredAgentInContainerWithRetry(
          container,
          userPrompt,
          JudgeOutputSchema,
          {
            model: judge.model === "opus" ? "opus" : "sonnet",
            tools: ["Read", "Bash", "Glob", "Grep"], // Can run tests, inspect code
            maxTurns: 25,
            systemPrompt,
          },
          2,
          oauthToken,
        )
      : await runStructuredAgentWithRetry(
          userPrompt,
          JudgeOutputSchema,
          {
            model: judge.model,
            allowedTools: [], // No tools for non-code-battle trials
            maxTurns: 5,
            systemPrompt,
            permissionMode: "bypassPermissions",
          },
          2,
          oauthToken,
        );

    if (!result.success || !result.data) {
      throw new Error(`Judge ${judge.name} failed: ${result.error || "No data returned"}`);
    }

    // Notify that judge is complete
    onStatus?.({
      type: "judge_complete",
      data: {
        judgeId: judge.id,
        judgeName: judge.name,
        cost: result.cost,
      },
    });

    return {
      judgeId: judge.id,
      output: result.data,
      cost: result.cost,
    };
  } catch (error) {
    onStatus?.({
      type: "judge_error",
      data: {
        judgeId: judge.id,
        judgeName: judge.name,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    throw error;
  }
}

/**
 * Synthesizes a verdict from all judge evaluations
 */
async function synthesizeVerdict(
  trialId: string,
  _challenge: string,
  judgeResults: Array<{
    judgeId: string;
    judgeName: string;
    output: JudgeOutput;
  }>,
  gladiatorRecords: GladiatorRecord[],
  onStatus?: StatusCallback,
): Promise<void> {
  try {
    // Check if verdict already exists (resume case)
    const existingVerdict = await db.query.verdicts.findFirst({
      where: eq(verdicts.trialId, trialId),
    });

    if (existingVerdict) {
      onStatus?.({
        type: "verdict_exists",
        data: {
          trialId,
          message: "Verdict already exists, skipping synthesis",
        },
      });

      // Still transition to decree phase
      const winnerGladiator = gladiatorRecords.find(
        (g) => g.id === existingVerdict.winnerGladiatorId,
      );
      await transitionTrialState(trialId, "decree", {
        winnerId: existingVerdict.winnerGladiatorId,
        winnerName: winnerGladiator?.name || "Unknown",
      });
      return;
    }

    onStatus?.({
      type: "verdict_synthesizing",
      data: {
        trialId,
        judgeCount: judgeResults.length,
      },
    });

    // Calculate average scores for each gladiator
    const scoresByGladiator: Record<string, number[]> = {};

    for (const judgeResult of judgeResults) {
      for (const evaluation of judgeResult.output.evaluations) {
        if (!scoresByGladiator[evaluation.gladiatorId]) {
          scoresByGladiator[evaluation.gladiatorId] = [];
        }
        scoresByGladiator[evaluation.gladiatorId].push(evaluation.score);
      }
    }

    // Calculate average score for each gladiator
    const averageScores: Record<string, number> = {};
    for (const [gladiatorId, scores] of Object.entries(scoresByGladiator)) {
      const sum = scores.reduce((acc, score) => acc + score, 0);
      averageScores[gladiatorId] = sum / scores.length;
    }

    // Determine winner (highest average score)
    let winnerId: string | null = null;
    let highestScore = -1;

    for (const [gladiatorId, avgScore] of Object.entries(averageScores)) {
      if (avgScore > highestScore) {
        highestScore = avgScore;
        winnerId = gladiatorId;
      }
    }

    // Build verdict summary
    const winnerGladiator = gladiatorRecords.find((g) => g.id === winnerId);
    const winnerName = winnerGladiator?.name || "Unknown";

    // Create a detailed summary
    const judgeSummaries = judgeResults
      .map((jr) => {
        const winnerEval = jr.output.evaluations.find((e) => e.gladiatorId === winnerId);
        return `**${jr.judgeName}**: ${jr.output.summary}\n  Winner score: ${winnerEval?.score || "N/A"}/100`;
      })
      .join("\n\n");

    const gladiatorScoreSummary = Object.entries(averageScores)
      .sort(([, a], [, b]) => b - a)
      .map(([gId, score]) => {
        const glad = gladiatorRecords.find((g) => g.id === gId);
        return `- ${glad?.name || "Unknown"}: ${score.toFixed(1)}/100`;
      })
      .join("\n");

    const summary = `After evaluation by ${judgeResults.length} specialized judge(s), ${winnerName} emerged as the winner with an average score of ${highestScore.toFixed(1)}/100.

## Final Scores

${gladiatorScoreSummary}

## Judge Perspectives

${judgeSummaries}`;

    // Create reasoning
    const reasoning = `The verdict was determined by averaging scores from ${judgeResults.length} independent judge(s), each evaluating different aspects of quality:

${judgeResults
  .map(
    (jr, idx) =>
      `${idx + 1}. ${jr.judgeName}: Focused on "${jr.output.evaluations[0]?.reasoning.substring(0, 100)}..."`,
  )
  .join("\n")}

${winnerName} achieved the highest average score of ${highestScore.toFixed(1)}/100 across all judges, demonstrating superior performance in the evaluated criteria.`;

    // Create verdict record
    await db.insert(verdicts).values({
      trialId,
      summary,
      winnerGladiatorId: winnerId,
      reasoning,
    });

    onStatus?.({
      type: "verdict_complete",
      data: {
        trialId,
        winnerGladiatorId: winnerId,
        winnerName,
        averageScore: highestScore,
        scores: averageScores,
      },
    });

    // Transition to decree phase
    await transitionTrialState(trialId, "decree", {
      winnerId,
      winnerName,
      averageScore: highestScore,
    });
  } catch (error) {
    throw new Error(
      `Failed to synthesize verdict: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Runs all judges in parallel and synthesizes the verdict
 *
 * @param trialId - ID of the trial
 * @param judgeRecords - Judge records from the database
 * @param gladiatorRecords - Successful gladiator records with outputs
 * @param oauthToken - Claude OAuth token for API calls
 * @param onStatus - Optional callback for status updates (for SSE)
 * @param container - Optional trial container with repo access (for code battles)
 */
export async function runJudges(
  trialId: string,
  judgeRecords: JudgeRecord[],
  gladiatorRecords: GladiatorRecord[],
  oauthToken: string,
  onStatus?: StatusCallback,
  container?: TrialContainer,
): Promise<void> {
  try {
    // Fetch the trial
    const trial = await db.query.trials.findFirst({
      where: eq(trials.id, trialId),
    });

    if (!trial) {
      throw new Error(`Trial not found: ${trialId}`);
    }

    // Prepare gladiator outputs for judges (include branch names for git diff)
    const gladiatorOutputs = gladiatorRecords.map((g) => ({
      id: g.id,
      name: g.name,
      responseContent: g.responseContent || "",
      branchName: g.branchName,
    }));

    // Run all judges in parallel
    const judgePromises = judgeRecords.map((judge) =>
      runSingleJudge(
        judge,
        trial.challengePrompt,
        gladiatorOutputs,
        oauthToken,
        onStatus,
        container,
      ),
    );

    const judgeResults = await Promise.all(judgePromises);

    // Store judge evaluations in the database
    for (const result of judgeResults) {
      const judge = judgeRecords.find((j) => j.id === result.judgeId);
      if (judge) {
        // Update the judge record with the full evaluation
        await db
          .update(judges)
          .set({
            evaluation: JSON.stringify({
              evaluationCriteria: judge.evaluation
                ? JSON.parse(judge.evaluation).evaluationCriteria
                : [],
              output: result.output,
              cost: result.cost,
            }),
          })
          .where(eq(judges.id, result.judgeId));
      }
    }

    // Notify that all judges are complete
    onStatus?.({
      type: "all_judges_complete",
      data: {
        trialId,
        judgeCount: judgeResults.length,
        totalCost: judgeResults.reduce((acc, r) => acc + r.cost.totalUsd, 0),
      },
    });

    // Synthesize verdict from all judge evaluations
    await synthesizeVerdict(
      trialId,
      trial.challengePrompt,
      judgeResults.map((r) => {
        const judge = judgeRecords.find((j) => j.id === r.judgeId);
        return {
          judgeId: r.judgeId,
          judgeName: judge?.name || "Unknown Judge",
          output: r.output,
        };
      }),
      gladiatorRecords,
      onStatus,
    );
  } catch (error) {
    // Transition to failed state
    await transitionTrialState(trialId, "failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      phase: "judging",
    });

    throw error;
  }
}
