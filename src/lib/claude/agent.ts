/**
 * Core agent execution functionality
 */

import { type Options, query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentConfig, AgentResult, CostInfo, StreamEvent } from "./types";

/**
 * Processes an SDK message into a StreamEvent
 */
function processMessage(message: SDKMessage): StreamEvent | null {
  const timestamp = new Date();

  switch (message.type) {
    case "system":
      if (message.subtype === "init") {
        return {
          type: "init",
          content: {
            sessionId: message.session_id,
            model: message.model,
            tools: message.tools,
            cwd: message.cwd,
            permissionMode: message.permissionMode,
          },
          timestamp,
          metadata: {
            sessionId: message.session_id,
            messageId: message.uuid,
            model: message.model,
          },
        };
      }
      return null;

    case "assistant":
      return {
        type: "assistant",
        content: message.message,
        timestamp,
        metadata: {
          sessionId: message.session_id,
          messageId: message.uuid,
        },
      };

    case "user":
      return {
        type: "user",
        content: message.message,
        timestamp,
        metadata: {
          sessionId: message.session_id,
          messageId: message.uuid,
        },
      };

    case "stream_event":
      return {
        type: "thinking",
        content: message.event,
        timestamp,
        metadata: {
          sessionId: message.session_id,
          messageId: message.uuid,
        },
      };

    case "result":
      return {
        type: "result",
        content: message,
        timestamp,
        metadata: {
          sessionId: message.session_id,
          messageId: message.uuid,
        },
      };

    default:
      return null;
  }
}

/**
 * Extracts cost information from a result message
 */
function extractCostInfo(result: any): CostInfo {
  return {
    totalUsd: result.total_cost_usd || 0,
    inputTokens: result.usage?.input_tokens || 0,
    outputTokens: result.usage?.output_tokens || 0,
    cacheCreationTokens: result.usage?.cache_creation_input_tokens,
    cacheReadTokens: result.usage?.cache_read_input_tokens,
    modelUsage: result.modelUsage,
  };
}

/**
 * Runs an agent and yields stream events
 *
 * @param prompt - The prompt to send to the agent
 * @param config - Agent configuration
 * @param oauthToken - OAuth token for authentication
 * @yields StreamEvent objects as they occur
 * @returns AgentResult with final outcome
 *
 * @example
 * ```typescript
 * for await (const event of runAgent("Find all TODO comments", {
 *   allowedTools: ["Grep", "Glob"],
 *   maxTurns: 5
 * })) {
 *   console.log(event.type, event.content);
 * }
 * ```
 */
export async function* runAgent(
  prompt: string,
  config: AgentConfig = {},
  oauthToken?: string,
): AsyncGenerator<StreamEvent, AgentResult, unknown> {
  const events: StreamEvent[] = [];
  let sessionId: string | undefined;
  let finalResult: any;
  let agentResult: AgentResult | undefined;

  // Build SDK options from our config
  // Note: pathToClaudeCodeExecutable MUST come after additionalOptions spread
  const claudePath = process.env.CLAUDE_CLI_PATH ||
    (process.env.HOME ? `${process.env.HOME}/.local/bin/claude` : "/usr/local/bin/claude");

  console.log("[Agent] Claude path:", claudePath);
  console.log("[Agent] HOME:", process.env.HOME);
  console.log("[Agent] Token set:", !!oauthToken);

  const options: Options = {
    systemPrompt: config.systemPrompt,
    model: config.model,
    maxTurns: config.maxTurns,
    allowedTools: config.allowedTools,
    disallowedTools: config.disallowedTools,
    cwd: config.cwd,
    permissionMode: config.permissionMode,
    includePartialMessages: config.includePartialMessages,
    maxBudgetUsd: config.maxBudgetUsd,
    ...config.additionalOptions,
    // Path to Claude CLI - check env var first, then common locations
    // Must come AFTER spread to avoid being overwritten
    pathToClaudeCodeExecutable: claudePath,
    // Enable stderr capture to see actual errors from claude
    stderr: (data: string) => console.error("[Claude stderr]", data),
  };

  // Set OAuth token if provided (for Claude Code integration)
  const originalToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (oauthToken) {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = oauthToken;
  }

  try {
    const queryGen = query({
      prompt,
      options,
    });

    // Process each message from the SDK
    for await (const message of queryGen) {
      const event = processMessage(message);

      if (event) {
        events.push(event);

        // Capture session ID from init event
        if (event.type === "init" && event.content.sessionId) {
          sessionId = event.content.sessionId;
        }

        // Store final result message
        if (event.type === "result") {
          finalResult = event.content;
        }

        yield event;
      }
    }

    // Build final result
    const cost = finalResult
      ? extractCostInfo(finalResult)
      : {
          totalUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
        };

    agentResult = {
      success: finalResult?.subtype === "success",
      content: finalResult?.result || "",
      events,
      cost,
      turns: finalResult?.num_turns || 0,
      sessionId,
      durationMs: finalResult?.duration_ms,
      maxTurnsReached: finalResult?.subtype === "error_max_turns",
      budgetExceeded: finalResult?.subtype === "error_max_budget_usd",
      error: finalResult?.is_error ? finalResult.errors?.join(", ") || "Unknown error" : undefined,
    };

    return agentResult;
  } finally {
    // Restore original token
    if (oauthToken) {
      if (originalToken) {
        process.env.CLAUDE_CODE_OAUTH_TOKEN = originalToken;
      } else {
        delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
      }
    }
  }
}

/**
 * Runs an agent without streaming, returns only the final result
 *
 * @param prompt - The prompt to send to the agent
 * @param config - Agent configuration
 * @param oauthToken - OAuth token for authentication
 * @returns Final AgentResult
 *
 * @example
 * ```typescript
 * const result = await runAgentSimple("Analyze this code", {
 *   allowedTools: ["Read", "Grep"],
 * });
 * console.log(result.content);
 * ```
 */
export async function runAgentSimple(
  prompt: string,
  config: AgentConfig = {},
  oauthToken?: string,
): Promise<AgentResult> {
  // Store the final result by consuming the generator
  const events: StreamEvent[] = [];

  // Create generator and consume all events
  const generator = runAgent(prompt, config, oauthToken);

  // Iterate through all yielded events
  for await (const event of generator) {
    events.push(event);
  }

  // The generator automatically returns the AgentResult when done
  // We can access it from the last result
  const finalEvent = events.find((e) => e.type === "result");
  if (!finalEvent) {
    throw new Error("Agent execution did not produce a result");
  }

  // Build AgentResult from events
  const resultContent = finalEvent.content as any;
  const cost = extractCostInfo(resultContent);

  return {
    success: resultContent.subtype === "success",
    content: resultContent.result || "",
    events,
    cost,
    turns: resultContent.num_turns || 0,
    sessionId: finalEvent.metadata?.sessionId,
    durationMs: resultContent.duration_ms,
    maxTurnsReached: resultContent.subtype === "error_max_turns",
    budgetExceeded: resultContent.subtype === "error_max_budget_usd",
    error: resultContent.is_error ? resultContent.errors?.join(", ") || "Unknown error" : undefined,
  };
}
