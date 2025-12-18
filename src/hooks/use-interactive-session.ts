/**
 * useInteractiveSession Hook
 *
 * Client-side hook for managing interactive Claude sessions.
 * Communicates with server-side API to create and manage sessions.
 */

"use client";

import { useCallback, useRef, useState } from "react";

/**
 * A message in the conversation
 */
export interface SessionMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  toolUses?: Array<{
    id: string;
    name: string;
    input: any;
  }>;
  isPartial?: boolean;
  timestamp: Date;
}

/**
 * Session status
 */
export type SessionStatus = "idle" | "connecting" | "streaming" | "waiting" | "complete" | "error";

/**
 * Configuration for the session
 */
export interface SessionConfig {
  /** API endpoint to create/manage sessions */
  apiEndpoint: string;
  /** System prompt for the agent */
  systemPrompt?: string;
  /** Model to use */
  model?: string;
  /** Tools available */
  allowedTools?: string[];
  /** Working directory */
  cwd?: string;
  /** Permission mode */
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions";
  /** Max turns */
  maxTurns?: number;
}

/**
 * Result information when session completes
 */
export interface SessionResult {
  success: boolean;
  content?: string;
  error?: string;
  cost?: {
    totalUsd: number;
    inputTokens: number;
    outputTokens: number;
  };
  turns?: number;
}

/**
 * Return type for the hook
 */
export interface UseInteractiveSessionReturn {
  /** All messages in the conversation */
  messages: SessionMessage[];
  /** Current session status */
  status: SessionStatus;
  /** Error message if any */
  error: string | null;
  /** Session ID (available after start) */
  sessionId: string | null;
  /** Final result (available after completion) */
  result: SessionResult | null;

  /** Start a new session with an initial prompt */
  start: (initialPrompt: string, extraData?: Record<string, any>) => Promise<void>;
  /** Send a message to the current session */
  send: (message: string) => Promise<void>;
  /** Stop/abort the current session */
  stop: () => void;
  /** Reset the session state */
  reset: () => void;
}

/**
 * Hook for managing interactive Claude sessions
 */
export function useInteractiveSession(config: SessionConfig): UseInteractiveSessionReturn {
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [result, setResult] = useState<SessionResult | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const currentAssistantMessageRef = useRef<string>("");

  /**
   * Process SSE stream from the server
   */
  const processStream = useCallback(async (response: Response) => {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error("No response body");
    }

    // Track current assistant message for accumulation
    let currentMessageId: string | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            handleStreamEvent(parsed, currentMessageId, (newId) => {
              currentMessageId = newId;
            });
          } catch {
            // Ignore parse errors for partial data
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }, []);

  /**
   * Handle individual stream events
   */
  const handleStreamEvent = useCallback(
    (
      event: any,
      currentMessageId: string | null,
      setCurrentMessageId: (id: string | null) => void,
    ) => {
      switch (event.type) {
        case "session_created":
          setSessionId(event.sessionId);
          break;

        case "init":
          // Session initialized
          setStatus("streaming");
          break;

        case "assistant": {
          const { text, toolUses, partial } = event.content || {};

          if (partial && text) {
            // Accumulate partial text
            currentAssistantMessageRef.current += text;

            // Update or create the assistant message
            setMessages((prev) => {
              const existingIdx = prev.findIndex((m) => m.role === "assistant" && m.isPartial);

              if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx] = {
                  ...updated[existingIdx],
                  content: currentAssistantMessageRef.current,
                };
                return updated;
              } else {
                const newId = `assistant_${Date.now()}`;
                setCurrentMessageId(newId);
                return [
                  ...prev,
                  {
                    id: newId,
                    role: "assistant",
                    content: currentAssistantMessageRef.current,
                    isPartial: true,
                    timestamp: new Date(),
                  },
                ];
              }
            });
          } else if (text || toolUses?.length) {
            // Complete assistant message
            currentAssistantMessageRef.current = "";

            setMessages((prev) => {
              // Remove any partial message
              const filtered = prev.filter((m) => !m.isPartial);
              return [
                ...filtered,
                {
                  id: event.messageId || `assistant_${Date.now()}`,
                  role: "assistant",
                  content: text || "",
                  toolUses,
                  isPartial: false,
                  timestamp: new Date(),
                },
              ];
            });
            setCurrentMessageId(null);
          }
          break;
        }

        case "tool_use":
          // Tool being used - could add to messages or just log
          setMessages((prev) => [
            ...prev,
            {
              id: `tool_${Date.now()}`,
              role: "system",
              content: `Using tool: ${event.content?.name}`,
              timestamp: new Date(),
            },
          ]);
          break;

        case "thinking":
          // Could display thinking if desired
          break;

        case "waiting":
          // Agent is waiting for more input
          setStatus("waiting");
          break;

        case "result": {
          const {
            success,
            result: resultContent,
            error: resultError,
            cost,
            turns,
          } = event.content || {};
          setResult({
            success,
            content: resultContent,
            error: resultError,
            cost,
            turns,
          });
          setStatus("complete");
          break;
        }

        case "error":
          setError(event.content?.message || event.error || "Unknown error");
          setStatus("error");
          break;
      }
    },
    [],
  );

  /**
   * Start a new session
   */
  const start = useCallback(
    async (initialPrompt: string, extraData?: Record<string, any>) => {
      // Reset state
      setMessages([]);
      setError(null);
      setResult(null);
      setSessionId(null);
      currentAssistantMessageRef.current = "";

      // Create abort controller
      abortControllerRef.current = new AbortController();

      setStatus("connecting");

      try {
        const response = await fetch(config.apiEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "start",
            prompt: initialPrompt,
            config: {
              systemPrompt: config.systemPrompt,
              model: config.model,
              allowedTools: config.allowedTools,
              cwd: config.cwd,
              permissionMode: config.permissionMode,
              maxTurns: config.maxTurns,
            },
            ...extraData,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        // Add user message
        setMessages([
          {
            id: `user_${Date.now()}`,
            role: "user",
            content: initialPrompt,
            timestamp: new Date(),
          },
        ]);

        setStatus("streaming");

        // Process the SSE stream
        await processStream(response);
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setStatus("idle");
        } else {
          setError((err as Error).message);
          setStatus("error");
        }
      }
    },
    [config, processStream],
  );

  /**
   * Send a message to the current session
   */
  const send = useCallback(
    async (message: string) => {
      if (!sessionId) {
        setError("No active session");
        return;
      }

      // Add user message immediately
      setMessages((prev) => [
        ...prev,
        {
          id: `user_${Date.now()}`,
          role: "user",
          content: message,
          timestamp: new Date(),
        },
      ]);

      currentAssistantMessageRef.current = "";
      setStatus("streaming");

      try {
        const response = await fetch(config.apiEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "send",
            sessionId,
            message,
          }),
          signal: abortControllerRef.current?.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        // Process the SSE stream
        await processStream(response);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message);
          setStatus("error");
        }
      }
    },
    [sessionId, config.apiEndpoint, processStream],
  );

  /**
   * Stop the current session
   */
  const stop = useCallback(() => {
    abortControllerRef.current?.abort();

    if (sessionId) {
      // Tell server to close session
      fetch(config.apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "stop",
          sessionId,
        }),
      }).catch(() => {});
    }

    setStatus("idle");
  }, [sessionId, config.apiEndpoint]);

  /**
   * Reset the session state
   */
  const reset = useCallback(() => {
    stop();
    setMessages([]);
    setError(null);
    setResult(null);
    setSessionId(null);
    setStatus("idle");
  }, [stop]);

  return {
    messages,
    status,
    error,
    sessionId,
    result,
    start,
    send,
    stop,
    reset,
  };
}
