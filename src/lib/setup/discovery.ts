/**
 * Setup Discovery Service
 *
 * Runs a Claude agent to explore a repository and create setup documentation
 */

import { runAgent } from '@/lib/claude/agent';
import type { StreamEvent } from '@/lib/claude/types';
import { SETUP_DISCOVERY_SYSTEM_PROMPT, SETUP_DISCOVERY_PROMPT } from './prompts';

// Models - copied from claude/index.ts to avoid import issues
const MODELS = {
  OPUS: 'claude-opus-4',
  SONNET: 'claude-sonnet-4',
  HAIKU: 'claude-haiku-4',
  OPUS_35: 'claude-opus-3-5-20241022',
  SONNET_35: 'claude-sonnet-3-5-20241022',
} as const;

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

/**
 * Runs setup discovery for a repository
 *
 * @param repoUrl - URL of the repository
 * @param workingDir - Local directory where repo is cloned
 * @param oauthToken - Claude OAuth token
 * @param onStream - Optional callback for streaming events
 * @returns Setup discovery result with parsed files
 */
export async function runSetupDiscovery(
  repoUrl: string,
  workingDir: string,
  oauthToken: string,
  onStream?: (event: StreamEvent) => void
): Promise<SetupDiscoveryResult> {
  try {
    const userPrompt = SETUP_DISCOVERY_PROMPT(repoUrl, workingDir);

    // Run Claude agent with streaming
    const agentGen = runAgent(
      userPrompt,
      {
        model: MODELS.SONNET, // Use Sonnet for good balance of capability and cost
        allowedTools: ['Read', 'Glob', 'Grep', 'Bash'], // Tools needed for exploration
        maxTurns: 25, // Give it enough turns to thoroughly explore
        systemPrompt: SETUP_DISCOVERY_SYSTEM_PROMPT,
        permissionMode: 'bypassPermissions', // Auto-approve read-only operations
        cwd: workingDir, // Set working directory to the repo
      },
      oauthToken
    );

    // Stream events and collect them
    const events: StreamEvent[] = [];
    for await (const event of agentGen) {
      events.push(event);
      if (onStream) {
        onStream(event);
      }
    }

    // Get result from the result event
    const finalEvent = events.find((e) => e.type === 'result');
    if (!finalEvent) {
      return {
        success: false,
        error: 'Agent execution did not produce a result',
      };
    }

    const resultContent = finalEvent.content as any;
    const isSuccess = resultContent.subtype === 'success';

    if (!isSuccess) {
      return {
        success: false,
        error: resultContent.is_error
          ? resultContent.errors?.join(', ') || 'Unknown error'
          : 'Agent execution failed',
      };
    }

    // Get the agent's final output from the result
    const agentOutput = resultContent.result || '';

    // Parse the setup files from the agent's output
    const files = parseSetupFiles(agentOutput);
    if (!files) {
      return {
        success: false,
        error: 'Failed to parse setup files from response. Agent did not return files in the expected format.',
      };
    }

    // Extract cost information
    const cost = {
      totalUsd: resultContent.total_cost_usd || 0,
      inputTokens: resultContent.usage?.input_tokens || 0,
      outputTokens: resultContent.usage?.output_tokens || 0,
    };

    return {
      success: true,
      files,
      cost,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during setup discovery',
    };
  }
}

/**
 * Validates that a setup.sh script has the proper structure
 */
export function validateSetupScript(script: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check for shebang
  if (!script.startsWith('#!/bin/bash') && !script.startsWith('#!/usr/bin/env bash')) {
    issues.push('Missing bash shebang (#!/bin/bash)');
  }

  // Check for set -e
  if (!script.includes('set -e')) {
    issues.push('Missing "set -e" for proper error handling');
  }

  // Check for basic structure
  if (script.length < 50) {
    issues.push('Script seems too short to be functional');
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
  if (!lowerContent.includes('setup') && !lowerContent.includes('install')) {
    issues.push('Missing setup/installation instructions');
  }

  if (!lowerContent.includes('test')) {
    issues.push('Missing testing information');
  }

  if (markdown.length < 100) {
    issues.push('Documentation seems too brief');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
