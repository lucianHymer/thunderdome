/**
 * Code Battle Trial Orchestrator
 *
 * Orchestrates the full code battle lifecycle:
 * 1. Authenticate with GitHub App and get installation token
 * 2. Spin up Docker container with agent server
 * 3. Clone repository with authenticated token
 * 4. Run setup discovery if no setup.sh exists
 * 5. Execute setup script
 * 6. Execute gladiators in parallel (each in their own worktree)
 * 7. Push branches to GitHub
 * 8. Run Arbiter to design judges
 * 9. Run Judges to evaluate gladiators
 * 10. Synthesize verdict
 * 11. Cleanup container (Consul runs separately when user invokes it)
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { gladiators, trials } from "@/db/schema";
import type { TrialContainer } from "@/lib/docker/container";
import { checkRepoAccess, getInstallationToken } from "@/lib/github/app";
import { broadcastTrialUpdate } from "@/lib/trial/broadcast";
import {
  destroyTrialContainer,
  getTrialContainer,
  startTrialContainer,
} from "@/lib/trial/container-service";
import { transitionTrialState } from "@/lib/trial/state";
import { runCodeBattleGladiator } from "./gladiators";

/**
 * Extract owner/repo from a GitHub URL
 */
function parseRepoFullName(repoUrl: string): string {
  // Handle various GitHub URL formats:
  // https://github.com/owner/repo
  // https://github.com/owner/repo.git
  // git@github.com:owner/repo.git
  const httpsMatch = repoUrl.match(/github\.com\/([^/]+\/[^/.]+)/);
  if (httpsMatch) {
    return httpsMatch[1];
  }
  const sshMatch = repoUrl.match(/github\.com:([^/]+\/[^/.]+)/);
  if (sshMatch) {
    return sshMatch[1];
  }
  throw new Error(`Unable to parse repository from URL: ${repoUrl}`);
}

/**
 * Build authenticated git URL using GitHub App token
 */
function buildAuthenticatedUrl(repoUrl: string, token: string): string {
  const url = new URL(repoUrl.endsWith(".git") ? repoUrl : `${repoUrl}.git`);
  url.username = "x-access-token";
  url.password = token;
  return url.toString();
}

interface GladiatorRecord {
  id: string;
  name: string;
  persona: string;
  model: string;
  temperature: number;
  tools: string;
}

/**
 * Clone the repository into the container with authentication
 */
async function cloneRepository(
  trialId: string,
  repoUrl: string,
  gitToken: string,
  onOutput?: (data: string) => void,
): Promise<boolean> {
  const container = getTrialContainer(trialId);
  if (!container) {
    throw new Error("Container not found");
  }

  try {
    // Build authenticated URL
    const authUrl = buildAuthenticatedUrl(repoUrl, gitToken);

    // Clone into /workspace/repo
    const { stdout, stderr, exitCode } = await container.exec([
      "sh",
      "-c",
      `git clone --depth 1 "${authUrl}" /workspace/repo 2>&1`,
    ]);

    if (onOutput) {
      // Don't leak token in output
      const safeOutput = (stdout || stderr).replace(gitToken, "***");
      onOutput(safeOutput);
    }

    if (exitCode === 0) {
      // Configure git identity for commits (as the app)
      await container.exec([
        "sh",
        "-c",
        'cd /workspace/repo && git config user.email "gladiator@thunderdome.app" && git config user.name "Thunderdome"',
      ]);

      // Store credentials for push operations
      await container.exec([
        "sh",
        "-c",
        `git config --global credential.helper store && echo "https://x-access-token:${gitToken}@github.com" > ~/.git-credentials`,
      ]);
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
 * Check if setup.sh exists in the container
 */
async function checkSetupExists(trialId: string): Promise<boolean> {
  const container = getTrialContainer(trialId);
  if (!container) {
    throw new Error("Container not found");
  }

  const { exitCode } = await container.exec([
    "sh",
    "-c",
    "test -f /workspace/repo/.thunderdome/setup.sh",
  ]);

  return exitCode === 0;
}

/**
 * Run the setup.sh script (assumes it exists)
 */
async function runSetupScript(
  trialId: string,
  onOutput?: (data: string) => void,
): Promise<boolean> {
  const container = getTrialContainer(trialId);
  if (!container) {
    throw new Error("Container not found");
  }

  try {
    if (onOutput) {
      onOutput("Running setup script...");
    }

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

    // Get GitHub App token for git operations
    const repoFullName = parseRepoFullName(trial.repoUrl);

    await broadcastTrialUpdate(trialId, {
      type: "container_status",
      status: "authenticating",
      message: "Authenticating with GitHub...",
    });

    const accessResult = await checkRepoAccess(repoFullName, userId);
    if (!accessResult.hasAccess) {
      if (accessResult.reason === "no_installation") {
        throw new Error(
          "GitHub App not installed. Please install the Thunderdome app on this repository.",
        );
      }
      throw new Error(
        `Repository ${repoFullName} is not accessible. Please add it to your GitHub App installation.`,
      );
    }

    // Get short-lived installation token for git operations
    const repoName = repoFullName.split("/")[1];
    const tokenResult = await getInstallationToken(accessResult.installationId, [repoName]);
    const gitToken = tokenResult.token;

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

    // Clone repository with GitHub App token
    await broadcastTrialUpdate(trialId, {
      type: "container_status",
      status: "cloning",
      message: "Cloning repository...",
    });

    const cloneSuccess = await cloneRepository(trialId, trial.repoUrl, gitToken, (data) => {
      broadcastTrialUpdate(trialId, {
        type: "setup_output",
        content: data,
      });
    });

    if (!cloneSuccess) {
      throw new Error("Failed to clone repository");
    }

    // Check if setup.sh exists
    const setupExists = await checkSetupExists(trialId);

    if (!setupExists) {
      // No setup.sh - transition to setup_discovery phase and wait for user
      await transitionTrialState(trialId, "setup_discovery");

      await broadcastTrialUpdate(trialId, {
        type: "container_status",
        status: "needs_setup",
        message: "Repository needs setup configuration. Starting interactive setup discovery...",
      });

      // Return early - user will complete setup via /api/trials/:id/setup
      // Then call continueAfterSetup() to resume
      return;
    }

    // Setup exists - run it
    await broadcastTrialUpdate(trialId, {
      type: "container_status",
      status: "setup",
      message: "Running setup script...",
    });

    const setupSuccess = await runSetupScript(trialId, (data) => {
      broadcastTrialUpdate(trialId, {
        type: "setup_output",
        content: data,
      });
    });

    if (!setupSuccess) {
      throw new Error("Setup script failed");
    }

    // Continue to gladiators
    await runGladiatorsAndBeyond(trialId, trial, container, claudeToken);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await broadcastTrialUpdate(trialId, {
      type: "error",
      phase: "code_battle",
      message: errorMessage,
    });

    await transitionTrialState(trialId, "failed", { error: errorMessage });

    // Cleanup container on error
    if (containerStarted) {
      await destroyTrialContainer(trialId);
    }

    throw error;
  }
  // Note: Container NOT destroyed here - stays alive for setup/consul
}

/**
 * Continue code battle after setup discovery is complete
 * Called when user finishes interactive setup
 */
export async function continueAfterSetup(trialId: string, claudeToken: string): Promise<void> {
  try {
    const trial = await db.query.trials.findFirst({
      where: eq(trials.id, trialId),
    });

    if (!trial) {
      throw new Error("Trial not found");
    }

    const container = getTrialContainer(trialId);
    if (!container) {
      throw new Error("Container not found. Trial may have timed out.");
    }

    // Run setup script
    await broadcastTrialUpdate(trialId, {
      type: "container_status",
      status: "setup",
      message: "Running setup script...",
    });

    const setupSuccess = await runSetupScript(trialId, (data) => {
      broadcastTrialUpdate(trialId, {
        type: "setup_output",
        content: data,
      });
    });

    if (!setupSuccess) {
      throw new Error("Setup script failed");
    }

    // Continue to gladiators
    await runGladiatorsAndBeyond(trialId, trial, container, claudeToken);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await broadcastTrialUpdate(trialId, {
      type: "error",
      phase: "code_battle",
      message: errorMessage,
    });

    await transitionTrialState(trialId, "failed", { error: errorMessage });

    // Cleanup container on error
    await destroyTrialContainer(trialId);

    throw error;
  }
}

/**
 * Run gladiators and everything after (arbiter, judges, verdict)
 */
async function runGladiatorsAndBeyond(
  trialId: string,
  trial: { challengePrompt: string; repoUrl: string | null },
  container: TrialContainer,
  claudeToken: string,
): Promise<void> {
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

  // Proceed to Arbiter (runs in container with repo access)
  await transitionTrialState(trialId, "arbiter_designing");

  await broadcastTrialUpdate(trialId, {
    type: "container_status",
    status: "arbiter",
    message: "Arbiter analyzing gladiator submissions...",
  });

  // Run arbiter with container access (arbiter also runs judges)
  const { runArbiter } = await import("../arbiter");
  await runArbiter(trialId, claudeToken, undefined, container);

  // Container stays alive for Consul phase
  // User can interact with Consul to merge/PR/etc.
  // Container will be cleaned up by:
  // - Consul explicitly ending it after decree
  // - Idle timeout (30 min)
  // - User cancellation

  await broadcastTrialUpdate(trialId, {
    type: "container_status",
    status: "ready_for_consul",
    message: "Trial complete. Container ready for Consul actions.",
  });
  // Note: Container NOT destroyed here - stays alive for Consul
}
