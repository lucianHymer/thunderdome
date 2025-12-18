/**
 * Agent Server Types
 */

export type Model = "opus" | "sonnet" | "haiku";

export type SessionStatus = "ready" | "streaming" | "ended";

export interface CreateSessionRequest {
  sessionId?: string;
  model: Model;
  systemPrompt?: string;
  tools: string[];
  cwd: string;
  maxTurns?: number;
  oauthToken: string;
}

export interface CreateSessionResponse {
  sessionId: string;
  status: SessionStatus;
}

export interface SendMessageRequest {
  content: string;
  oauthToken: string;
}

export interface SessionInfo {
  sessionId: string;
  status: SessionStatus;
  model: Model;
  cwd: string;
  createdAt: string;
  lastActivity: string;
}

export interface Session {
  id: string;
  model: Model;
  systemPrompt?: string;
  tools: string[];
  cwd: string;
  maxTurns?: number;
  status: SessionStatus;
  claudeSessionId?: string; // For resume capability
  createdAt: Date;
  lastActivity: Date;
}

// SSE Event types
export interface SSEEvent {
  event: string;
  data: unknown;
}

export interface InitEvent {
  sessionId: string;
  model: string;
  tools: string[];
  cwd: string;
}

export interface AssistantEvent {
  content: string;
}

export interface ToolUseEvent {
  tool: string;
  input: Record<string, unknown>;
}

export interface ToolResultEvent {
  output: string;
}

export interface DoneEvent {
  success: boolean;
  cost: {
    totalUsd: number;
    inputTokens: number;
    outputTokens: number;
  };
  turns: number;
  error?: string;
}

export interface ErrorEvent {
  error: string;
  code?: string;
}
