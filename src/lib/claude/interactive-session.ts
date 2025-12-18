/**
 * Interactive Session Management
 *
 * Server-side session management using the Claude Agent SDK V2 API.
 * Enables true multi-turn conversations where users can send messages
 * at any time during agent execution.
 */

import {
  type Options,
  type SDKMessage,
  type SDKResultMessage,
  type SDKSession,
  unstable_v2_createSession,
} from "@anthropic-ai/claude-agent-sdk";

// Use system-installed Claude CLI
const CLAUDE_CLI_PATH = process.env.CLAUDE_CLI_PATH || `${process.env.HOME}/.local/bin/claude`;

/**
 * Configuration for creating an interactive session
 */
export interface InteractiveSessionConfig {
  /** System prompt for the agent */
  systemPrompt?: string;
  /** Model to use (opus, sonnet, haiku) */
  model?: string;
  /** Tools available to the agent */
  allowedTools?: string[];
  /** Tools to disallow */
  disallowedTools?: string[];
  /** Working directory for file operations */
  cwd?: string;
  /** Permission mode */
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan";
  /** Max turns before stopping */
  maxTurns?: number;
  /** Max budget in USD */
  maxBudgetUsd?: number;
}

/**
 * Active session storage
 * In production, this should be Redis or similar for multi-instance support
 */
const activeSessions = new Map<
  string,
  {
    session: SDKSession;
    config: InteractiveSessionConfig;
    createdAt: Date;
    lastActivityAt: Date;
  }
>();

// Clean up stale sessions every 5 minutes
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [id, data] of activeSessions.entries()) {
      if (now - data.lastActivityAt.getTime() > SESSION_TIMEOUT_MS) {
        console.log(`[InteractiveSession] Cleaning up stale session: ${id}`);
        data.session.close();
        activeSessions.delete(id);
      }
    }
  },
  5 * 60 * 1000,
);

/**
 * Creates a new interactive session
 *
 * @param config - Session configuration
 * @param oauthToken - User's OAuth token for authentication
 * @returns Session ID and the session object
 */
export async function createInteractiveSession(
  config: InteractiveSessionConfig,
  oauthToken: string,
): Promise<{ sessionId: string; session: SDKSession }> {
  // Set OAuth token for this session
  const originalToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  process.env.CLAUDE_CODE_OAUTH_TOKEN = oauthToken;

  try {
    const session = unstable_v2_createSession({
      model: config.model || "opus",
      pathToClaudeCodeExecutable: CLAUDE_CLI_PATH,
    });

    // The session ID becomes available after first message, but we need an ID now
    // Generate our own tracking ID
    const trackingId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    activeSessions.set(trackingId, {
      session,
      config,
      createdAt: new Date(),
      lastActivityAt: new Date(),
    });

    return { sessionId: trackingId, session };
  } finally {
    // Restore original token
    if (originalToken) {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = originalToken;
    } else {
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    }
  }
}

/**
 * Gets an existing session by ID
 */
export function getSession(sessionId: string): SDKSession | null {
  const data = activeSessions.get(sessionId);
  if (data) {
    data.lastActivityAt = new Date();
    return data.session;
  }
  return null;
}

/**
 * Closes and removes a session
 */
export function closeSession(sessionId: string): void {
  const data = activeSessions.get(sessionId);
  if (data) {
    data.session.close();
    activeSessions.delete(sessionId);
  }
}

/**
 * Processes SDK messages into a normalized format for streaming
 */
export interface StreamableMessage {
  type:
    | "init"
    | "assistant"
    | "user"
    | "tool_use"
    | "tool_result"
    | "thinking"
    | "result"
    | "error";
  content: any;
  timestamp: Date;
  messageId?: string;
}

export function processSDKMessage(message: SDKMessage): StreamableMessage | null {
  const timestamp = new Date();

  switch (message.type) {
    case "system":
      if (message.subtype === "init") {
        return {
          type: "init",
          content: {
            model: message.model,
            tools: message.tools,
            cwd: message.cwd,
          },
          timestamp,
        };
      }
      return null;

    case "assistant": {
      const content = message.message.content;
      // Extract text and tool use from content array
      const textBlocks: string[] = [];
      const toolUses: any[] = [];

      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text") {
            textBlocks.push(block.text);
          } else if (block.type === "tool_use") {
            toolUses.push({
              id: block.id,
              name: block.name,
              input: block.input,
            });
          }
        }
      }

      return {
        type: "assistant",
        content: {
          text: textBlocks.join("\n"),
          toolUses,
        },
        timestamp,
        messageId: message.uuid,
      };
    }

    case "user":
      return {
        type: "user",
        content: message.message,
        timestamp,
        messageId: message.uuid,
      };

    case "stream_event":
      // Partial/thinking events
      if (message.event?.type === "content_block_delta") {
        const delta = message.event.delta as any;
        if (delta?.type === "thinking_delta") {
          return {
            type: "thinking",
            content: { text: delta.thinking },
            timestamp,
          };
        } else if (delta?.type === "text_delta") {
          return {
            type: "assistant",
            content: { text: delta.text, partial: true },
            timestamp,
          };
        }
      }
      return null;

    case "result":
      return {
        type: "result",
        content: {
          success: message.subtype === "success",
          result: message.subtype === "success" ? (message as any).result : undefined,
          error: message.subtype !== "success" ? (message as any).errors?.join(", ") : undefined,
          cost: {
            totalUsd: message.total_cost_usd,
            inputTokens: message.usage.input_tokens,
            outputTokens: message.usage.output_tokens,
          },
          turns: message.num_turns,
        },
        timestamp,
        messageId: message.uuid,
      };

    default:
      return null;
  }
}

/**
 * Creates an async generator that yields streamable messages from a session
 */
export async function* streamSession(
  session: SDKSession,
  oauthToken: string,
): AsyncGenerator<StreamableMessage, SDKResultMessage | null, unknown> {
  // Set OAuth token
  const originalToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  process.env.CLAUDE_CODE_OAUTH_TOKEN = oauthToken;

  let finalResult: SDKResultMessage | null = null;

  try {
    for await (const message of session.receive()) {
      const processed = processSDKMessage(message);
      if (processed) {
        yield processed;
      }

      if (message.type === "result") {
        finalResult = message;
      }
    }
  } finally {
    // Restore token
    if (originalToken) {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = originalToken;
    } else {
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    }
  }

  return finalResult;
}
