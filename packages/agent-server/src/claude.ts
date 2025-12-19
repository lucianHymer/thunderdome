/**
 * Claude SDK Wrapper
 *
 * Wraps the Claude Agent SDK to provide streaming execution
 * with SSE-compatible event emission.
 */

import { type Options, query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { setClaudeSessionId, updateSessionStatus } from "./sessions.js";
import type { OutputFormat, Session } from "./types.js";

// Claude CLI path - installed in container
const CLAUDE_CLI_PATH = process.env.CLAUDE_CLI_PATH || "/usr/local/bin/claude";

export interface StreamEvent {
  event: string;
  data: unknown;
}

export interface RunOptions {
  session: Session;
  prompt: string;
  oauthToken: string;
  onEvent: (event: StreamEvent) => void;
  outputFormat?: OutputFormat;
}

/**
 * Run a Claude agent for a session and stream events
 */
export async function runAgent(opts: RunOptions): Promise<void> {
  const { session, prompt, oauthToken, onEvent, outputFormat } = opts;

  // Mark session as streaming
  updateSessionStatus(session.id, "streaming");

  // Set OAuth token in environment
  const originalToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  process.env.CLAUDE_CODE_OAUTH_TOKEN = oauthToken;

  try {
    const options: Options = {
      systemPrompt: session.systemPrompt,
      model: session.model,
      maxTurns: session.maxTurns,
      allowedTools: session.tools,
      cwd: session.cwd,
      permissionMode: "bypassPermissions",
      pathToClaudeCodeExecutable: CLAUDE_CLI_PATH,
      // Resume from previous conversation if we have a session ID
      ...(session.claudeSessionId && { resume: session.claudeSessionId }),
      // Structured output format (optional)
      ...(outputFormat && { outputFormat }),
    };

    const queryGen = query({ prompt, options });

    let resultMessage: SDKMessage | null = null;

    for await (const message of queryGen) {
      const event = processMessage(message, session.id);
      if (event) {
        onEvent(event);
      }

      // Capture session ID from init
      if (message.type === "system" && message.subtype === "init") {
        setClaudeSessionId(session.id, message.session_id);
      }

      // Capture result
      if (message.type === "result") {
        resultMessage = message;
      }
    }

    // Send done event - ALWAYS send this, even if no result message
    const result = resultMessage as any;
    onEvent({
      event: "done",
      data: {
        success: result ? result.subtype === "success" : false,
        cost: {
          totalUsd: result?.total_cost_usd || 0,
          inputTokens: result?.usage?.input_tokens || 0,
          outputTokens: result?.usage?.output_tokens || 0,
        },
        turns: result?.num_turns || 0,
        error: result?.is_error ? result.errors?.join(", ") || "Unknown error" : undefined,
        // Include structured output if present
        structuredOutput: result?.structured_output,
      },
    });

    // Mark session as ready for next message
    updateSessionStatus(session.id, "ready");
  } catch (error) {
    // Send error event
    onEvent({
      event: "error",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });

    // Send done event with failure status
    onEvent({
      event: "done",
      data: {
        success: false,
        cost: {
          totalUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
        },
        turns: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });

    // Mark session as ready (can retry)
    updateSessionStatus(session.id, "ready");

    throw error;
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
 * Process an SDK message into an SSE event
 */
function processMessage(message: SDKMessage, sessionId: string): StreamEvent | null {
  switch (message.type) {
    case "system":
      if (message.subtype === "init") {
        return {
          event: "init",
          data: {
            sessionId,
            claudeSessionId: message.session_id,
            model: message.model,
            tools: message.tools,
            cwd: message.cwd,
          },
        };
      }
      return null;

    case "assistant": {
      // Check if this is a tool use or text content
      const content = message.message;
      if (content && typeof content === "object") {
        // Could be tool_use content blocks
        const blocks = Array.isArray(content) ? content : [content];
        for (const block of blocks) {
          if (block.type === "tool_use") {
            return {
              event: "tool_use",
              data: {
                id: block.id,
                tool: block.name,
                input: block.input,
              },
            };
          }
        }
      }
      return {
        event: "assistant",
        data: {
          content: typeof content === "string" ? content : JSON.stringify(content),
        },
      };
    }

    case "user": {
      // Tool results come back as user messages
      const userContent = message.message;
      if (userContent && typeof userContent === "object") {
        const blocks = Array.isArray(userContent) ? userContent : [userContent];
        for (const block of blocks) {
          if (block.type === "tool_result") {
            return {
              event: "tool_result",
              data: {
                toolUseId: block.tool_use_id,
                output:
                  typeof block.content === "string" ? block.content : JSON.stringify(block.content),
                isError: block.is_error || false,
              },
            };
          }
        }
      }
      return null;
    }

    case "result":
      // Handled separately in runAgent
      return null;

    default:
      return null;
  }
}
