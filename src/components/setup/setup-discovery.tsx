/**
 * Setup Discovery Component
 *
 * Interactive setup discovery using Claude to explore a repository
 * and create setup documentation and scripts.
 */

"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { InteractiveSession, type QuickAction } from "@/components/ui/interactive-session";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useInteractiveSession, type SessionMessage } from "@/hooks/use-interactive-session";
import { SETUP_DISCOVERY_SYSTEM_PROMPT } from "@/lib/setup/prompts";

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

  const session = useInteractiveSession({
    apiEndpoint: "/api/agent/session",
    systemPrompt: SETUP_DISCOVERY_SYSTEM_PROMPT,
    model: "opus",
    allowedTools: ["Read", "Glob", "Grep", "Bash"],
    permissionMode: "bypassPermissions",
  });

  // Watch for completion and parse results
  useEffect(() => {
    if (session.result && session.status === "complete") {
      // Try to parse setup files from the result
      const lastAssistantMessage = session.messages
        .filter((m) => m.role === "assistant")
        .pop();

      if (lastAssistantMessage) {
        const files = parseSetupFiles(lastAssistantMessage.content);
        if (files) {
          setSetupMd(files.setupMd);
          setSetupSh(files.setupSh);
          setPhase("review");
        } else {
          setSetupError("Could not parse setup files from response. The agent may not have finished properly.");
          setPhase("error");
        }
      }
    }
  }, [session.result, session.status, session.messages]);

  // Watch for errors
  useEffect(() => {
    if (session.error) {
      setSetupError(session.error);
      setPhase("error");
    }
  }, [session.error]);

  const startDiscovery = async () => {
    setPhase("discovering");
    setSetupError(null);
    setActionInfo(null);

    const repoUrl = `https://github.com/${owner}/${repo}`;

    let prompt = `Explore this repository and create setup documentation.

# REPOSITORY

URL: ${repoUrl}
Repository: ${owner}/${repo}

# YOUR TASK

1. Explore the repository thoroughly
2. Figure out how to build and test it
3. Create comprehensive SETUP.md documentation
4. Create an automated setup.sh script

As you explore, if you're uncertain about anything important (e.g., which test command to use, what environment setup is needed, ambiguous configuration), feel free to ask me for clarification rather than guessing.

When you're confident you understand the setup, output both files in the exact format specified in your system prompt:

\`\`\`setup.md
[content]
\`\`\`

\`\`\`setup.sh
[content]
\`\`\``;

    if (initialGuidance.trim()) {
      prompt += `\n\n# GUIDANCE FROM USER\n${initialGuidance.trim()}`;
    }

    await session.start(prompt);
  };

  const handleApprove = () => {
    if (onComplete) {
      onComplete({ setupMd, setupSh });
    }
  };

  const handleRerun = () => {
    session.reset();
    setSetupMd("");
    setSetupSh("");
    setPhase("idle");
  };

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
            <li>Analyze the repository structure</li>
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
            <Button variant="outline" size="sm" onClick={() => session.stop()}>
              Stop
            </Button>
          </div>

          <InteractiveSession
            messages={session.messages}
            status={session.status}
            error={session.error}
            onSend={session.send}
            onStop={session.stop}
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
        {session.result?.cost && (
          <p className="text-xs text-muted-foreground mt-2">
            Cost: ${session.result.cost.totalUsd.toFixed(4)} (
            {session.result.cost.inputTokens.toLocaleString()} input,{" "}
            {session.result.cost.outputTokens.toLocaleString()} output tokens)
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
