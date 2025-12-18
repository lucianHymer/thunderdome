/**
 * Code Battle Gladiator Runner
 *
 * Runs gladiators inside Docker containers via the agent server.
 * Each gladiator gets its own git worktree for isolated code changes.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { gladiators } from "@/db/schema";
import type { AgentEvent } from "@/lib/docker/agent-client";
import type { TrialContainer } from "@/lib/docker/container";
import { broadcastGladiatorUpdate, broadcastTrialUpdate } from "@/lib/trial/broadcast";
import { buildCodeBattlePrompt, buildGladiatorUserPrompt } from "../gladiators/prompts";
import { createFindingsPromptAddition } from "./findings-template";

interface GladiatorRecord {
  id: string;
  name: string;
  persona: string;
  model: string;
  temperature: number;
  tools: string;
}

interface StreamEvent {
  type: string;
  content: unknown;
  timestamp: Date;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Map model names to agent server format
 */
function normalizeModel(model: string): "opus" | "sonnet" | "haiku" {
  const lower = model.toLowerCase();
  if (lower.includes("opus")) return "opus";
  if (lower.includes("haiku")) return "haiku";
  return "sonnet"; // default
}

/**
 * Run a single gladiator inside the container via agent server
 */
export async function runCodeBattleGladiator(
  trialId: string,
  gladiator: GladiatorRecord,
  challenge: string,
  container: TrialContainer,
  oauthToken: string,
): Promise<void> {
  const streamLog: StreamEvent[] = [];
  const branchName = `thunderdome/trial-${trialId}/${slugify(gladiator.name)}`;
  const worktreePath = `/workspace/${slugify(gladiator.name)}`;

  // Get agent client from container
  const agentClient = container.getAgentClient();

  try {
    // Create worktree for this gladiator
    await container.exec([
      "sh",
      "-c",
      `cd /workspace/repo && git worktree add ${worktreePath} -b ${branchName}`,
    ]);

    // Update gladiator with branch name and status
    await db
      .update(gladiators)
      .set({
        branchName,
        status: "RUNNING",
      })
      .where(eq(gladiators.id, gladiator.id));

    await broadcastTrialUpdate(trialId, {
      type: "gladiator_started",
      gladiatorId: gladiator.id,
      gladiatorName: gladiator.name,
      branchName,
    });

    await broadcastGladiatorUpdate(gladiator.id, {
      type: "gladiator_started",
      gladiatorId: gladiator.id,
      name: gladiator.name,
      timestamp: new Date().toISOString(),
    });

    // Build system prompt with repo context and FINDINGS requirement
    const repoContext = `Working directory: ${worktreePath}\nBranch: ${branchName}`;
    const findingsAddition = createFindingsPromptAddition();

    const systemPrompt = buildCodeBattlePrompt(
      challenge + findingsAddition,
      gladiator.name,
      gladiator.persona,
      "Code quality and completeness",
      "GLADIATOR",
      repoContext,
      worktreePath,
    );

    // Parse tools
    const tools = JSON.parse(gladiator.tools) as string[];

    // Create session on the agent server
    const session = await agentClient.createSession({
      model: normalizeModel(gladiator.model),
      systemPrompt,
      tools,
      cwd: worktreePath,
      maxTurns: 25,
      oauthToken,
    });

    // Send the initial prompt and stream events
    const userPrompt = buildGladiatorUserPrompt();

    const result = await agentClient.sendMessage(
      session.sessionId,
      userPrompt,
      oauthToken,
      async (event: AgentEvent) => {
        // Log the event
        const streamEvent: StreamEvent = {
          type: event.event,
          content: event.data,
          timestamp: new Date(),
        };
        streamLog.push(streamEvent);

        // Broadcast to SSE subscribers
        await broadcastGladiatorUpdate(gladiator.id, {
          type: "gladiator_event",
          eventType: event.event,
          content: event.data,
          timestamp: new Date().toISOString(),
        });

        // Send summary events to trial subscribers
        if (event.event === "assistant" || event.event === "done") {
          await broadcastTrialUpdate(trialId, {
            type: "gladiator_progress",
            gladiatorId: gladiator.id,
            gladiatorName: gladiator.name,
            eventType: event.event,
            timestamp: new Date().toISOString(),
          });
        }
      },
    );

    // End the session
    await agentClient.endSession(session.sessionId);

    // Read FINDINGS.md if it exists
    const { stdout: findings } = await container.exec([
      "sh",
      "-c",
      `cat ${worktreePath}/.thunderdome/FINDINGS.md 2>/dev/null || echo ""`,
    ]);

    // Commit changes
    await container.exec([
      "sh",
      "-c",
      `cd ${worktreePath} && git add -A && git commit -m "Gladiator ${gladiator.name} submission" --allow-empty`,
    ]);

    // Update gladiator record
    await db
      .update(gladiators)
      .set({
        status: result.success ? "COMPLETED" : "FAILED",
        responseContent: findings || "No FINDINGS.md generated",
        streamLog: JSON.stringify(streamLog),
      })
      .where(eq(gladiators.id, gladiator.id));

    await broadcastGladiatorUpdate(gladiator.id, {
      type: result.success ? "gladiator_completed" : "gladiator_failed",
      gladiatorId: gladiator.id,
      success: result.success,
      cost: result.cost,
      turns: result.turns,
      error: result.error,
      timestamp: new Date().toISOString(),
    });

    await broadcastTrialUpdate(trialId, {
      type: result.success ? "gladiator_completed" : "gladiator_failed",
      gladiatorId: gladiator.id,
      gladiatorName: gladiator.name,
      success: result.success,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await db
      .update(gladiators)
      .set({
        status: "FAILED",
        responseContent: `Error: ${errorMessage}`,
        streamLog: JSON.stringify(streamLog),
      })
      .where(eq(gladiators.id, gladiator.id));

    await broadcastGladiatorUpdate(gladiator.id, {
      type: "gladiator_failed",
      gladiatorId: gladiator.id,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });

    await broadcastTrialUpdate(trialId, {
      type: "gladiator_failed",
      gladiatorId: gladiator.id,
      gladiatorName: gladiator.name,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });

    throw error;
  }
}
