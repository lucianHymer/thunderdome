/**
 * Consul Dialog Component
 *
 * Interactive modal for conversing with the Consul about the trial verdict
 * and executing decree actions.
 */

"use client";

import { GitMerge, GitPullRequest, Loader2, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Markdown } from "@/components/ui/markdown";
import { ScrollableContainer } from "@/components/ui/scrollable-container";
import { Textarea } from "@/components/ui/textarea";

interface Verdict {
  summary: string;
  winnerGladiatorId: string | null;
  reasoning: string;
}

interface ConsulDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trialId: string;
  verdict: Verdict;
}

interface Message {
  role: "user" | "consul";
  content: string;
}

export function ConsulDialog({ open, onOpenChange, trialId, verdict }: ConsulDialogProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const initializeConversation = async () => {
    setIsStreaming(true);

    try {
      const response = await fetch(`/api/trials/${trialId}/consul`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "__INIT__", // Special message to trigger greeting
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to initialize conversation");
      }

      await streamResponse(response);
    } catch (_error) {
      setMessages([
        {
          role: "consul",
          content:
            "Salutations. I am the Consul, ready to assist with decree actions. How may I help you today?",
        },
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  const streamResponse = async (response: Response) => {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error("No response body");
    }

    let accumulatedContent = "";

    // Add placeholder message for streaming and get the actual index
    let placeholderIndex = -1;
    setMessages((prev) => {
      placeholderIndex = prev.length;
      return [...prev, { role: "consul", content: "" }];
    });

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "content") {
                accumulatedContent += parsed.text;
                // Update the placeholder message at the correct index
                setMessages((prev) => {
                  const newMessages = [...prev];
                  // Use the last consul message if index is somehow wrong
                  const idx = placeholderIndex >= 0 && placeholderIndex < prev.length
                    ? placeholderIndex
                    : prev.length - 1;
                  newMessages[idx] = {
                    role: "consul",
                    content: accumulatedContent,
                  };
                  return newMessages;
                });
              }
            } catch (_e) {
              // Ignore parse errors
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  };

  // Initialize conversation when dialog opens
  useEffect(() => {
    if (open && !initialized) {
      initializeConversation();
      setInitialized(true);
    }
  }, [open, initialized]);

  const sendMessage = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsStreaming(true);

    try {
      const response = await fetch(`/api/trials/${trialId}/consul`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage,
          history: messages,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      await streamResponse(response);
    } catch (_error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "consul",
          content: "My apologies, I encountered an error. Please try again.",
        },
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleQuickAction = (action: string) => {
    setInput(action);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  // Auto-resize textarea
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + "px";
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col gap-4 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">⚖️</span>
            <span>Consul</span>
          </DialogTitle>
          <DialogDescription>Discuss the verdict and execute decree actions</DialogDescription>
        </DialogHeader>

        {/* Verdict Summary */}
        <div className="bg-purple-950/30 border border-purple-500/30 rounded-lg p-3 text-sm text-foreground">
          <strong className="text-purple-400">Verdict:</strong>{" "}
          {verdict.summary.split(/\n\n##/)[0].trim()}
        </div>

        {/* Messages */}
        <ScrollableContainer scrollTrigger={messages} className="flex-1 pr-2">
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.role === "user" ? "bg-blue-600 text-white" : "bg-muted/50 text-foreground"
                  }`}
                >
                  {message.role === "consul" && (
                    <Badge variant="outline" className="mb-2 text-purple-400 border-purple-500/50">
                      Consul
                    </Badge>
                  )}
                  <div className="text-sm">
                    {message.role === "consul" ? (
                      <Markdown>{message.content}</Markdown>
                    ) : (
                      <span className="whitespace-pre-wrap">{message.content}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {isStreaming && messages[messages.length - 1]?.role !== "consul" && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg p-3">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollableContainer>

        {/* Quick Actions */}
        {!isStreaming && messages.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleQuickAction("Merge the winner's changes")}
            >
              <GitMerge className="h-3 w-3 mr-1" />
              Merge Winner
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleQuickAction("Create a PR with the winner's changes")}
            >
              <GitPullRequest className="h-3 w-3 mr-1" />
              Create PR
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleQuickAction("Synthesize the best elements from both gladiators")}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              Synthesize
            </Button>
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2 pt-2 border-t border-border items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the Consul for guidance..."
            disabled={isStreaming}
            className="flex-1 min-h-[40px] max-h-[150px] resize-none"
            rows={1}
          />
          <Button onClick={sendMessage} disabled={!input.trim() || isStreaming} size="icon" className="shrink-0">
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
