/**
 * Setup Discovery Component
 *
 * Runs setup discovery with streaming output, allows editing files before approval
 */

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollableContainer } from "@/components/ui/scrollable-container";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

interface SetupDiscoveryProps {
  owner: string;
  repo: string;
  onComplete?: (files: { setupMd: string; setupSh: string }) => void;
  onCancel?: () => void;
}

interface StreamMessage {
  type: "start" | "stream" | "complete" | "error";
  data: any;
}

type DiscoveryStatus = "idle" | "running" | "complete" | "error";

export function SetupDiscovery({
  owner,
  repo,
  onComplete,
  onCancel,
}: SetupDiscoveryProps) {
  const [status, setStatus] = useState<DiscoveryStatus>("idle");
  const [streamLog, setStreamLog] = useState<string[]>([]);
  const [setupMd, setSetupMd] = useState("");
  const [setupSh, setSetupSh] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<{ label: string; url: string } | null>(null);
  const [cost, setCost] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);

  const startDiscovery = async () => {
    setStatus("running");
    setStreamLog([]);
    setError(null);
    setActionInfo(null);
    setSetupMd("");
    setSetupSh("");
    setCost(null);

    try {
      // Use POST endpoint with streaming - API auto-clones the repo
      const response = await fetch(`/api/repos/${owner}/${repo}/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const data = await response.json();
        // Check if there's an actionable error (GitHub App not installed/repo not connected)
        if (data.actionUrl) {
          setStatus("error");
          setError(data.message || data.error);
          // Store action info for the error UI
          setActionInfo({ label: data.action, url: data.actionUrl });
          return;
        }
        throw new Error(data.error || "Failed to start setup discovery");
      }

      // Read SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            try {
              const message: StreamMessage = JSON.parse(data);
              handleStreamMessage(message);
            } catch (_e) {}
          }
        }
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unknown error");
      addLog(`ERROR: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const handleStreamMessage = (message: StreamMessage) => {
    switch (message.type) {
      case "start":
        addLog(`Starting discovery for ${message.data.repoUrl}...`);
        break;

      case "stream": {
        // Handle different stream event types
        const event = message.data;
        if (event.type === "assistant") {
          addLog(`Agent: ${event.content}`);
        } else if (event.type === "thinking") {
          // Add thinking events to log
          if (event.content?.type === "text") {
            addLog(`[Thinking] ${event.content.text}`);
          }
        }
        break;
      }

      case "complete":
        setStatus("complete");
        setSetupMd(message.data.files.setupMd);
        setSetupSh(message.data.files.setupSh);
        setCost(message.data.cost);
        addLog("✓ Discovery complete!");
        if (message.data.cost) {
          addLog(
            `Cost: $${message.data.cost.totalUsd.toFixed(4)} (${message.data.cost.inputTokens} in, ${message.data.cost.outputTokens} out)`,
          );
        }
        break;

      case "error":
        setStatus("error");
        setError(message.data.error);
        addLog(`ERROR: ${message.data.error}`);
        break;
    }
  };

  const addLog = (message: string) => {
    setStreamLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const handleApprove = () => {
    if (onComplete) {
      onComplete({ setupMd, setupSh });
    }
  };

  const handleRerun = () => {
    setIsEditing(false);
    startDiscovery();
  };

  if (status === "idle") {
    return (
      <div className="space-y-4">
        <div className="border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2">Setup Discovery</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Claude will explore{" "}
            <code className="font-mono bg-muted px-1 py-0.5 rounded">{owner}/{repo}</code>{" "}
            and create setup documentation and automation scripts.
          </p>
          <p className="text-sm text-muted-foreground mb-4">This process will:</p>
          <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 mb-6">
            <li>Clone and analyze the repository</li>
            <li>Identify build and test commands</li>
            <li>Create SETUP.md documentation</li>
            <li>Generate setup.sh automation script</li>
          </ul>
          <div className="flex gap-2">
            <Button onClick={startDiscovery} className="bg-orange-600 hover:bg-orange-700">
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

  if (status === "running") {
    return (
      <div className="space-y-4">
        <div className="border border-border rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <span className="animate-pulse">🔍</span>
            Exploring Repository...
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Claude is analyzing the repository and creating setup files.
          </p>
          <ScrollableContainer
            scrollTrigger={streamLog}
            className="bg-black/50 rounded-lg p-4 font-mono text-xs h-[400px] space-y-1"
          >
            {streamLog.map((log, index) => (
              <div key={index} className="text-gray-300">
                {log}
              </div>
            ))}
          </ScrollableContainer>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="space-y-4">
        <div className={`border rounded-lg p-4 ${actionInfo ? "border-yellow-500 bg-yellow-950/30" : "border-red-500 bg-red-950/30"}`}>
          <h3 className={`text-lg font-semibold mb-2 ${actionInfo ? "text-yellow-400" : "text-red-400"}`}>
            {actionInfo ? "Action Required" : "Discovery Failed"}
          </h3>
          <p className={`text-sm mb-4 ${actionInfo ? "text-yellow-200" : "text-red-300"}`}>{error}</p>
          <div className="flex gap-2">
            {actionInfo ? (
              <Button
                asChild
                className="bg-yellow-600 hover:bg-yellow-700"
              >
                <a href={actionInfo.url} target="_blank" rel="noopener noreferrer">
                  {actionInfo.label} →
                </a>
              </Button>
            ) : (
              <Button onClick={handleRerun} variant="outline">
                Try Again
              </Button>
            )}
            {onCancel && (
              <Button onClick={onCancel} variant="outline">
                Cancel
              </Button>
            )}
          </div>
          {actionInfo && (
            <p className="text-xs text-muted-foreground mt-3">
              After updating your GitHub App settings, come back and try again.
            </p>
          )}
        </div>
        {streamLog.length > 0 && (
          <div className="border border-border rounded-lg p-4">
            <h4 className="text-sm font-semibold mb-2">Discovery Log</h4>
            <ScrollableContainer
              scrollTrigger={streamLog}
              className="bg-black/50 rounded-lg p-4 font-mono text-xs max-h-[200px] space-y-1"
            >
              {streamLog.map((log, index) => (
                <div key={index} className="text-gray-300">
                  {log}
                </div>
              ))}
            </ScrollableContainer>
          </div>
        )}
      </div>
    );
  }

  // status === 'complete'
  return (
    <div className="space-y-4">
      <div className="border border-green-500 bg-green-950/30 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-2 text-green-400">✓ Discovery Complete</h3>
        <p className="text-sm text-green-300">
          Setup files have been generated. Review and edit them below before approving.
        </p>
        {cost && (
          <p className="text-xs text-muted-foreground mt-2">
            Cost: ${cost.totalUsd.toFixed(4)} ({cost.inputTokens.toLocaleString()} input,{" "}
            {cost.outputTokens.toLocaleString()} output tokens)
          </p>
        )}
      </div>

      <Tabs defaultValue="setupMd" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="setupMd">SETUP.md</TabsTrigger>
          <TabsTrigger value="setupSh">setup.sh</TabsTrigger>
          <TabsTrigger value="log">Discovery Log</TabsTrigger>
        </TabsList>

        <TabsContent value="setupMd" className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="setupMd">Setup Documentation</Label>
            <Button variant="outline" size="sm" onClick={() => setIsEditing(!isEditing)}>
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
            <Button variant="outline" size="sm" onClick={() => setIsEditing(!isEditing)}>
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

        <TabsContent value="log">
          <ScrollableContainer
            scrollTrigger={streamLog}
            className="bg-black/50 rounded-lg p-4 font-mono text-xs max-h-[400px] space-y-1"
          >
            {streamLog.map((log, index) => (
              <div key={index} className="text-gray-300">
                {log}
              </div>
            ))}
          </ScrollableContainer>
        </TabsContent>
      </Tabs>

      <div className="flex gap-2">
        <Button onClick={handleApprove} className="bg-green-600 hover:bg-green-700">
          Approve & Save
        </Button>
        <Button onClick={handleRerun} variant="outline">
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
