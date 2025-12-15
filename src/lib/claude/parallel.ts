/**
 * Parallel agent execution functionality
 */

import { runAgent } from "./agent";
import type {
  AgentResult,
  ParallelAgentConfig,
  ParallelStreamEvent,
  StreamEvent,
} from "./types";

/**
 * Runs multiple agents in parallel and yields events from all of them
 *
 * @param agents - Array of agent configurations with IDs and prompts
 * @param oauthToken - OAuth token for authentication
 * @yields ParallelStreamEvent objects with agentId
 * @returns Map of agentId to AgentResult
 *
 * @example
 * ```typescript
 * const agents = [
 *   { id: 'finder', prompt: 'Find all TODOs', allowedTools: ['Grep'] },
 *   { id: 'analyzer', prompt: 'Analyze complexity', allowedTools: ['Read'] },
 * ];
 *
 * for await (const event of runAgentsParallel(agents)) {
 *   console.log(`[${event.agentId}] ${event.type}:`, event.content);
 * }
 * ```
 */
export async function* runAgentsParallel(
  agents: ParallelAgentConfig[],
  oauthToken?: string,
): AsyncGenerator<ParallelStreamEvent, Map<string, AgentResult>, unknown> {
  const results = new Map<string, AgentResult>();
  const generators = new Map<string, AsyncGenerator<StreamEvent, AgentResult, unknown>>();

  // Start all agents
  for (const agent of agents) {
    const { id, prompt, ...config } = agent;
    generators.set(id, runAgent(prompt, config, oauthToken));
  }

  // Create array of promises for the next value from each generator
  const createPromises = () => {
    const promises: Array<{
      agentId: string;
      promise: Promise<IteratorResult<StreamEvent, AgentResult>>;
    }> = [];

    for (const [agentId, generator] of generators.entries()) {
      if (!results.has(agentId)) {
        promises.push({
          agentId,
          promise: generator.next(),
        });
      }
    }

    return promises;
  };

  // Process events as they arrive from any agent
  while (generators.size > results.size) {
    const promises = createPromises();

    if (promises.length === 0) break;

    // Wait for the first promise to resolve
    const winner = await Promise.race(
      promises.map(async ({ agentId, promise }) => ({
        agentId,
        result: await promise,
      })),
    );

    const { agentId, result } = winner;

    if (result.done) {
      // Agent completed
      results.set(agentId, result.value);
    } else {
      // Agent yielded an event
      const event = result.value;
      const parallelEvent: ParallelStreamEvent = {
        ...event,
        agentId,
      };

      yield parallelEvent;
    }
  }

  return results;
}

/**
 * Runs multiple agents in parallel without streaming, returns only final results
 *
 * @param agents - Array of agent configurations with IDs and prompts
 * @param oauthToken - OAuth token for authentication
 * @returns Map of agentId to AgentResult
 *
 * @example
 * ```typescript
 * const results = await runAgentsParallelSimple([
 *   { id: 'agent1', prompt: 'Task 1', allowedTools: ['Read'] },
 *   { id: 'agent2', prompt: 'Task 2', allowedTools: ['Grep'] },
 * ]);
 *
 * console.log(results.get('agent1')?.content);
 * console.log(results.get('agent2')?.content);
 * ```
 */
export async function runAgentsParallelSimple(
  agents: ParallelAgentConfig[],
  oauthToken?: string,
): Promise<Map<string, AgentResult>> {
  const _results = new Map<string, AgentResult>();
  const generator = runAgentsParallel(agents, oauthToken);

  // Consume all events
  for await (const _event of generator) {
    // Just consume events
  }

  // Build results from agent executions
  // We'll use the batch approach instead for simplicity
  return runAgentsParallelBatch(agents, oauthToken);
}

/**
 * Runs agents in parallel using Promise.all (simpler but less real-time)
 *
 * @param agents - Array of agent configurations with IDs and prompts
 * @param oauthToken - OAuth token for authentication
 * @returns Map of agentId to AgentResult
 *
 * @example
 * ```typescript
 * const results = await runAgentsParallelBatch([
 *   { id: 'agent1', prompt: 'Task 1' },
 *   { id: 'agent2', prompt: 'Task 2' },
 * ]);
 * ```
 */
export async function runAgentsParallelBatch(
  agents: ParallelAgentConfig[],
  oauthToken?: string,
): Promise<Map<string, AgentResult>> {
  const promises = agents.map(async (agent) => {
    const { id, prompt, ...config } = agent;
    const events: StreamEvent[] = [];
    const generator = runAgent(prompt, config, oauthToken);

    // Consume all events
    for await (const event of generator) {
      events.push(event);
    }

    // Build result from events
    const finalEvent = events.find((e) => e.type === "result");
    if (!finalEvent) {
      throw new Error(`Agent ${id} did not produce a result`);
    }

    const resultContent = finalEvent.content as any;
    const result: AgentResult = {
      success: resultContent.subtype === "success",
      content: resultContent.result || "",
      events,
      cost: {
        totalUsd: resultContent.total_cost_usd || 0,
        inputTokens: resultContent.usage?.input_tokens || 0,
        outputTokens: resultContent.usage?.output_tokens || 0,
        cacheCreationTokens: resultContent.usage?.cache_creation_input_tokens,
        cacheReadTokens: resultContent.usage?.cache_read_input_tokens,
        modelUsage: resultContent.modelUsage,
      },
      turns: resultContent.num_turns || 0,
      sessionId: finalEvent.metadata?.sessionId,
      durationMs: resultContent.duration_ms,
      maxTurnsReached: resultContent.subtype === "error_max_turns",
      budgetExceeded: resultContent.subtype === "error_max_budget_usd",
      error: resultContent.is_error
        ? resultContent.errors?.join(", ") || "Unknown error"
        : undefined,
    };

    return { id, result };
  });

  const completed = await Promise.all(promises);

  const results = new Map<string, AgentResult>();
  for (const { id, result } of completed) {
    results.set(id, result);
  }

  return results;
}
