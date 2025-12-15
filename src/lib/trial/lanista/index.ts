/**
 * Lanista runner - designs gladiators for a trial
 */

import { eq } from "drizzle-orm";
import { db } from "../../../db/index";
import { gladiators, trials } from "../../../db/schema";
import {
  type LanistaOutput,
  LanistaOutputSchema,
  MODELS,
  runStructuredAgentWithRetry,
} from "../../claude/index";
import type { StatusCallback } from "../types";
import { LANISTA_SYSTEM_PROMPT, LANISTA_USER_PROMPT } from "./prompts";

/**
 * Maps gladiator model names to actual Claude model IDs
 */
function mapGladiatorModel(model: "opus" | "sonnet" | "haiku"): string {
  switch (model) {
    case "opus":
      return MODELS.OPUS;
    case "sonnet":
      return MODELS.SONNET;
    case "haiku":
      return MODELS.HAIKU;
    default:
      return MODELS.SONNET;
  }
}

/**
 * Creates a unique branch name for a gladiator
 */
function createBranchName(trialId: string, gladiatorName: string): string {
  const sanitized = gladiatorName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `trial-${trialId.slice(0, 8)}-${sanitized}`;
}

/**
 * Runs the Lanista to design gladiators for a trial
 *
 * @param trialId - ID of the trial to design gladiators for
 * @param oauthToken - Claude OAuth token for API calls
 * @param onStatus - Optional callback for status updates (for SSE)
 * @returns The Lanista's output
 */
export async function runLanista(
  trialId: string,
  oauthToken: string,
  onStatus?: StatusCallback,
): Promise<LanistaOutput> {
  try {
    // Fetch the trial
    const trial = await db.query.trials.findFirst({
      where: eq(trials.id, trialId),
    });

    if (!trial) {
      throw new Error(`Trial not found: ${trialId}`);
    }

    // Update trial status to PLANNING
    await db.update(trials).set({ status: "PLANNING" }).where(eq(trials.id, trialId));

    // Notify that Lanista is thinking
    onStatus?.({
      type: "lanista_thinking",
      data: { trialId, status: "Lanista is designing gladiators..." },
    });

    // Generate the prompt
    const userPrompt = LANISTA_USER_PROMPT(
      trial.challengePrompt,
      trial.trialType,
      // TODO: Add repo context from repoSetups table if needed
      undefined,
    );

    // Run the Lanista with structured output
    const result = await runStructuredAgentWithRetry(
      userPrompt,
      LanistaOutputSchema,
      {
        model: MODELS.OPUS, // Use Opus for the Lanista itself - needs strong reasoning
        allowedTools: [], // Lanista doesn't need tools, just reasoning
        maxTurns: 1, // Single-turn structured output
        systemPrompt: LANISTA_SYSTEM_PROMPT,
        permissionMode: "bypassPermissions",
      },
      2, // Max 2 retries for validation failures
      oauthToken,
    );

    if (!result.success || !result.data) {
      throw new Error(`Lanista failed: ${result.error || "No data returned"}`);
    }

    const lanistaOutput = result.data;

    // Store the Lanista plan in the trial
    await db
      .update(trials)
      .set({
        lanistaPlan: JSON.stringify({
          reasoning: lanistaOutput.reasoning,
          gladiators: lanistaOutput.gladiators,
          cost: result.cost,
        }),
      })
      .where(eq(trials.id, trialId));

    // Notify that Lanista is complete
    onStatus?.({
      type: "lanista_complete",
      data: {
        trialId,
        reasoning: lanistaOutput.reasoning,
        gladiatorCount: lanistaOutput.gladiators.length,
        cost: result.cost,
      },
    });

    // Create gladiator records in the database
    const gladiatorRecords = lanistaOutput.gladiators.map((g, _index) => ({
      trialId,
      name: g.name,
      persona: g.persona,
      model: mapGladiatorModel(g.model),
      temperature: Math.round(g.temperature * 100), // Store as integer 0-100
      tools: JSON.stringify(g.tools),
      branchName: createBranchName(trialId, g.name),
      status: "PENDING" as const,
    }));

    // Insert all gladiators
    const insertedGladiators = await db.insert(gladiators).values(gladiatorRecords).returning();

    // Notify that gladiators have been created
    onStatus?.({
      type: "gladiators_created",
      data: {
        trialId,
        gladiators: insertedGladiators.map((g) => ({
          id: g.id,
          name: g.name,
          model: g.model,
          branchName: g.branchName,
        })),
      },
    });

    // Transition trial to RUNNING state (ready for battling)
    await db.update(trials).set({ status: "RUNNING" }).where(eq(trials.id, trialId));

    // TODO: Kick off gladiators (will be implemented in Issue 6)
    // For now, this is just a stub
    // await kickOffGladiators(trialId, insertedGladiators, oauthToken, onStatus);

    return lanistaOutput;
  } catch (error) {
    // Notify of error
    onStatus?.({
      type: "lanista_error",
      data: {
        trialId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });

    // Update trial status to FAILED
    await db.update(trials).set({ status: "FAILED" }).where(eq(trials.id, trialId));

    throw error;
  }
}

/**
 * Stub function for kicking off gladiators
 * Will be implemented in Issue 6
 */
async function _kickOffGladiators(
  _trialId: string,
  _gladiatorRecords: any[],
  _oauthToken: string,
  _onStatus?: StatusCallback,
): Promise<void> {}
