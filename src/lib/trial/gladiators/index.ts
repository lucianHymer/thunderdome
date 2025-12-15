/**
 * Gladiator Execution Engine
 *
 * Runs multiple gladiators in parallel, streams their output to SSE and database,
 * and handles completion/failure states.
 */

import { eq } from "drizzle-orm";
import { db } from "../../../db/index";
import { gladiators as gladiatorsTable, trials } from "../../../db/schema";
import {
  type AgentConfig,
  type AgentResult,
  aggregateCosts,
  type CostInfo,
  runAgent,
  type StreamEvent,
} from "../../claude/index";
import { broadcastGladiatorUpdate, broadcastTrialUpdate } from "../broadcast";
import { transitionTrialState } from "../state";
import { buildCodeBattlePrompt, buildGladiatorUserPrompt, buildTaskPrompt } from "./prompts";
import { TimeoutError, withTimeout } from "./timeout";

/**
 * Default timeout for gladiator execution (30 minutes)
 */
const DEFAULT_GLADIATOR_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Maximum number of turns per gladiator
 */
const DEFAULT_MAX_TURNS = 25;

/**
 * Gladiator database record
 */
interface GladiatorRecord {
  id: string;
  trialId: string;
  name: string;
  persona: string;
  model: string;
  temperature: number;
  tools: string;
  branchName: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  responseContent: string | null;
  streamLog: string | null;
}

/**
 * Runs a single gladiator and streams events to SSE and database
 *
 * @param gladiator - The gladiator database record
 * @param trial - The trial record
 * @param oauthToken - Claude OAuth token
 * @param workingDirectory - Directory where gladiator should work
 * @param repoContext - Repository context (if applicable)
 * @returns The final agent result
 */
async function runSingleGladiator(
  gladiator: GladiatorRecord,
  trial: any,
  oauthToken: string,
  workingDirectory?: string,
  repoContext?: string,
): Promise<AgentResult> {
  const events: StreamEvent[] = [];

  try {
    // Mark gladiator as running
    await db
      .update(gladiatorsTable)
      .set({ status: "RUNNING" })
      .where(eq(gladiatorsTable.id, gladiator.id));

    // Broadcast gladiator start
    await broadcastGladiatorUpdate(gladiator.id, {
      type: "gladiator_started",
      gladiatorId: gladiator.id,
      name: gladiator.name,
      timestamp: new Date().toISOString(),
    });

    await broadcastTrialUpdate(trial.id, {
      type: "gladiator_started",
      gladiatorId: gladiator.id,
      gladiatorName: gladiator.name,
      timestamp: new Date().toISOString(),
    });

    // Parse tools
    const tools = JSON.parse(gladiator.tools) as string[];

    // Build system prompt based on trial type
    const systemPrompt = repoContext
      ? buildCodeBattlePrompt(
          trial.challengePrompt,
          gladiator.name,
          gladiator.persona,
          JSON.parse(gladiator.tools).join(", "), // Use tools as focus if no explicit focus
          trial.trialType,
          repoContext,
          workingDirectory,
        )
      : buildTaskPrompt(
          trial.challengePrompt,
          gladiator.name,
          gladiator.persona,
          JSON.parse(gladiator.tools).join(", "),
          trial.trialType,
        );

    // Build user prompt
    const userPrompt = buildGladiatorUserPrompt();

    // Configure agent
    const config: AgentConfig = {
      systemPrompt,
      model: gladiator.model,
      temperature: gladiator.temperature / 100, // Convert from 0-100 to 0-1
      maxTurns: DEFAULT_MAX_TURNS,
      allowedTools: tools,
      cwd: workingDirectory,
      permissionMode: "bypassPermissions", // Gladiators run autonomously
    };

    // Run gladiator with timeout
    const agentGenerator = runAgent(userPrompt, config, oauthToken);

    // Stream events
    for await (const event of agentGenerator) {
      events.push(event);

      // Broadcast event to SSE subscribers
      await broadcastGladiatorUpdate(gladiator.id, {
        type: "gladiator_event",
        eventType: event.type,
        content: event.content,
        timestamp: event.timestamp.toISOString(),
      });

      // Also broadcast summary events to trial subscribers
      if (event.type === "assistant" || event.type === "result") {
        await broadcastTrialUpdate(trial.id, {
          type: "gladiator_progress",
          gladiatorId: gladiator.id,
          gladiatorName: gladiator.name,
          eventType: event.type,
          timestamp: event.timestamp.toISOString(),
        });
      }
    }

    // Get result from the generator's return value
    const finalEvent = events.find((e) => e.type === "result");
    if (!finalEvent) {
      throw new Error("Agent execution did not produce a result");
    }

    const resultContent = finalEvent.content as any;
    const result: AgentResult = {
      success: resultContent.subtype === "success",
      content: resultContent.result || "",
      events,
      cost: {
        totalUsd: resultContent.total_cost_usd || 0,
        inputTokens: resultContent.usage?.input_tokens || 0,
        outputTokens: resultContent.usage?.output_tokens || 0,
        cacheCreationTokens: resultContent.usage?.cache_creation_input_tokens,
        cacheReadTokens: resultContent.usage?.cache_read_input_tokens,
        modelUsage: resultContent.modelUsage,
      },
      turns: resultContent.num_turns || 0,
      sessionId: finalEvent.metadata?.sessionId,
      durationMs: resultContent.duration_ms,
      maxTurnsReached: resultContent.subtype === "error_max_turns",
      budgetExceeded: resultContent.subtype === "error_max_budget_usd",
      error: resultContent.is_error
        ? resultContent.errors?.join(", ") || "Unknown error"
        : undefined,
    };

    // Store result in database
    await db
      .update(gladiatorsTable)
      .set({
        status: result.success ? "COMPLETED" : "FAILED",
        responseContent: result.content,
        streamLog: JSON.stringify(
          events.map((e) => ({
            type: e.type,
            content: e.content,
            timestamp: e.timestamp.toISOString(),
          })),
        ),
      })
      .where(eq(gladiatorsTable.id, gladiator.id));

    // Broadcast completion
    await broadcastGladiatorUpdate(gladiator.id, {
      type: result.success ? "gladiator_completed" : "gladiator_failed",
      success: result.success,
      cost: result.cost,
      turns: result.turns,
      error: result.error,
      timestamp: new Date().toISOString(),
    });

    await broadcastTrialUpdate(trial.id, {
      type: result.success ? "gladiator_completed" : "gladiator_failed",
      gladiatorId: gladiator.id,
      gladiatorName: gladiator.name,
      success: result.success,
      timestamp: new Date().toISOString(),
    });

    return result;
  } catch (error) {
    // Handle errors
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const isTimeout = error instanceof TimeoutError;

    // Update database
    await db
      .update(gladiatorsTable)
      .set({
        status: "FAILED",
        responseContent: `Error: ${errorMessage}`,
        streamLog: JSON.stringify(
          events.map((e) => ({
            type: e.type,
            content: e.content,
            timestamp: e.timestamp.toISOString(),
          })),
        ),
      })
      .where(eq(gladiatorsTable.id, gladiator.id));

    // Broadcast failure
    await broadcastGladiatorUpdate(gladiator.id, {
      type: "gladiator_failed",
      error: errorMessage,
      isTimeout,
      timestamp: new Date().toISOString(),
    });

    await broadcastTrialUpdate(trial.id, {
      type: "gladiator_failed",
      gladiatorId: gladiator.id,
      gladiatorName: gladiator.name,
      error: errorMessage,
      isTimeout,
      timestamp: new Date().toISOString(),
    });

    // Return error result
    return {
      success: false,
      content: "",
      events,
      cost: { totalUsd: 0, inputTokens: 0, outputTokens: 0 },
      turns: 0,
      error: errorMessage,
    };
  }
}

/**
 * Runs all gladiators for a trial in parallel
 *
 * @param trialId - ID of the trial
 * @param oauthToken - Claude OAuth token
 * @param timeoutMs - Optional timeout per gladiator (default: 30 minutes)
 * @returns Map of gladiator ID to result
 */
export async function runGladiators(
  trialId: string,
  oauthToken: string,
  timeoutMs: number = DEFAULT_GLADIATOR_TIMEOUT_MS,
): Promise<Map<string, AgentResult>> {
  try {
    // Fetch trial
    const trial = await db.query.trials.findFirst({
      where: eq(trials.id, trialId),
    });

    if (!trial) {
      throw new Error(`Trial not found: ${trialId}`);
    }

    // Fetch all gladiators for this trial
    const gladiatorRecords = await db.query.gladiators.findMany({
      where: eq(gladiatorsTable.trialId, trialId),
    });

    if (gladiatorRecords.length === 0) {
      throw new Error(`No gladiators found for trial ${trialId}`);
    }

    // Broadcast battle start
    await broadcastTrialUpdate(trialId, {
      type: "battle_started",
      gladiatorCount: gladiatorRecords.length,
      gladiators: gladiatorRecords.map((g) => ({
        id: g.id,
        name: g.name,
        model: g.model,
      })),
      timestamp: new Date().toISOString(),
    });

    // Run all gladiators in parallel
    const gladiatorPromises = gladiatorRecords.map(async (gladiator) => {
      const result = await withTimeout(
        runSingleGladiator(
          gladiator as GladiatorRecord,
          trial,
          oauthToken,
          undefined, // TODO: Set working directory from repo setup
          undefined, // TODO: Get repo context from repoSetups table
        ),
        timeoutMs,
        `Gladiator ${gladiator.name} timed out after ${timeoutMs}ms`,
      );

      return { gladiatorId: gladiator.id, result };
    });

    // Wait for all gladiators to complete
    const results = await Promise.allSettled(gladiatorPromises);

    // Build results map
    const resultsMap = new Map<string, AgentResult>();
    const costs: CostInfo[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const promiseResult of results) {
      if (promiseResult.status === "fulfilled") {
        const { gladiatorId, result } = promiseResult.value;
        resultsMap.set(gladiatorId, result);
        costs.push(result.cost);

        if (result.success) {
          successCount++;
        } else {
          failureCount++;
        }
      } else {
        // Promise rejected - shouldn't happen due to error handling, but just in case
        failureCount++;
      }
    }

    // Calculate total cost
    const totalCost = aggregateCosts(costs);

    // Broadcast battle completion
    await broadcastTrialUpdate(trialId, {
      type: "battle_completed",
      successCount,
      failureCount,
      totalCost,
      timestamp: new Date().toISOString(),
    });

    // Transition to arbiter_designing state
    await transitionTrialState(trialId, "arbiter_designing", {
      gladiatorResults: {
        successCount,
        failureCount,
        totalCost,
      },
    });

    // Kick off arbiter (dynamic import to avoid circular dependencies)
    // This will be implemented when Arbiter is ready
    try {
    } catch (_error) {
      // Don't fail the entire trial if arbiter kickoff fails
    }

    return resultsMap;
  } catch (error) {
    // Trial-level error
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await broadcastTrialUpdate(trialId, {
      type: "battle_failed",
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });

    // Transition trial to failed state
    await transitionTrialState(trialId, "failed", {
      error: errorMessage,
    });

    throw error;
  }
}

/**
 * Gets the status of all gladiators for a trial
 *
 * @param trialId - ID of the trial
 * @returns Array of gladiator statuses
 */
export async function getGladiatorStatuses(trialId: string) {
  const gladiatorRecords = await db.query.gladiators.findMany({
    where: eq(gladiatorsTable.trialId, trialId),
  });

  return gladiatorRecords.map((g) => ({
    id: g.id,
    name: g.name,
    status: g.status,
    model: g.model,
    branchName: g.branchName,
    hasResponse: !!g.responseContent,
  }));
}

/**
 * Gets a gladiator's stream log for replay
 *
 * @param gladiatorId - ID of the gladiator
 * @returns Parsed stream log or null
 */
export async function getGladiatorStreamLog(gladiatorId: string) {
  const gladiator = await db.query.gladiators.findFirst({
    where: eq(gladiatorsTable.id, gladiatorId),
  });

  if (!gladiator || !gladiator.streamLog) {
    return null;
  }

  return JSON.parse(gladiator.streamLog);
}
