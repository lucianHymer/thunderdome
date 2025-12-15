/**
 * Code Battle Gladiator Runner
 *
 * Runs gladiators in isolated worktrees with full tool access
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { gladiators } from "@/db/schema";
import type { StreamEvent } from "@/lib/claude";
import type { TrialContainer } from "@/lib/docker/container";
import { createWorktree } from "@/lib/git/worktree";
import { broadcastGladiatorUpdate, broadcastTrialUpdate } from "@/lib/trial/broadcast";
import { buildCodeBattlePrompt } from "../gladiators/prompts";
import { createFindingsPromptAddition } from "./findings-template";

interface GladiatorRecord {
  id: string;
  name: string;
  persona: string;
  model: string;
  temperature: number;
  tools: unknown;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function runCodeBattleGladiator(
  trialId: string,
  gladiator: GladiatorRecord,
  challenge: string,
  container: TrialContainer,
  _claudeToken: string,
): Promise<void> {
  // Create worktree for this gladiator
  const worktreePath = await createWorktree(container, {
    trialId,
    gladiatorName: gladiator.name,
  });

  const branchName = `thunderdome/trial-${trialId}/${slugify(gladiator.name)}`;

  // Update gladiator with branch name
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

  // Build the prompt with repo context and FINDINGS requirement
  const repoContext = `Working directory: ${worktreePath}\nBranch: ${branchName}`;
  const findingsAddition = createFindingsPromptAddition();

  const prompt = buildCodeBattlePrompt(
    challenge + findingsAddition,
    gladiator.name,
    gladiator.persona,
    "Code quality and completeness",
    "GLADIATOR",
    repoContext,
    worktreePath,
  );

  const streamLog: StreamEvent[] = [];

  try {
    // Run agent inside the container using Claude Agent SDK
    // This requires executing claude-agent in the container with the worktree as cwd
    // TODO: Fix execStream to support callbacks or refactor this to handle streams properly
    // For now, using a simple exec command
    const { stdout: output } = await container.exec([
      "sh",
      "-c",
      `cd ${worktreePath} && echo "Gladiator ${gladiator.name} execution not fully implemented"`,
    ]);

    const streamEvent: StreamEvent = {
      type: "assistant",
      content: output,
      timestamp: new Date(),
    };
    streamLog.push(streamEvent);
    broadcastGladiatorUpdate(gladiator.id, {
      type: "gladiator_event",
      gladiatorId: gladiator.id,
      event: streamEvent,
    });

    // Check for FINDINGS.md
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
        status: "COMPLETED",
        responseContent: findings || "No FINDINGS.md generated",
        streamLog: JSON.stringify(streamLog),
      })
      .where(eq(gladiators.id, gladiator.id));

    await broadcastGladiatorUpdate(gladiator.id, {
      type: "gladiator_complete",
      gladiatorId: gladiator.id,
      success: true,
    });
  } catch (_error) {
    await db
      .update(gladiators)
      .set({
        status: "FAILED",
        streamLog: JSON.stringify(streamLog),
      })
      .where(eq(gladiators.id, gladiator.id));

    await broadcastGladiatorUpdate(gladiator.id, {
      type: "gladiator_complete",
      gladiatorId: gladiator.id,
      success: false,
    });
  }
}
