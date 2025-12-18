/**
 * Consul Dialog Component
 *
 * Interactive modal for conversing with the Consul about the trial verdict
 * and executing decree actions. Uses the shared InteractiveSession component
 * for consistent UX with other interactive agent features.
 */

"use client";

import { GitMerge, GitPullRequest, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InteractiveSession, type QuickAction } from "@/components/ui/interactive-session";
import type { SessionMessage, SessionStatus } from "@/hooks/use-interactive-session";

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

/**
 * Custom message renderer for Consul style
 */
function ConsulMessage({ message }: { message: SessionMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg p-3 ${
          isUser ? "bg-blue-600 text-white" : "bg-muted/50 text-foreground"
        }`}
      >
        {!isUser && (
          <Badge variant="outline" className="mb-2 text-purple-400 border-purple-500/50">
            Consul
          </Badge>
        )}
        <div className="text-sm whitespace-pre-wrap">{message.content}</div>
      </div>
    </div>
  );
}

export function ConsulDialog({ open, onOpenChange, trialId, verdict }: ConsulDialogProps) {
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  /**
   * Stream response from the consul API
   */
  const streamResponse = async (response: Response): Promise<string> => {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error("No response body");
    }

    let accumulatedContent = "";
    const messageId = `consul_${Date.now()}`;

    // Add placeholder message
    setMessages((prev) => [
      ...prev,
      { id: messageId, role: "assistant", content: "", timestamp: new Date() },
    ]);

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
                // Update the message
                setMessages((prev) =>
                  prev.map((m) => (m.id === messageId ? { ...m, content: accumulatedContent } : m)),
                );
              } else if (parsed.type === "error") {
                throw new Error(parsed.message || "Unknown error");
              }
            } catch (e) {
              if (e instanceof SyntaxError) {
                // Ignore JSON parse errors for partial data
              } else {
                throw e;
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return accumulatedContent;
  };

  /**
   * Initialize conversation with greeting
   */
  const initializeConversation = async () => {
    setStatus("streaming");

    try {
      const response = await fetch(`/api/trials/${trialId}/consul`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "__INIT__" }),
      });

      if (!response.ok) {
        throw new Error("Failed to initialize conversation");
      }

      await streamResponse(response);
      setStatus("waiting");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      setStatus("error");

      // Fallback greeting
      setMessages([
        {
          id: "fallback",
          role: "assistant",
          content:
            "Salutations. I am the Consul, ready to assist with decree actions. How may I help you today?",
          timestamp: new Date(),
        },
      ]);
    }
  };

  /**
   * Send a message to the consul
   */
  const sendMessage = async (content: string) => {
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

    try {
      // Build history from messages (excluding the one we just added)
      const history = messages.map((m) => ({
        role: m.role === "assistant" ? ("consul" as const) : ("user" as const),
        content: m.content,
      }));

      const response = await fetch(`/api/trials/${trialId}/consul`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content.trim(),
          history,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      await streamResponse(response);
      setStatus("waiting");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get response");
      setStatus("error");
    }
  };

  // Initialize conversation when dialog opens
  useEffect(() => {
    if (open && !initialized) {
      initializeConversation();
      setInitialized(true);
    }
  }, [open, initialized]);

  // Quick actions for common decree operations
  const quickActions: QuickAction[] = [
    {
      label: "Merge Winner",
      message: "Merge the winner's changes",
      icon: <GitMerge className="h-3 w-3" />,
    },
    {
      label: "Create PR",
      message: "Create a PR with the winner's changes",
      icon: <GitPullRequest className="h-3 w-3" />,
    },
    {
      label: "Synthesize",
      message: "Synthesize the best elements from both gladiators",
      icon: <Sparkles className="h-3 w-3" />,
    },
  ];

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

        {/* Verdict Summary Header */}
        <div className="shrink-0 bg-purple-950/30 border border-purple-500/30 rounded-lg p-3 text-sm text-foreground">
          <strong className="text-purple-400">Verdict:</strong>{" "}
          {verdict.summary.split(/\n\n##/)[0].trim()}
        </div>

        {/* Interactive Session */}
        <InteractiveSession
          messages={messages}
          status={status}
          error={error}
          onSend={sendMessage}
          placeholder="Ask the Consul for guidance..."
          variant="purple"
          assistantLabel="Consul"
          quickActions={quickActions}
          renderMessage={(message) => <ConsulMessage key={message.id} message={message} />}
          className="flex-1 min-h-0"
        />
      </DialogContent>
    </Dialog>
  );
}
