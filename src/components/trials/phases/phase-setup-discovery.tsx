/**
 * Phase Setup Discovery Component
 *
 * Interactive setup discovery using the shared InteractiveSession component.
 * Same pattern as the old setup-discovery.tsx - parses structured events.
 */

"use client";

import { Check, FileCode, FileText, Terminal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InteractiveSession, type QuickAction } from "@/components/ui/interactive-session";
import type { SessionMessage, SessionStatus } from "@/hooks/use-interactive-session";
import type { PhaseState } from "@/hooks/use-trial-phases";

interface PhaseSetupDiscoveryProps {
  trialId: string;
  state: PhaseState;
}

interface ToolUse {
  id: string;
  name: string;
  input: unknown;
}

/**
 * Custom message renderer for Setup Discovery style
 */
function SetupMessage({ message }: { message: SessionMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg p-3 ${
          isUser ? "bg-cyan-600 text-white" : "bg-muted/50 text-foreground"
        }`}
      >
        {!isUser && (
          <Badge variant="outline" className="mb-2 text-cyan-400 border-cyan-500/50">
            Claude
          </Badge>
        )}
        <div className="text-sm whitespace-pre-wrap">{message.content}</div>
      </div>
    </div>
  );
}

export function PhaseSetupDiscovery({ trialId, state }: PhaseSetupDiscoveryProps) {
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isFinalized, setIsFinalized] = useState(false);

  const initRef = useRef(false);
  const currentAssistantContentRef = useRef("");
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Process SSE stream - same pattern as old setup-discovery
   */
  const processStream = useCallback(async (response: Response) => {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error("No response body");
    }

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
            const event = JSON.parse(data);
            handleStreamEvent(event);
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
   * Handle individual stream events - same as old setup-discovery
   */
  const handleStreamEvent = useCallback((event: { type: string; content?: { text?: string; toolUses?: ToolUse[]; partial?: boolean }; data?: { tool?: string }; toolUses?: ToolUse[] }) => {
    switch (event.type) {
      case "assistant": {
        const { text, toolUses, partial } = event.content || {};

        if (partial && text) {
          // Accumulate partial text
          currentAssistantContentRef.current += text;

          setMessages((prev) => {
            const existingIdx = prev.findIndex((m) => m.role === "assistant" && m.isPartial);

            if (existingIdx >= 0) {
              const updated = [...prev];
              updated[existingIdx] = {
                ...updated[existingIdx],
                content: currentAssistantContentRef.current,
              };
              return updated;
            } else {
              return [
                ...prev,
                {
                  id: `assistant_${Date.now()}`,
                  role: "assistant",
                  content: currentAssistantContentRef.current,
                  isPartial: true,
                  timestamp: new Date(),
                },
              ];
            }
          });
        } else if (text || toolUses?.length) {
          // Complete assistant message
          currentAssistantContentRef.current = "";

          setMessages((prev) => {
            const filtered = prev.filter((m) => !m.isPartial);
            return [
              ...filtered,
              {
                id: `assistant_${Date.now()}`,
                role: "assistant",
                content: text || "",
                toolUses,
                isPartial: false,
                timestamp: new Date(),
              },
            ];
          });
        }
        break;
      }

      case "tool_use": {
        // Tool use event - could show in UI if needed
        break;
      }

      case "turn_complete": {
        // Turn is done, finalize the last message
        setStatus("waiting");

        // Finalize partial message if exists
        setMessages((prev) => {
          const lastIdx = prev.findIndex((m) => m.isPartial);
          if (lastIdx >= 0) {
            const updated = [...prev];
            updated[lastIdx] = {
              ...updated[lastIdx],
              isPartial: false,
              toolUses: event.toolUses,
            };
            return updated;
          }
          return prev;
        });
        break;
      }

      case "error":
        setError((event as { message?: string }).message || "Unknown error");
        setStatus("error");
        break;
    }
  }, []);

  /**
   * Initialize conversation
   */
  const initializeConversation = useCallback(async () => {
    if (initRef.current) return;
    initRef.current = true;

    setStatus("streaming");
    currentAssistantContentRef.current = "";
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`/api/trials/${trialId}/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "__INIT__" }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to initialize setup discovery");
      }

      await processStream(response);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setStatus("idle");
      } else {
        setError(err instanceof Error ? err.message : "Failed to connect");
        setStatus("error");
      }
    }
  }, [trialId, processStream]);

  /**
   * Send a message
   */
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || status === "streaming") return;

    // Add user message
    const userMessage: SessionMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content: content.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setStatus("streaming");
    setError(null);
    currentAssistantContentRef.current = "";

    try {
      // Build history from messages
      const history = messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const response = await fetch(`/api/trials/${trialId}/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content.trim(),
          history,
        }),
        signal: abortControllerRef.current?.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to send message");
      }

      await processStream(response);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Failed to get response");
        setStatus("error");
      }
    }
  }, [trialId, messages, status, processStream]);

  /**
   * Finalize setup - extract and commit files
   */
  const handleFinalize = useCallback(async () => {
    setStatus("streaming");
    setError(null);

    try {
      const history = messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const response = await fetch(`/api/trials/${trialId}/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "__FINALIZE__",
          history,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to finalize setup");
      }

      const result = await response.json();
      if (result.success) {
        setIsFinalized(true);
        setStatus("complete");
      } else {
        throw new Error(result.error || "Failed to finalize setup");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to finalize");
      setStatus("error");
    }
  }, [trialId, messages]);

  /**
   * Stop streaming
   */
  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
    setStatus("waiting");
  }, []);

  // Initialize when state becomes active
  useEffect(() => {
    if (state === "active" && !initRef.current) {
      initializeConversation();
    }
  }, [state, initializeConversation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Quick actions
  const quickActions: QuickAction[] = [
    {
      label: "Check Makefile",
      message: "Check if there's a Makefile and what targets it has",
      icon: <FileCode className="h-3 w-3" />,
    },
    {
      label: "Check CI",
      message: "Look at the CI/CD configuration to understand how tests are run",
      icon: <Terminal className="h-3 w-3" />,
    },
    {
      label: "Generate Files",
      message: "Please generate the setup.md and setup.sh files now based on what you've learned",
      icon: <FileText className="h-3 w-3" />,
    },
  ];

  if (state === "pending") {
    return <div className="text-muted-foreground text-sm">Waiting for repository setup...</div>;
  }

  if (state === "complete" || isFinalized) {
    return (
      <div className="flex items-center gap-2 text-green-400">
        <Check className="h-4 w-4" />
        <span className="text-sm font-medium">Setup files committed to repository</span>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="space-y-2">
        <div className="text-red-400 text-sm font-medium">Setup discovery failed</div>
        {error && (
          <div className="bg-red-950/30 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>
    );
  }

  // Active state
  return (
    <div className="space-y-4">
      {/* Info header */}
      <div className="bg-cyan-950/20 border border-cyan-500/20 rounded-lg p-3">
        <p className="text-sm text-muted-foreground">
          Claude is exploring your repository to create setup scripts. Guide the discovery or let it explore.
        </p>
      </div>

      {/* Interactive Session */}
      <InteractiveSession
        messages={messages}
        status={status}
        error={error}
        onSend={sendMessage}
        onStop={handleStop}
        placeholder="Guide the setup discovery..."
        variant="orange"
        assistantLabel="Claude"
        quickActions={quickActions}
        showToolUse
        renderMessage={(message) => <SetupMessage key={message.id} message={message} />}
        className="h-[400px]"
      />

      {/* Finalize Button */}
      {messages.length > 0 && status === "waiting" && (
        <Button
          onClick={handleFinalize}
          className="w-full bg-green-600 hover:bg-green-700"
        >
          <Check className="h-4 w-4 mr-2" />
          Finalize Setup
        </Button>
      )}
    </div>
  );
}
