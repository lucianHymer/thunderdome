/**
 * Phase Setup Discovery Component
 *
 * Displays the Setup Discovery phase where Claude explores the repository
 * and determines what setup is needed.
 */

"use client";

import { Check, Loader2, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PhaseState } from "@/hooks/use-trial-phases";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { ScrollableContainer } from "@/components/ui/scrollable-container";
import { Textarea } from "@/components/ui/textarea";
import { ThinkingIndicator } from "../timeline-phase";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface PhaseSetupDiscoveryProps {
  trialId: string;
  state: PhaseState;
}

export function PhaseSetupDiscovery({ trialId, state }: PhaseSetupDiscoveryProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isFinalized, setIsFinalized] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentAssistantMessageRef = useRef<string>("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasInitialized = useRef(false);

  // Auto-initialize when state becomes active
  useEffect(() => {
    if (state === "active" && !hasInitialized.current && messages.length === 0) {
      hasInitialized.current = true;
      void handleInit();
    }
  }, [state]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + "px";
    }
  }, [input]);

  /**
   * Send a message to the setup discovery endpoint
   */
  const sendMessage = useCallback(
    async (message: string, history: Message[] = []) => {
      setIsStreaming(true);
      setError(null);
      currentAssistantMessageRef.current = "";

      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch(`/api/trials/${trialId}/setup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            history: history.map((m) => ({ role: m.role, content: m.content })),
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        // Process SSE stream
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
                const parsed = JSON.parse(data);

                // Handle text chunks
                if (parsed.text) {
                  currentAssistantMessageRef.current += parsed.text;

                  // Update or create assistant message
                  setMessages((prev) => {
                    const lastMsg = prev[prev.length - 1];
                    if (lastMsg && lastMsg.role === "assistant" && !lastMsg.content.endsWith("\n\n")) {
                      // Update existing partial message
                      return prev.map((msg, idx) =>
                        idx === prev.length - 1
                          ? { ...msg, content: currentAssistantMessageRef.current }
                          : msg,
                      );
                    } else {
                      // Create new assistant message
                      return [
                        ...prev,
                        {
                          id: `assistant_${Date.now()}`,
                          role: "assistant" as const,
                          content: currentAssistantMessageRef.current,
                          timestamp: new Date(),
                        },
                      ];
                    }
                  });
                }

                // Handle errors
                if (parsed.type === "error") {
                  throw new Error(parsed.message || "Unknown error");
                }
              } catch (parseError) {
                // Ignore parse errors for partial data
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message);
        }
      } finally {
        setIsStreaming(false);
      }
    },
    [trialId],
  );

  /**
   * Initialize the session
   */
  const handleInit = useCallback(async () => {
    await sendMessage("__INIT__", []);
  }, [sendMessage]);

  /**
   * Send user message
   */
  const handleSendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: Message = {
      id: `user_${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    await sendMessage(userMessage.content, messages);
  }, [input, isStreaming, messages, sendMessage]);

  /**
   * Finalize setup
   */
  const handleFinalize = useCallback(async () => {
    setIsStreaming(true);
    setError(null);

    try {
      const response = await fetch(`/api/trials/${trialId}/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "__FINALIZE__",
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      if (result.success) {
        setIsFinalized(true);
      } else {
        throw new Error(result.error || "Failed to finalize setup");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsStreaming(false);
    }
  }, [trialId, messages]);

  /**
   * Handle keyboard shortcuts
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSendMessage();
      }
    },
    [handleSendMessage],
  );

  if (state === "pending") {
    return <div className="text-muted-foreground text-sm">Waiting for repository setup...</div>;
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

  if (state === "complete" || isFinalized) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-green-400">
          <Check className="h-4 w-4" />
          <span className="text-sm font-medium">Setup files committed to repository</span>
        </div>
        {messages.length > 0 && (
          <div className="bg-cyan-950/20 border border-cyan-500/20 rounded-lg p-4">
            <h4 className="text-sm font-medium text-cyan-400 mb-2">Discovery Summary</h4>
            <ScrollableContainer className="max-h-64 pr-2">
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "text-sm",
                      msg.role === "user" ? "text-foreground font-medium" : "text-muted-foreground",
                    )}
                  >
                    <div className="text-xs text-cyan-400 mb-1">
                      {msg.role === "user" ? "You" : "Claude"}
                    </div>
                    {msg.role === "user" ? (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    ) : (
                      <Markdown>{msg.content}</Markdown>
                    )}
                  </div>
                ))}
              </div>
            </ScrollableContainer>
          </div>
        )}
      </div>
    );
  }

  // Active state
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-cyan-950/20 border border-cyan-500/20 rounded-lg p-3">
        <p className="text-sm text-muted-foreground">
          Claude is exploring your repository to determine what setup is needed. You can guide the
          discovery process or let Claude explore on its own.
        </p>
      </div>

      {/* Messages */}
      <div className="border border-cyan-500/30 rounded-lg bg-black/20">
        <ScrollableContainer className="max-h-[400px] p-4">
          <div className="space-y-4">
            {messages.length === 0 && isStreaming && (
              <ThinkingIndicator message="Initializing setup discovery" colorScheme="cyan" />
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg p-3",
                    msg.role === "user"
                      ? "bg-cyan-600 text-white"
                      : "bg-muted/50 text-foreground",
                  )}
                >
                  {msg.role === "assistant" && (
                    <div className="text-xs font-medium mb-1 text-cyan-400">Claude</div>
                  )}
                  <div className="text-sm">
                    {msg.role === "user" ? (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    ) : (
                      <Markdown>{msg.content}</Markdown>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {isStreaming && messages.length > 0 && (
              <div className="flex justify-start">
                <div className="rounded-lg p-3 bg-muted/50">
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                </div>
              </div>
            )}
          </div>
        </ScrollableContainer>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-950/30 border border-red-500/50 rounded-lg p-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Input Area */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Claude about the setup or provide guidance..."
            disabled={isStreaming}
            className={cn(
              "flex-1 min-h-[40px] max-h-[150px] resize-none bg-black/30",
              "border-cyan-500/50 focus:border-cyan-400",
            )}
            rows={1}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!input.trim() || isStreaming}
            size="icon"
            className="shrink-0 bg-cyan-600 hover:bg-cyan-700"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        {/* Finalize Button */}
        {messages.length > 0 && !isStreaming && (
          <Button
            onClick={handleFinalize}
            disabled={isStreaming}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            <Check className="h-4 w-4 mr-2" />
            Finalize Setup
          </Button>
        )}
      </div>
    </div>
  );
}
