/**
 * Claude Agent SDK Wrapper for Thunderdome
 *
 * This module provides a clean interface to the Claude Agent SDK with:
 * - Streaming and non-streaming execution
 * - Parallel agent execution
 * - Structured output with Zod schemas
 * - Token management and cost tracking
 */

// Core agent functionality
export {
  runAgent,
  runAgentSimple,
} from "./agent";

// Parallel execution
export {
  runAgentsParallel,
  runAgentsParallelBatch,
  runAgentsParallelSimple,
} from "./parallel";
// Schema exports
export {
  type AggregatedResults,
  // Aggregated results
  AggregatedResultsSchema,
  type ArbiterOutput,
  // Arbiter schemas
  ArbiterOutputSchema,
  // Utility schemas
  CostInfoSchema,
  type ErrorResponse,
  ErrorResponseSchema,
  type Gladiator,
  type GladiatorEvaluation,
  // Evaluation schemas
  GladiatorEvaluationSchema,
  // Gladiator schemas
  GladiatorSchema,
  type Judge,
  type JudgeOutput,
  JudgeOutputSchema,
  // Judge schemas
  JudgeSchema,
  type LanistaOutput,
  // Lanista schemas
  LanistaOutputSchema,
  type ThunderdomeSession,
  // Session schema
  ThunderdomeSessionSchema,
} from "./schemas";
// Structured output with Zod
export {
  runStructuredAgent,
  runStructuredAgentWithRetry,
} from "./structured";
// Type exports
export type {
  AgentConfig,
  AgentResult,
  CostInfo,
  ModelUsage,
  Options,
  ParallelAgentConfig,
  ParallelStreamEvent,
  SDKAssistantMessage,
  SDKMessage,
  SDKMessageType,
  SDKPartialAssistantMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKUserMessage,
  StreamEvent,
  StreamEventType,
  StructuredResult,
} from "./types";

/**
 * Validates a Claude OAuth token
 *
 * @param token - The token to validate
 * @returns True if token appears valid (basic format check)
 */
export function validateClaudeToken(token: string): boolean {
  if (!token || typeof token !== "string") {
    return false;
  }

  // Basic validation - should be a non-empty string
  // For OAuth tokens, they typically have a specific format
  // This is a simple check - actual validation happens server-side
  return token.length > 10;
}

/**
 * Gets the current authentication token from environment
 *
 * Checks in order:
 * 1. CLAUDE_CODE_OAUTH_TOKEN
 * 2. ANTHROPIC_API_KEY
 *
 * @returns The token, or undefined if not found
 */
export function getAuthToken(): string | undefined {
  return process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
}

/**
 * Checks if authentication is configured
 *
 * @returns True if either CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY is set
 */
export function isAuthConfigured(): boolean {
  const token = getAuthToken();
  return token !== undefined && validateClaudeToken(token);
}

/**
 * Model name mappings for convenience
 */
export const MODELS = {
  OPUS: "opus",
  SONNET: "sonnet",
  HAIKU: "haiku",
} as const;

/**
 * Common tool sets for different use cases
 */
export const TOOL_SETS = {
  /** Read-only tools for analysis */
  READ_ONLY: ["Read", "Glob", "Grep"],

  /** Full development tools */
  DEVELOPMENT: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],

  /** Code review tools */
  CODE_REVIEW: ["Read", "Glob", "Grep"],

  /** Research tools */
  RESEARCH: ["Read", "Glob", "Grep", "WebSearch", "WebFetch"],

  /** Testing tools */
  TESTING: ["Read", "Bash", "Glob", "Grep"],

  /** All available tools */
  ALL: [
    "Read",
    "Write",
    "Edit",
    "Bash",
    "Glob",
    "Grep",
    "WebSearch",
    "WebFetch",
    "TodoWrite",
    "NotebookEdit",
    "Task",
  ],
} as const;

/**
 * Permission modes for agent execution
 */
export const PERMISSION_MODES = {
  /** Standard permission behavior (ask for approval) */
  DEFAULT: "default",

  /** Auto-accept file edits */
  ACCEPT_EDITS: "acceptEdits",

  /** Bypass all permission checks (use with caution!) */
  BYPASS: "bypassPermissions",

  /** Planning mode - no execution */
  PLAN: "plan",
} as const;

/**
 * Creates a standard agent configuration for common use cases
 */
export function createAgentConfig(
  type: "development" | "research" | "review" | "testing",
  overrides: Partial<import("./types.js").AgentConfig> = {},
): import("./types.js").AgentConfig {
  const baseConfigs: Record<string, import("./types.js").AgentConfig> = {
    development: {
      model: MODELS.SONNET,
      allowedTools: [...TOOL_SETS.DEVELOPMENT],
      permissionMode: PERMISSION_MODES.ACCEPT_EDITS,
      maxTurns: 20,
    },
    research: {
      model: MODELS.SONNET,
      allowedTools: [...TOOL_SETS.RESEARCH],
      permissionMode: PERMISSION_MODES.DEFAULT,
      maxTurns: 15,
    },
    review: {
      model: MODELS.OPUS,
      allowedTools: [...TOOL_SETS.CODE_REVIEW],
      permissionMode: PERMISSION_MODES.BYPASS,
      maxTurns: 10,
    },
    testing: {
      model: MODELS.SONNET,
      allowedTools: [...TOOL_SETS.TESTING],
      permissionMode: PERMISSION_MODES.ACCEPT_EDITS,
      maxTurns: 15,
    },
  };

  return {
    ...baseConfigs[type],
    ...overrides,
  };
}

/**
 * Utility function to format cost information
 */
export function formatCost(cost: import("./types.js").CostInfo): string {
  const parts = [
    `$${cost.totalUsd.toFixed(4)}`,
    `(${cost.inputTokens.toLocaleString()} in`,
    `${cost.outputTokens.toLocaleString()} out`,
  ];

  if (cost.cacheReadTokens) {
    parts.push(`${cost.cacheReadTokens.toLocaleString()} cached`);
  }

  return `${parts.join(" ")})`;
}

/**
 * Utility function to calculate total cost from multiple results
 */
export function aggregateCosts(
  costs: import("./types.js").CostInfo[],
): import("./types.js").CostInfo {
  return costs.reduce(
    (acc, cost) => ({
      totalUsd: acc.totalUsd + cost.totalUsd,
      inputTokens: acc.inputTokens + cost.inputTokens,
      outputTokens: acc.outputTokens + cost.outputTokens,
      cacheCreationTokens: (acc.cacheCreationTokens || 0) + (cost.cacheCreationTokens || 0),
      cacheReadTokens: (acc.cacheReadTokens || 0) + (cost.cacheReadTokens || 0),
    }),
    {
      totalUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    },
  );
}
