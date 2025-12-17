/**
 * Setup Discovery Component
 *
 * Interactive setup discovery using Claude to explore a repository
 * and create setup documentation and scripts.
 */

"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { InteractiveSession, type QuickAction } from "@/components/ui/interactive-session";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { SessionMessage, SessionStatus } from "@/hooks/use-interactive-session";

interface SetupDiscoveryProps {
  owner: string;
  repo: string;
  onComplete?: (files: { setupMd: string; setupSh: string }) => void;
  onCancel?: () => void;
}

type Phase = "idle" | "discovering" | "review" | "error";

/**
 * Parse setup.md and setup.sh from Claude's response
 */
function parseSetupFiles(text: string): { setupMd: string; setupSh: string } | null {
  const setupMdMatch = text.match(/```setup\.md\s*\n([\s\S]*?)\n```/i);
  const setupShMatch = text.match(/```setup\.sh\s*\n([\s\S]*?)\n```/i);

  if (!setupMdMatch || !setupShMatch) {
    return null;
  }

  return {
    setupMd: setupMdMatch[1].trim(),
    setupSh: setupShMatch[1].trim(),
  };
}

export function SetupDiscovery({
  owner,
  repo,
  onComplete,
  onCancel,
}: SetupDiscoveryProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [initialGuidance, setInitialGuidance] = useState("");
  const [setupMd, setSetupMd] = useState("");
  const [setupSh, setSetupSh] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<{ label: string; url: string } | null>(null);

  // Session state
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cost, setCost] = useState<{ totalUsd: number; inputTokens: number; outputTokens: number } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const currentAssistantContentRef = useRef<string>("");

  const apiEndpoint = `/api/repos/${owner}/${repo}/setup`;

  /**
   * Process SSE stream from setup API
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
   * Handle individual stream events
   */
  const handleStreamEvent = useCallback((event: any) => {
    switch (event.type) {
      case "session_created":
        setSessionId(event.sessionId);
        setStatus("streaming");
        break;

      case "init":
        // Session initialized
        break;

      case "assistant": {
        const { text, toolUses, partial } = event.content || {};

        if (partial && text) {
          // Accumulate partial text
          currentAssistantContentRef.current += text;

          setMessages((prev) => {
            const existingIdx = prev.findIndex(
              (m) => m.role === "assistant" && m.isPartial,
            );

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
                id: event.messageId || `assistant_${Date.now()}`,
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

      case "result": {
        // A turn completed, but session may still be open
        const { cost: resultCost } = event.content || {};
        if (resultCost) {
          setCost(resultCost);
        }

        // Check if we got the setup files in the last message
        const lastAssistant = messages.filter((m) => m.role === "assistant").pop();
        if (lastAssistant) {
          const files = parseSetupFiles(lastAssistant.content);
          if (files) {
            setSetupMd(files.setupMd);
            setSetupSh(files.setupSh);
          }
        }
        break;
      }

      case "turn_complete":
        // Turn is done, we're waiting for user input or completion
        setStatus("waiting");

        // Check for setup files in all messages
        const allContent = messages
          .filter((m) => m.role === "assistant")
          .map((m) => m.content)
          .join("\n\n");
        const files = parseSetupFiles(allContent);
        if (files) {
          setSetupMd(files.setupMd);
          setSetupSh(files.setupSh);
          setPhase("review");
        }
        break;

      case "error":
        setSetupError(event.content?.message || event.error || "Unknown error");
        setStatus("error");
        setPhase("error");
        break;
    }
  }, [messages]);

  /**
   * Start discovery
   */
  const startDiscovery = async () => {
    setPhase("discovering");
    setMessages([]);
    setSetupError(null);
    setActionInfo(null);
    setCost(null);
    currentAssistantContentRef.current = "";

    abortControllerRef.current = new AbortController();
    setStatus("connecting");

    try {
      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          guidance: initialGuidance.trim() || undefined,
          force: true, // Always force for now to allow re-runs
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Check for actionable errors (GitHub App not installed, etc.)
        if (errorData.actionUrl) {
          setActionInfo({ label: errorData.action, url: errorData.actionUrl });
          setSetupError(errorData.message || errorData.error);
          setPhase("error");
          return;
        }

        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      // Add user message for initial prompt
      setMessages([
        {
          id: `user_${Date.now()}`,
          role: "user",
          content: initialGuidance.trim()
            ? `Explore ${owner}/${repo} and create setup docs.\n\nGuidance: ${initialGuidance.trim()}`
            : `Explore ${owner}/${repo} and create setup docs.`,
          timestamp: new Date(),
        },
      ]);

      await processStream(response);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setStatus("idle");
        setPhase("idle");
      } else {
        setSetupError((err as Error).message);
        setStatus("error");
        setPhase("error");
      }
    }
  };

  /**
   * Send a message to the session
   */
  const sendMessage = async (content: string) => {
    if (!sessionId || !content.trim()) return;

    // Add user message immediately
    setMessages((prev) => [
      ...prev,
      {
        id: `user_${Date.now()}`,
        role: "user",
        content: content.trim(),
        timestamp: new Date(),
      },
    ]);

    currentAssistantContentRef.current = "";
    setStatus("streaming");

    try {
      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          sessionId,
          message: content.trim(),
        }),
        signal: abortControllerRef.current?.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      await processStream(response);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setSetupError((err as Error).message);
        setStatus("error");
      }
    }
  };

  /**
   * Stop the session
   */
  const stopSession = () => {
    abortControllerRef.current?.abort();

    if (sessionId) {
      fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "stop",
          sessionId,
        }),
      }).catch(() => {});
    }

    setStatus("idle");
  };

  const handleApprove = () => {
    stopSession();
    if (onComplete) {
      onComplete({ setupMd, setupSh });
    }
  };

  const handleRerun = () => {
    stopSession();
    setMessages([]);
    setSetupMd("");
    setSetupSh("");
    setSessionId(null);
    setCost(null);
    setPhase("idle");
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sessionId) {
        fetch(apiEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "stop", sessionId }),
        }).catch(() => {});
      }
    };
  }, [sessionId, apiEndpoint]);

  // Quick actions for common guidance
  const quickActions: QuickAction[] = [
    {
      label: "Check Makefile",
      message: "Check if there's a Makefile and what targets it has",
    },
    {
      label: "Check CI config",
      message: "Look at the CI/CD configuration to understand how tests are run",
    },
    {
      label: "Focus on tests",
      message: "What's the best way to run tests? Show me the test commands.",
    },
    {
      label: "Generate files now",
      message: "I think you have enough info. Please generate the setup.md and setup.sh files now.",
    },
  ];

  // Idle state - show start form
  if (phase === "idle") {
    return (
      <div className="space-y-4">
        <div className="border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2">Setup Discovery</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Claude will explore{" "}
            <code className="font-mono bg-muted px-1 py-0.5 rounded">
              {owner}/{repo}
            </code>{" "}
            and create setup documentation and automation scripts.
          </p>
          <p className="text-sm text-muted-foreground mb-4">This process will:</p>
          <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 mb-4">
            <li>Clone and analyze the repository</li>
            <li>Identify build and test commands</li>
            <li>Create SETUP.md documentation</li>
            <li>Generate setup.sh automation script</li>
          </ul>

          <div className="mb-4">
            <Label htmlFor="guidance" className="text-sm text-muted-foreground">
              Optional guidance (e.g., "tests are in __tests__ folder", "use pnpm")
            </Label>
            <Textarea
              id="guidance"
              value={initialGuidance}
              onChange={(e) => setInitialGuidance(e.target.value)}
              placeholder="Any hints about this repo's setup..."
              className="mt-1 min-h-[60px] text-sm"
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={startDiscovery}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Start Discovery
            </Button>
            {onCancel && (
              <Button onClick={onCancel} variant="outline">
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Discovering phase - show interactive session
  if (phase === "discovering") {
    return (
      <div className="space-y-4">
        <div className="border border-orange-500/30 rounded-lg p-4 h-[500px] flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <span className="animate-pulse">🔍</span>
              Exploring Repository
            </h3>
            <Button variant="outline" size="sm" onClick={stopSession}>
              Stop
            </Button>
          </div>

          <InteractiveSession
            messages={messages}
            status={status}
            error={setupError}
            onSend={sendMessage}
            onStop={stopSession}
            placeholder="Provide guidance or ask questions..."
            showToolUse={true}
            quickActions={quickActions}
            variant="orange"
            assistantLabel="Claude"
            className="flex-1 min-h-0"
          />
        </div>
      </div>
    );
  }

  // Error phase
  if (phase === "error") {
    return (
      <div className="space-y-4">
        <div
          className={`border rounded-lg p-4 ${
            actionInfo
              ? "border-yellow-500 bg-yellow-950/30"
              : "border-red-500 bg-red-950/30"
          }`}
        >
          <h3
            className={`text-lg font-semibold mb-2 ${
              actionInfo ? "text-yellow-400" : "text-red-400"
            }`}
          >
            {actionInfo ? "Action Required" : "Discovery Failed"}
          </h3>
          <p
            className={`text-sm mb-4 ${
              actionInfo ? "text-yellow-200" : "text-red-300"
            }`}
          >
            {setupError}
          </p>
          <div className="flex gap-2">
            {actionInfo ? (
              <Button asChild className="bg-yellow-600 hover:bg-yellow-700">
                <a href={actionInfo.url} target="_blank" rel="noopener noreferrer">
                  {actionInfo.label} →
                </a>
              </Button>
            ) : (
              <Button onClick={handleRerun} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            )}
            {onCancel && (
              <Button onClick={onCancel} variant="outline">
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Review phase - show editable files
  return (
    <div className="space-y-4">
      <div className="border border-green-500 bg-green-950/30 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-2 text-green-400">
          ✓ Discovery Complete
        </h3>
        <p className="text-sm text-green-300">
          Setup files have been generated. Review and edit them below before
          approving.
        </p>
        {cost && (
          <p className="text-xs text-muted-foreground mt-2">
            Cost: ${cost.totalUsd.toFixed(4)} (
            {cost.inputTokens.toLocaleString()} input,{" "}
            {cost.outputTokens.toLocaleString()} output tokens)
          </p>
        )}
      </div>

      <Tabs defaultValue="setupMd" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="setupMd">SETUP.md</TabsTrigger>
          <TabsTrigger value="setupSh">setup.sh</TabsTrigger>
        </TabsList>

        <TabsContent value="setupMd" className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="setupMd">Setup Documentation</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing ? "Lock" : "Edit"}
            </Button>
          </div>
          <Textarea
            id="setupMd"
            value={setupMd}
            onChange={(e) => setSetupMd(e.target.value)}
            readOnly={!isEditing}
            className="font-mono text-sm min-h-[400px]"
          />
        </TabsContent>

        <TabsContent value="setupSh" className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="setupSh">Setup Script</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing ? "Lock" : "Edit"}
            </Button>
          </div>
          <Textarea
            id="setupSh"
            value={setupSh}
            onChange={(e) => setSetupSh(e.target.value)}
            readOnly={!isEditing}
            className="font-mono text-sm min-h-[400px]"
          />
        </TabsContent>
      </Tabs>

      <div className="flex gap-2">
        <Button onClick={handleApprove} className="bg-green-600 hover:bg-green-700">
          Approve & Save
        </Button>
        <Button onClick={handleRerun} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Re-run Discovery
        </Button>
        {onCancel && (
          <Button onClick={onCancel} variant="outline">
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
