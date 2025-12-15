/**
 * Core types for Claude Agent SDK wrapper
 */

import type {
  ModelUsage,
  Options,
  SDKMessage as SDKMessageOriginal,
} from "@anthropic-ai/claude-agent-sdk";

// Re-export SDK message types for convenience
export type {
  ModelUsage,
  Options,
  SDKAssistantMessage,
  SDKMessage as SDKMessageOriginal,
  SDKPartialAssistantMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";

/**
 * SDK message types for easier categorization
 */
export type SDKMessageType = "assistant" | "user" | "result" | "system" | "stream_event";

/**
 * Generic SDK message interface
 */
export type SDKMessage = SDKMessageOriginal;

/**
 * Configuration for an agent execution
 */
export interface AgentConfig {
  /** System prompt for the agent */
  systemPrompt?: string | { type: "preset"; preset: "claude_code"; append?: string };

  /** Claude model to use (e.g., 'claude-opus-4', 'claude-sonnet-4') */
  model?: string;

  /** Temperature for response generation (0-1) */
  temperature?: number;

  /** Maximum number of conversation turns */
  maxTurns?: number;

  /** Tools available to the agent */
  allowedTools?: string[];

  /** Tools to explicitly disallow */
  disallowedTools?: string[];

  /** Current working directory */
  cwd?: string;

  /** Permission mode */
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan";

  /** Whether to include partial messages in stream */
  includePartialMessages?: boolean;

  /** Maximum budget in USD */
  maxBudgetUsd?: number;

  /** Additional options to pass through to SDK */
  additionalOptions?: Partial<Options>;
}

/**
 * Types of events that can be emitted during agent execution
 */
export type StreamEventType =
  | "init" // Session initialized
  | "assistant" // Assistant message
  | "user" // User message
  | "tool_use" // Tool being used
  | "tool_result" // Tool result
  | "thinking" // Assistant thinking (partial)
  | "result" // Final result
  | "error"; // Error occurred

/**
 * Event emitted during agent stream execution
 */
export interface StreamEvent {
  /** Type of event */
  type: StreamEventType;

  /** Event content/data */
  content: any;

  /** Timestamp of event */
  timestamp: Date;

  /** Optional metadata */
  metadata?: {
    sessionId?: string;
    messageId?: string;
    toolName?: string;
    model?: string;
    [key: string]: any;
  };
}

/**
 * Cost information for agent execution
 */
export interface CostInfo {
  /** Total cost in USD */
  totalUsd: number;

  /** Input tokens used */
  inputTokens: number;

  /** Output tokens used */
  outputTokens: number;

  /** Cache creation tokens */
  cacheCreationTokens?: number;

  /** Cache read tokens */
  cacheReadTokens?: number;

  /** Per-model usage breakdown */
  modelUsage?: Record<string, ModelUsage>;
}

/**
 * Result of an agent execution
 */
export interface AgentResult {
  /** Whether execution was successful */
  success: boolean;

  /** Final content/result */
  content: string;

  /** All events that occurred during execution */
  events: StreamEvent[];

  /** Cost information */
  cost: CostInfo;

  /** Number of conversation turns */
  turns: number;

  /** Session ID for resuming */
  sessionId?: string;

  /** Error message if failed */
  error?: string;

  /** Duration in milliseconds */
  durationMs?: number;

  /** Whether execution hit max turns */
  maxTurnsReached?: boolean;

  /** Whether execution hit budget limit */
  budgetExceeded?: boolean;
}

/**
 * Configuration for parallel agent execution
 */
export interface ParallelAgentConfig extends AgentConfig {
  /** Unique identifier for this agent */
  id: string;

  /** Prompt for this agent */
  prompt: string;
}

/**
 * Event from parallel agent execution (includes agent ID)
 */
export interface ParallelStreamEvent extends StreamEvent {
  /** ID of the agent that emitted this event */
  agentId: string;
}

/**
 * Result of structured output execution
 */
export interface StructuredResult<T = any> {
  /** Whether execution was successful */
  success: boolean;

  /** Parsed and validated data matching the schema */
  data?: T;

  /** Cost information */
  cost: CostInfo;

  /** Error message if parsing/validation failed */
  error?: string;

  /** Raw content before parsing */
  rawContent?: string;

  /** Number of retry attempts made */
  retries?: number;
}
