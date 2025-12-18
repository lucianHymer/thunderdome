/**
 * Code Battle Trial Orchestrator
 *
 * Orchestrates the full code battle lifecycle:
 * 1. Spin up Docker container with agent server
 * 2. Clone repository into container
 * 3. Run setup script
 * 4. Execute gladiators in parallel (each in their own worktree)
 * 5. Push branches to repository
 * 6. Cleanup container
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { gladiators, trials } from "@/db/schema";
import { broadcastTrialUpdate } from "@/lib/trial/broadcast";
import {
  destroyTrialContainer,
  getTrialContainer,
  startTrialContainer,
} from "@/lib/trial/container-service";
import { transitionTrialState } from "@/lib/trial/state";
import { runCodeBattleGladiator } from "./gladiators";

interface GladiatorRecord {
  id: string;
  name: string;
  persona: string;
  model: string;
  temperature: number;
  tools: string;
}

/**
 * Clone the repository into the container
 */
async function cloneRepository(
  trialId: string,
  repoUrl: string,
  onOutput?: (data: string) => void,
): Promise<boolean> {
  const container = getTrialContainer(trialId);
  if (!container) {
    throw new Error("Container not found");
  }

  try {
    // Clone into /workspace/repo
    const { stdout, stderr, exitCode } = await container.exec([
      "sh",
      "-c",
      `git clone --depth 1 ${repoUrl} /workspace/repo 2>&1`,
    ]);

    if (onOutput) {
      onOutput(stdout || stderr);
    }

    return exitCode === 0;
  } catch (error) {
    if (onOutput) {
      onOutput(`Clone error: ${error instanceof Error ? error.message : "Unknown"}`);
    }
    return false;
  }
}

/**
 * Run setup script in the container
 */
async function runSetup(trialId: string, onOutput?: (data: string) => void): Promise<boolean> {
  const container = getTrialContainer(trialId);
  if (!container) {
    throw new Error("Container not found");
  }

  try {
    // Check if setup script exists
    const { exitCode: checkCode } = await container.exec([
      "sh",
      "-c",
      "test -f /workspace/repo/.thunderdome/setup.sh",
    ]);

    if (checkCode !== 0) {
      if (onOutput) {
        onOutput("No setup script found, skipping setup");
      }
      return true;
    }

    // Run setup script
    const { stdout, stderr, exitCode } = await container.exec([
      "sh",
      "-c",
      "cd /workspace/repo && chmod +x .thunderdome/setup.sh && ./.thunderdome/setup.sh 2>&1",
    ]);

    if (onOutput) {
      onOutput(stdout || stderr);
    }

    return exitCode === 0;
  } catch (error) {
    if (onOutput) {
      onOutput(`Setup error: ${error instanceof Error ? error.message : "Unknown"}`);
    }
    return false;
  }
}

/**
 * Push all worktree branches to remote
 */
async function pushBranches(trialId: string, onOutput?: (data: string) => void): Promise<boolean> {
  const container = getTrialContainer(trialId);
  if (!container) {
    throw new Error("Container not found");
  }

  try {
    // Push all branches that start with thunderdome/
    const { stdout, stderr, exitCode } = await container.exec([
      "sh",
      "-c",
      `cd /workspace/repo && git push origin --all 2>&1`,
    ]);

    if (onOutput) {
      onOutput(stdout || stderr);
    }

    return exitCode === 0;
  } catch (error) {
    if (onOutput) {
      onOutput(`Push error: ${error instanceof Error ? error.message : "Unknown"}`);
    }
    return false;
  }
}

/**
 * Run the full code battle flow
 */
export async function runCodeBattle(
  trialId: string,
  userId: string,
  claudeToken: string,
): Promise<void> {
  let containerStarted = false;

  try {
    // Get trial with repo info
    const trial = await db.query.trials.findFirst({
      where: eq(trials.id, trialId),
    });

    if (!trial) {
      throw new Error("Trial not found");
    }

    if (!trial.repoUrl) {
      throw new Error("No repository URL configured for this trial");
    }

    // Start container
    await broadcastTrialUpdate(trialId, {
      type: "container_status",
      status: "starting",
      message: "Spinning up battle container...",
    });

    const container = await startTrialContainer(trialId);
    containerStarted = true;

    // Wait for agent server to be healthy
    await broadcastTrialUpdate(trialId, {
      type: "container_status",
      status: "waiting",
      message: "Waiting for agent server...",
    });

    const isHealthy = await container.waitForAgentServer(60000);
    if (!isHealthy) {
      throw new Error("Agent server failed to start");
    }

    // Clone repository
    await broadcastTrialUpdate(trialId, {
      type: "container_status",
      status: "cloning",
      message: "Cloning repository...",
    });

    const cloneSuccess = await cloneRepository(trialId, trial.repoUrl, (data) => {
      broadcastTrialUpdate(trialId, {
        type: "setup_output",
        content: data,
      });
    });

    if (!cloneSuccess) {
      throw new Error("Failed to clone repository");
    }

    // Run setup
    await broadcastTrialUpdate(trialId, {
      type: "container_status",
      status: "setup",
      message: "Running setup script...",
    });

    const setupSuccess = await runSetup(trialId, (data) => {
      broadcastTrialUpdate(trialId, {
        type: "setup_output",
        content: data,
      });
    });

    if (!setupSuccess) {
      throw new Error("Setup script failed");
    }

    // Get gladiators
    const trialGladiators = await db.query.gladiators.findMany({
      where: eq(gladiators.trialId, trialId),
    });

    if (trialGladiators.length === 0) {
      throw new Error("No gladiators found for this trial");
    }

    // Run gladiators in parallel
    await broadcastTrialUpdate(trialId, {
      type: "battle_start",
      message: "Gladiators entering the arena...",
      gladiatorCount: trialGladiators.length,
    });

    const results = await Promise.allSettled(
      trialGladiators.map((g) =>
        runCodeBattleGladiator(
          trialId,
          g as GladiatorRecord,
          trial.challengePrompt,
          container,
          claudeToken,
        ),
      ),
    );

    // Count successes/failures
    const successCount = results.filter((r) => r.status === "fulfilled").length;
    const failureCount = results.filter((r) => r.status === "rejected").length;

    // Push branches
    await broadcastTrialUpdate(trialId, {
      type: "container_status",
      status: "pushing",
      message: "Pushing branches to repository...",
    });

    await pushBranches(trialId, (data) => {
      broadcastTrialUpdate(trialId, {
        type: "setup_output",
        content: data,
      });
    });

    await broadcastTrialUpdate(trialId, {
      type: "battle_complete",
      message: "All gladiators have submitted their work",
      successCount,
      failureCount,
    });

    // Proceed to Arbiter
    await transitionTrialState(trialId, "arbiter_designing");

    // Run arbiter
    const { runArbiter } = await import("../arbiter");
    await runArbiter(trialId, claudeToken);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await broadcastTrialUpdate(trialId, {
      type: "error",
      phase: "code_battle",
      message: errorMessage,
    });

    await transitionTrialState(trialId, "failed", { error: errorMessage });

    throw error;
  } finally {
    // Always destroy container
    if (containerStarted) {
      await broadcastTrialUpdate(trialId, {
        type: "container_status",
        status: "cleanup",
        message: "Cleaning up container...",
      });

      await destroyTrialContainer(trialId);
    }
  }
}
