/**
 * Shared Agent Discovery Session Manager
 *
 * Provides a unified session management utility for agent-based discovery flows
 * (setup discovery, consul, etc.). Each manager maintains its own isolated session
 * state while sharing common implementation logic.
 */

import type { AgentEvent, Model, OutputFormat } from "../docker/agent-client";
import { getTrialContainer } from "../trial/container-service";

/**
 * Configuration for creating an agent session
 */
export interface AgentSessionConfig {
  systemPrompt: string;
  tools: string[];
  model?: Model;
  maxTurns?: number;
  cwd?: string;
  idleTimeoutMs?: number;
}

/**
 * Agent session manager interface
 */
export interface AgentSessionManager {
  /**
   * Get existing session or create a new one for a trial
   * @returns sessionId and whether this is a newly created session
   */
  getOrCreateSession(
    trialId: string,
    oauthToken: string,
    config: AgentSessionConfig,
  ): Promise<{ sessionId: string; isNew: boolean }>;

  /**
   * Send a message to the agent session and stream events
   * @param onEvent - Callback invoked for each streamed event
   * @param outputFormat - Optional structured output format
   */
  sendMessage(
    trialId: string,
    message: string,
    oauthToken: string,
    onEvent: (event: AgentEvent) => void | Promise<void>,
    outputFormat?: OutputFormat,
  ): Promise<{ success: boolean; error?: string }>;

  /**
   * End the session and clean up resources
   */
  endSession(trialId: string): Promise<void>;

  /**
   * Check if a session exists for a trial
   */
  hasSession(trialId: string): boolean;
}

/**
 * Internal session state
 */
interface SessionState {
  sessionId: string;
  lastActivity: Date;
}

/**
 * Implementation of AgentSessionManager
 */
class AgentSessionManagerImpl implements AgentSessionManager {
  private sessions = new Map<string, SessionState>();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    private name: string,
    private defaultIdleTimeoutMs?: number,
  ) {
    // Start cleanup interval if idle timeout is configured
    if (defaultIdleTimeoutMs) {
      this.cleanupInterval = setInterval(() => {
        void this.cleanupIdleSessions();
      }, 60000); // Check every minute
    }
  }

  async getOrCreateSession(
    trialId: string,
    oauthToken: string,
    config: AgentSessionConfig,
  ): Promise<{ sessionId: string; isNew: boolean }> {
    // Check for existing session
    const existing = this.sessions.get(trialId);
    if (existing) {
      existing.lastActivity = new Date();
      return { sessionId: existing.sessionId, isNew: false };
    }

    // Get the trial container (should already exist)
    const container = getTrialContainer(trialId);
    if (!container) {
      throw new Error("Trial container not found. Start the trial first.");
    }

    const agentClient = container.getAgentClient();

    // Create new session with provided config
    const session = await agentClient.createSession({
      model: config.model ?? "opus",
      systemPrompt: config.systemPrompt,
      tools: config.tools,
      cwd: config.cwd ?? "/workspace/repo",
      maxTurns: config.maxTurns ?? 50,
      oauthToken,
    });

    // Store session
    this.sessions.set(trialId, {
      sessionId: session.sessionId,
      lastActivity: new Date(),
    });

    return { sessionId: session.sessionId, isNew: true };
  }

  async sendMessage(
    trialId: string,
    message: string,
    oauthToken: string,
    onEvent: (event: AgentEvent) => void | Promise<void>,
    outputFormat?: OutputFormat,
  ): Promise<{ success: boolean; error?: string }> {
    const container = getTrialContainer(trialId);
    if (!container) {
      return { success: false, error: "Trial container not found" };
    }

    const session = this.sessions.get(trialId);
    if (!session) {
      return { success: false, error: "No active session for this trial" };
    }

    try {
      const agentClient = container.getAgentClient();

      // Update last activity
      session.lastActivity = new Date();

      // Send message and stream response
      const result = await agentClient.sendMessage(
        session.sessionId,
        message,
        oauthToken,
        onEvent,
        outputFormat,
      );

      return {
        success: result.success,
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async endSession(trialId: string): Promise<void> {
    const session = this.sessions.get(trialId);
    if (session) {
      const container = getTrialContainer(trialId);
      if (container) {
        try {
          await container.getAgentClient().endSession(session.sessionId);
        } catch {
          // Ignore session end errors - session may already be ended
        }
      }
      this.sessions.delete(trialId);
    }
  }

  hasSession(trialId: string): boolean {
    return this.sessions.has(trialId);
  }

  /**
   * Get the session ID for a trial (if exists)
   * @internal - used for testing and debugging
   */
  getSessionId(trialId: string): string | undefined {
    return this.sessions.get(trialId)?.sessionId;
  }

  /**
   * Clean up idle sessions based on timeout
   * @internal
   */
  private async cleanupIdleSessions(): Promise<void> {
    if (!this.defaultIdleTimeoutMs) {
      return;
    }

    const now = Date.now();
    const toCleanup: string[] = [];

    for (const [trialId, session] of this.sessions.entries()) {
      if (now - session.lastActivity.getTime() > this.defaultIdleTimeoutMs) {
        toCleanup.push(trialId);
      }
    }

    for (const trialId of toCleanup) {
      await this.endSession(trialId);
    }
  }

  /**
   * Stop cleanup interval (for graceful shutdown)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }
}

/**
 * Factory function to create a new agent session manager
 *
 * @param name - Descriptive name for this manager (e.g., "setup", "consul")
 * @param idleTimeoutMs - Optional idle timeout in milliseconds. If provided, sessions
 *                        will be automatically cleaned up after this period of inactivity.
 * @returns A new AgentSessionManager instance with isolated session state
 *
 * @example
 * ```ts
 * // Create a setup discovery manager with 10-minute idle timeout
 * const setupManager = createAgentSessionManager("setup", 10 * 60 * 1000);
 *
 * // Create a session
 * const { sessionId, isNew } = await setupManager.getOrCreateSession(
 *   trialId,
 *   oauthToken,
 *   {
 *     systemPrompt: "You are a setup discovery agent...",
 *     tools: ["Read", "Glob", "Grep", "Bash"],
 *     model: "opus",
 *   }
 * );
 *
 * // Send a message
 * await setupManager.sendMessage(
 *   trialId,
 *   "Analyze this repository",
 *   oauthToken,
 *   (event) => console.log(event)
 * );
 *
 * // Clean up
 * await setupManager.endSession(trialId);
 * ```
 */
export function createAgentSessionManager(
  name: string,
  idleTimeoutMs?: number,
): AgentSessionManager {
  return new AgentSessionManagerImpl(name, idleTimeoutMs);
}
