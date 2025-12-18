/**
 * Arbiter runner - designs judges based on gladiator outputs
 *
 * Now runs inside the trial container with repo access so it can:
 * - Inspect actual code changes via git diff
 * - Run tests to verify gladiator claims
 * - Design more informed evaluation criteria
 */

import { eq } from "drizzle-orm";
import { db } from "../../../db/index";
import { gladiators, judges, trials } from "../../../db/schema";
import {
  type ArbiterOutput,
  ArbiterOutputSchema,
  MODELS,
  runStructuredAgentInContainerWithRetry,
  runStructuredAgentWithRetry,
} from "../../claude/index";
import type { TrialContainer } from "../../docker/container";
import { transitionTrialState } from "../state";
import type { StatusCallback } from "../types";
import { ARBITER_SYSTEM_PROMPT, buildArbiterUserPrompt } from "./prompts";

/**
 * Runs the Arbiter to design judges based on gladiator outputs
 *
 * @param trialId - ID of the trial to design judges for
 * @param oauthToken - Claude OAuth token for API calls
 * @param onStatus - Optional callback for status updates (for SSE)
 * @param container - Optional trial container with repo access (for code battles)
 * @returns The Arbiter's output
 */
export async function runArbiter(
  trialId: string,
  oauthToken: string,
  onStatus?: StatusCallback,
  container?: TrialContainer,
): Promise<ArbiterOutput> {
  try {
    // Fetch the trial
    const trial = await db.query.trials.findFirst({
      where: eq(trials.id, trialId),
    });

    if (!trial) {
      throw new Error(`Trial not found: ${trialId}`);
    }

    // Fetch all gladiators with their outputs
    const gladiatorRecords = await db.query.gladiators.findMany({
      where: eq(gladiators.trialId, trialId),
    });

    if (gladiatorRecords.length === 0) {
      throw new Error(`No gladiators found for trial ${trialId}`);
    }

    // Check if we have any successful gladiators
    const successfulGladiators = gladiatorRecords.filter(
      (g) => g.status === "COMPLETED" && g.responseContent,
    );

    if (successfulGladiators.length === 0) {
      throw new Error("No successful gladiator outputs to evaluate");
    }

    // Transition to arbiter_designing state
    await transitionTrialState(trialId, "arbiter_designing", {
      successfulGladiators: successfulGladiators.length,
      totalGladiators: gladiatorRecords.length,
    });

    // Notify that Arbiter is thinking
    onStatus?.({
      type: "arbiter_thinking",
      data: {
        trialId,
        status: "Arbiter is analyzing gladiator outputs and designing judges...",
        successfulGladiators: successfulGladiators.length,
      },
    });

    // Build the prompt with gladiator outputs
    const userPrompt = buildArbiterUserPrompt(
      trial.challengePrompt,
      gladiatorRecords.map((g) => ({
        id: g.id,
        name: g.name,
        status: g.status,
        responseContent: g.responseContent,
      })),
    );

    // Run the Arbiter - in container if available (code battles), otherwise host-based
    const result = container
      ? await runStructuredAgentInContainerWithRetry(
          container,
          userPrompt,
          ArbiterOutputSchema,
          {
            model: "opus",
            tools: ["Read", "Bash", "Glob", "Grep"], // Can inspect code, run git diff, etc.
            maxTurns: 25,
            systemPrompt: ARBITER_SYSTEM_PROMPT,
          },
          2,
          oauthToken,
        )
      : await runStructuredAgentWithRetry(
          userPrompt,
          ArbiterOutputSchema,
          {
            model: MODELS.OPUS,
            allowedTools: [], // No tools for non-code-battle trials
            maxTurns: 5,
            systemPrompt: ARBITER_SYSTEM_PROMPT,
            permissionMode: "bypassPermissions",
          },
          2,
          oauthToken,
        );

    if (!result.success || !result.data) {
      throw new Error(`Arbiter failed: ${result.error || "No data returned"}`);
    }

    const arbiterOutput = result.data;

    // Store the Arbiter plan in the trial
    await db
      .update(trials)
      .set({
        arbiterPlan: JSON.stringify({
          reasoning: arbiterOutput.reasoning,
          judges: arbiterOutput.judges,
          cost: result.cost,
        }),
      })
      .where(eq(trials.id, trialId));

    // Notify that Arbiter is complete
    onStatus?.({
      type: "arbiter_complete",
      data: {
        trialId,
        reasoning: arbiterOutput.reasoning,
        judgeCount: arbiterOutput.judges.length,
        cost: result.cost,
      },
    });

    // Check if judges already exist for this trial (resume case)
    const existingJudges = await db.query.judges.findMany({
      where: eq(judges.trialId, trialId),
    });

    let insertedJudges: typeof existingJudges;

    if (existingJudges.length > 0) {
      // Reuse existing judges on resume
      insertedJudges = existingJudges;
      onStatus?.({
        type: "judges_reused",
        data: {
          trialId,
          judges: existingJudges.map((j) => ({
            id: j.id,
            name: j.name,
            focus: j.focus,
          })),
        },
      });
    } else {
      // Create judge records in the database
      const judgeRecords = arbiterOutput.judges.map((j) => ({
        trialId,
        name: j.name,
        focus: j.focus,
        model: MODELS.OPUS, // Use Opus for judges - they need strong evaluation capabilities
        evaluation: JSON.stringify({
          evaluationCriteria: j.evaluationCriteria,
        }),
      }));

      // Insert all judges
      insertedJudges = await db.insert(judges).values(judgeRecords).returning();

      // Notify that judges have been created
      onStatus?.({
        type: "judges_created",
        data: {
          trialId,
          judges: insertedJudges.map((j) => ({
            id: j.id,
            name: j.name,
            focus: j.focus,
          })),
        },
      });
    }

    // Transition to judging state
    await transitionTrialState(trialId, "judging", {
      judgeCount: insertedJudges.length,
    });

    // Kick off judges (import dynamically to avoid circular dependency)
    const { runJudges } = await import("../judges/index");

    // Notify that judging has started
    onStatus?.({
      type: "judging_started",
      data: {
        trialId,
        judgeCount: insertedJudges.length,
      },
    });

    // Run judges (this will handle verdict synthesis and state transitions)
    await runJudges(trialId, insertedJudges, successfulGladiators, oauthToken, onStatus, container);

    return arbiterOutput;
  } catch (error) {
    // Notify of error
    onStatus?.({
      type: "arbiter_error",
      data: {
        trialId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });

    // Update trial status to FAILED
    await transitionTrialState(trialId, "failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      phase: "arbiter",
    });

    throw error;
  }
}
