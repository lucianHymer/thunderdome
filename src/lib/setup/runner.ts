/**
 * Setup Discovery Helper Functions
 *
 * Domain-specific helper functions for setup file extraction and finalization.
 * Session management is handled by the unified API route.
 */

import type { OutputFormat } from "@/lib/docker/agent-client";
import { getTrialContainer } from "@/lib/trial/container-service";

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

/**
 * Extract setup files from conversation using structured output
 * Makes a final call to the agent with the conversation history and structured output format
 */
export async function extractSetupFiles(
  trialId: string,
  conversationSummary: string,
  sessionId: string,
  oauthToken: string,
): Promise<{ success: boolean; files?: SetupFilesOutput; error?: string }> {
  const container = getTrialContainer(trialId);
  if (!container) {
    return { success: false, error: "Trial container not found" };
  }

  try {
    const agentClient = container.getAgentClient();

    // Send a message asking for final output with structured format
    const prompt = `Based on our conversation, please output the final setup files for this project.

Here's a summary of what we discussed:
${conversationSummary}

Output the setup.md documentation and setup.sh script that will configure this project.`;

    let structuredOutput: SetupFilesOutput | undefined;

    await agentClient.sendMessage(
      sessionId,
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
 * Write setup files to container
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
