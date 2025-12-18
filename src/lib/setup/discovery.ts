/**
 * Setup Discovery Service
 *
 * Runs a Claude agent to explore a repository and create setup documentation.
 * Can run either on the host (legacy) or inside a Docker container (preferred).
 */

import type { AgentEvent } from "@/lib/docker/agent-client";
import type { TrialContainer } from "@/lib/docker/container";
import { SETUP_DISCOVERY_PROMPT, SETUP_DISCOVERY_SYSTEM_PROMPT } from "./prompts";

// Model aliases - SDK handles resolution
const MODELS = {
  OPUS: "opus",
  SONNET: "sonnet",
  HAIKU: "haiku",
} as const;

const REPO_PATH = "/workspace/repo";

/**
 * Parsed setup files from Claude's output
 */
export interface SetupFiles {
  setupMd: string;
  setupSh: string;
}

/**
 * Result of setup discovery
 */
export interface SetupDiscoveryResult {
  success: boolean;
  files?: SetupFiles;
  error?: string;
  cost?: {
    totalUsd: number;
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Parses setup.md and setup.sh from Claude's response
 *
 * Expected format:
 * ```setup.md
 * content...
 * ```
 *
 * ```setup.sh
 * content...
 * ```
 */
export function parseSetupFiles(text: string): SetupFiles | null {
  // Match setup.md code block
  const setupMdMatch = text.match(/```setup\.md\s*\n([\s\S]*?)\n```/i);
  if (!setupMdMatch) {
    return null;
  }

  // Match setup.sh code block
  const setupShMatch = text.match(/```setup\.sh\s*\n([\s\S]*?)\n```/i);
  if (!setupShMatch) {
    return null;
  }

  return {
    setupMd: setupMdMatch[1].trim(),
    setupSh: setupShMatch[1].trim(),
  };
}

// Legacy host-based runSetupDiscovery removed.
// Use runSetupDiscoveryInContainer for container-based discovery.

/**
 * Validates that a setup.sh script has the proper structure
 */
export function validateSetupScript(script: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check for shebang
  if (!script.startsWith("#!/bin/bash") && !script.startsWith("#!/usr/bin/env bash")) {
    issues.push("Missing bash shebang (#!/bin/bash)");
  }

  // Check for set -e
  if (!script.includes("set -e")) {
    issues.push('Missing "set -e" for proper error handling');
  }

  // Check for basic structure
  if (script.length < 50) {
    issues.push("Script seems too short to be functional");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Validates that setup.md has basic required sections
 */
export function validateSetupDocs(markdown: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  const lowerContent = markdown.toLowerCase();

  // Check for key sections
  if (!lowerContent.includes("setup") && !lowerContent.includes("install")) {
    issues.push("Missing setup/installation instructions");
  }

  if (!lowerContent.includes("test")) {
    issues.push("Missing testing information");
  }

  if (markdown.length < 100) {
    issues.push("Documentation seems too brief");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Runs setup discovery inside a Docker container via the agent server.
 * This is the preferred method as it runs in the same isolated environment
 * where gladiators will execute.
 *
 * @param container - The trial container with agent server
 * @param repoUrl - URL of the repository (for context in prompts)
 * @param oauthToken - Claude OAuth token
 * @param onEvent - Optional callback for streaming events
 * @param userGuidance - Optional user guidance to include in the prompt
 * @returns Setup discovery result with parsed files
 */
export async function runSetupDiscoveryInContainer(
  container: TrialContainer,
  repoUrl: string,
  oauthToken: string,
  onEvent?: (event: AgentEvent) => void,
  userGuidance?: string,
): Promise<SetupDiscoveryResult> {
  const agentClient = container.getAgentClient();

  try {
    // Build the prompt
    let userPrompt = SETUP_DISCOVERY_PROMPT(repoUrl, REPO_PATH);
    if (userGuidance) {
      userPrompt += `\n\n## Additional Guidance from User\n${userGuidance}`;
    }

    // Create session on the agent server
    const session = await agentClient.createSession({
      model: MODELS.OPUS,
      systemPrompt: SETUP_DISCOVERY_SYSTEM_PROMPT,
      tools: ["Read", "Glob", "Grep", "Bash"],
      cwd: REPO_PATH,
      maxTurns: 25,
      oauthToken,
    });

    // Collect assistant text for parsing
    let fullOutput = "";

    // Send message and stream response
    const result = await agentClient.sendMessage(
      session.sessionId,
      userPrompt,
      oauthToken,
      async (event: AgentEvent) => {
        // Forward event to caller
        if (onEvent) {
          onEvent(event);
        }

        // Collect assistant text
        if (event.event === "assistant") {
          const data = event.data as { content?: string };
          if (data.content) {
            fullOutput += data.content;
          }
        }
      },
    );

    // End the session
    await agentClient.endSession(session.sessionId);

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Setup discovery failed",
      };
    }

    // Parse the setup files from the output
    const files = parseSetupFiles(fullOutput);
    if (!files) {
      return {
        success: false,
        error:
          "Failed to parse setup files from response. Agent did not return files in the expected format.",
      };
    }

    // Callers can use validateSetupScript/validateSetupDocs if they want to check validity.

    return {
      success: true,
      files,
      cost: {
        totalUsd: result.cost.totalUsd,
        inputTokens: result.cost.inputTokens,
        outputTokens: result.cost.outputTokens,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error during setup discovery",
    };
  }
}

/**
 * Write setup files to the repository's .thunderdome directory
 */
export async function writeSetupFilesToContainer(
  container: TrialContainer,
  files: SetupFiles,
): Promise<void> {
  // Create .thunderdome directory
  await container.exec(["mkdir", "-p", `${REPO_PATH}/.thunderdome`]);

  // Write setup.md
  await container.exec([
    "sh",
    "-c",
    `cat > ${REPO_PATH}/.thunderdome/setup.md << 'THUNDERDOME_EOF'
${files.setupMd}
THUNDERDOME_EOF`,
  ]);

  // Write setup.sh
  await container.exec([
    "sh",
    "-c",
    `cat > ${REPO_PATH}/.thunderdome/setup.sh << 'THUNDERDOME_EOF'
${files.setupSh}
THUNDERDOME_EOF`,
  ]);

  // Make setup.sh executable
  await container.exec(["chmod", "+x", `${REPO_PATH}/.thunderdome/setup.sh`]);
}
