/**
 * Interactive Setup Discovery Runner
 *
 * Runs setup discovery as an interactive session in the trial container.
 * User can guide the agent, answer questions, and approve the final setup.
 */

import type { AgentEvent, OutputFormat } from "@/lib/docker/agent-client";
import { createAgentSessionManager } from "@/lib/discovery/agent-session";
import { getTrialContainer } from "@/lib/trial/container-service";
import { buildInteractiveSetupSystemPrompt, SETUP_DISCOVERY_PROMPT } from "./prompts";

/**
 * JSON Schema for structured setup file output
 */
const SETUP_FILES_SCHEMA: OutputFormat = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      setup_md: {
        type: "string",
        description: "Contents of setup.md - documentation about the project setup",
      },
      setup_sh: {
        type: "string",
        description:
          "Contents of setup.sh - bash script that sets up the project (must start with #!/bin/bash and set -e)",
      },
    },
    required: ["setup_md", "setup_sh"],
  },
};

/**
 * Type for the structured setup files response
 */
export interface SetupFilesOutput {
  setup_md: string;
  setup_sh: string;
}

const REPO_PATH = "/workspace/repo";

// Shared session manager for setup discovery
const setupSessionManager = createAgentSessionManager("setup");

/**
 * Start or get existing setup discovery session for a trial
 */
export async function getOrCreateSetupSession(
  trialId: string,
  repoUrl: string,
  oauthToken: string,
): Promise<{ sessionId: string; isNew: boolean }> {
  return await setupSessionManager.getOrCreateSession(trialId, oauthToken, {
    systemPrompt: buildInteractiveSetupSystemPrompt(),
    tools: ["Read", "Glob", "Grep", "Bash"],
    model: "opus",
    cwd: REPO_PATH,
    maxTurns: 50, // More turns for interactive session
  });
}

/**
 * Send a message to the setup discovery session
 */
export async function sendSetupMessage(
  trialId: string,
  message: string,
  repoUrl: string,
  oauthToken: string,
  onEvent: (event: AgentEvent) => void | Promise<void>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { isNew } = await getOrCreateSetupSession(trialId, repoUrl, oauthToken);

    // If new session, send the initial discovery prompt
    const prompt = isNew ? SETUP_DISCOVERY_PROMPT(repoUrl, REPO_PATH) : message;

    // Send message and stream response
    const result = await setupSessionManager.sendMessage(
      trialId,
      prompt,
      oauthToken,
      onEvent,
    );

    return {
      success: result.success,
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Extract setup files from conversation using structured output
 * Makes a final call to the agent with the conversation history and structured output format
 */
export async function extractSetupFiles(
  trialId: string,
  conversationSummary: string,
  oauthToken: string,
): Promise<{ success: boolean; files?: SetupFilesOutput; error?: string }> {
  if (!setupSessionManager.hasSession(trialId)) {
    return { success: false, error: "No active setup session" };
  }

  try {
    // Send a message asking for final output with structured format
    const prompt = `Based on our conversation, please output the final setup files for this project.

Here's a summary of what we discussed:
${conversationSummary}

Output the setup.md documentation and setup.sh script that will configure this project.`;

    let structuredOutput: SetupFilesOutput | undefined;

    await setupSessionManager.sendMessage(
      trialId,
      prompt,
      oauthToken,
      (event) => {
        // We're mostly ignoring events here, just waiting for done
        if (event.event === "done") {
          const data = event.data as { structuredOutput?: SetupFilesOutput };
          structuredOutput = data.structuredOutput;
        }
      },
      SETUP_FILES_SCHEMA,
    );

    if (!structuredOutput) {
      return { success: false, error: "No structured output received" };
    }

    return { success: true, files: structuredOutput };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Write setup files to container and mark setup as complete
 */
export async function finalizeSetup(
  trialId: string,
  setupMd: string,
  setupSh: string,
): Promise<{ success: boolean; error?: string }> {
  const container = getTrialContainer(trialId);
  if (!container) {
    return { success: false, error: "Trial container not found" };
  }

  try {
    // Create .thunderdome directory
    await container.exec(["mkdir", "-p", `${REPO_PATH}/.thunderdome`]);

    // Write setup.md
    await container.exec([
      "sh",
      "-c",
      `cat > ${REPO_PATH}/.thunderdome/setup.md << 'THUNDERDOME_EOF'
${setupMd}
THUNDERDOME_EOF`,
    ]);

    // Write setup.sh
    await container.exec([
      "sh",
      "-c",
      `cat > ${REPO_PATH}/.thunderdome/setup.sh << 'THUNDERDOME_EOF'
${setupSh}
THUNDERDOME_EOF`,
    ]);

    // Make setup.sh executable
    await container.exec(["chmod", "+x", `${REPO_PATH}/.thunderdome/setup.sh`]);

    // End the setup session
    await endSetupSession(trialId);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Commit and push setup files to the repository
 */
export async function commitSetupFiles(
  trialId: string,
): Promise<{ success: boolean; error?: string }> {
  const container = getTrialContainer(trialId);
  if (!container) {
    return { success: false, error: "Trial container not found" };
  }

  try {
    // Add the setup files
    const { exitCode: addCode, stderr: addErr } = await container.exec([
      "sh",
      "-c",
      `cd ${REPO_PATH} && git add .thunderdome/setup.md .thunderdome/setup.sh`,
    ]);

    if (addCode !== 0) {
      return { success: false, error: `Git add failed: ${addErr}` };
    }

    // Commit
    const { exitCode: commitCode, stderr: commitErr } = await container.exec([
      "sh",
      "-c",
      `cd ${REPO_PATH} && git commit -m "Add Thunderdome setup files"`,
    ]);

    if (commitCode !== 0) {
      return { success: false, error: `Git commit failed: ${commitErr}` };
    }

    // Push
    const { exitCode: pushCode, stderr: pushErr } = await container.exec([
      "sh",
      "-c",
      `cd ${REPO_PATH} && git push origin HEAD 2>&1`,
    ]);

    if (pushCode !== 0) {
      return { success: false, error: `Git push failed: ${pushErr}` };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * End the setup discovery session
 */
export async function endSetupSession(trialId: string): Promise<void> {
  await setupSessionManager.endSession(trialId);
}

/**
 * Check if a setup session exists for a trial
 */
export function hasSetupSession(trialId: string): boolean {
  return setupSessionManager.hasSession(trialId);
}
