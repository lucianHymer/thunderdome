/**
 * Agent Server Client
 *
 * Client for communicating with the agent server running inside Docker containers.
 * Handles session creation, message sending, and SSE streaming.
 */

export type Model = "opus" | "sonnet" | "haiku";

/**
 * JSON Schema for structured output
 */
export interface JsonSchema {
  type: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  description?: string;
  enum?: string[];
  [key: string]: unknown;
}

/**
 * Output format specification for structured output
 */
export interface OutputFormat {
  type: "json_schema";
  schema: JsonSchema;
}

export interface CreateSessionOptions {
  sessionId?: string;
  model: Model;
  systemPrompt?: string;
  tools: string[];
  cwd: string;
  maxTurns?: number;
  oauthToken: string;
}

export interface SessionInfo {
  sessionId: string;
  status: "ready" | "streaming" | "ended";
  model: Model;
  cwd: string;
  createdAt: string;
  lastActivity: string;
}

export interface AgentEvent {
  event: string;
  data: unknown;
}

export interface DoneEventData {
  success: boolean;
  cost: {
    totalUsd: number;
    inputTokens: number;
    outputTokens: number;
  };
  turns: number;
  error?: string;
  structuredOutput?: unknown;
}

/**
 * Client for an agent server running in a container
 */
export class AgentServerClient {
  private baseUrl: string;

  constructor(host: string, port: number = 3000) {
    this.baseUrl = `http://${host}:${port}`;
  }

  /**
   * Check if the agent server is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Wait for the agent server to become healthy
   */
  async waitForHealthy(maxWaitMs: number = 30000, intervalMs: number = 1000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      if (await this.isHealthy()) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return false;
  }

  /**
   * Create a new session
   */
  async createSession(options: CreateSessionOptions): Promise<SessionInfo> {
    const response = await fetch(`${this.baseUrl}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to create session: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get session info
   */
  async getSession(sessionId: string): Promise<SessionInfo> {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to get session: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Send a message to a session and stream the response
   *
   * @param sessionId - The session ID
   * @param content - The message content
   * @param oauthToken - OAuth token for authentication
   * @param onEvent - Callback for each SSE event
   * @param outputFormat - Optional structured output format for this message
   * @returns Promise that resolves when streaming is complete
   */
  async sendMessage(
    sessionId: string,
    content: string,
    oauthToken: string,
    onEvent: (event: AgentEvent) => void | Promise<void>,
    outputFormat?: OutputFormat,
  ): Promise<DoneEventData> {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, oauthToken, outputFormat }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to send message: ${response.status}`);
    }

    if (!response.body) {
      throw new Error("No response body");
    }

    // Parse SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let doneData: DoneEventData | null = null;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      let currentEvent = "";
      let currentData = "";

      for (const line of lines) {
        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          currentData = line.slice(5).trim();
        } else if (line === "" && currentEvent && currentData) {
          // End of event
          try {
            const data = JSON.parse(currentData);
            const event: AgentEvent = { event: currentEvent, data };

            await onEvent(event);

            // Capture done event data
            if (currentEvent === "done") {
              doneData = data as DoneEventData;
            }
          } catch (e) {
            console.error("Failed to parse SSE event:", e);
          }

          currentEvent = "";
          currentData = "";
        }
      }
    }

    if (!doneData) {
      throw new Error("Stream ended without done event");
    }

    return doneData;
  }

  /**
   * End a session
   */
  async endSession(sessionId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/sessions/${sessionId}`, {
      method: "DELETE",
    });

    if (!response.ok && response.status !== 404) {
      const error = await response.json();
      throw new Error(error.error || `Failed to end session: ${response.status}`);
    }
  }

  /**
   * List all sessions
   */
  async listSessions(): Promise<SessionInfo[]> {
    const response = await fetch(`${this.baseUrl}/sessions`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to list sessions: ${response.status}`);
    }

    const data = await response.json();
    return data.sessions;
  }
}

/**
 * Create an agent server client for a container
 */
export function createAgentClient(host: string, port: number = 3000): AgentServerClient {
  return new AgentServerClient(host, port);
}
