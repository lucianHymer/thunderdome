/**
 * Gladiator Panel Component
 *
 * Shows streaming output from a gladiator with proper tool_use rendering.
 * Displays winner badge if applicable.
 */

"use client";

import { useEffect, useRef, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGladiatorStream, type GladiatorStreamEvent } from "@/hooks/use-gladiator-stream";
import { ToolUseCard } from "./cards/tool-use-card";
import { cn } from "@/lib/utils";

interface GladiatorPanelProps {
  gladiator: {
    id: string;
    name: string;
    persona: string;
    status: string;
  };
  isWinner?: boolean;
}

const statusConfig: Record<string, { dot: string; color: string }> = {
  PENDING: { dot: "⏳", color: "text-muted-foreground" },
  RUNNING: { dot: "⚡", color: "text-orange-400" },
  COMPLETED: { dot: "✓", color: "text-green-400" },
  FAILED: { dot: "✕", color: "text-red-400" },
};

/**
 * Represents a segment of output - either text or a tool use
 */
interface OutputSegment {
  type: "text" | "tool_use";
  content: string;
  toolName?: string;
  toolInput?: any;
  toolOutput?: string;
}

/**
 * Parse stream events into renderable segments
 */
function parseEventsToSegments(events: GladiatorStreamEvent[]): OutputSegment[] {
  const segments: OutputSegment[] = [];
  let currentText = "";

  for (const event of events) {
    if (event.type === "text") {
      currentText += event.content;
    } else if (event.type === "tool_use") {
      // Flush accumulated text
      if (currentText.trim()) {
        segments.push({ type: "text", content: currentText });
        currentText = "";
      }
      // Add tool use segment
      segments.push({
        type: "tool_use",
        content: event.content,
        toolName: event.data?.name || event.data?.tool_name || "Unknown Tool",
        toolInput: event.data?.input || event.data,
        toolOutput: event.data?.output,
      });
    }
  }

  // Flush remaining text
  if (currentText.trim()) {
    segments.push({ type: "text", content: currentText });
  }

  return segments;
}

export function GladiatorPanel({ gladiator, isWinner }: GladiatorPanelProps) {
  const stream = useGladiatorStream(gladiator.id);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Parse events into segments
  const segments = useMemo(() => {
    return parseEventsToSegments(stream.events);
  }, [stream.events]);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current;
      // Only auto-scroll if user is near bottom
      const isNearBottom =
        scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < 100;
      if (isNearBottom) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [stream.events]);

  const status = statusConfig[gladiator.status] || statusConfig.PENDING;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={cn("text-lg", status.color)}>{status.dot}</span>
          <h3 className="text-lg font-semibold">{gladiator.name}</h3>
          {isWinner && (
            <Badge className="bg-yellow-500 text-black">👑 Winner</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {stream.isStreaming && (
            <span className="text-sm text-orange-400 animate-pulse flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-orange-400 animate-ping" />
              Streaming
            </span>
          )}
          {stream.events.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {stream.events.filter((e) => e.type === "tool_use").length} tools
            </span>
          )}
        </div>
      </div>

      {/* Persona */}
      <p className="text-sm text-muted-foreground mb-3 italic">"{gladiator.persona}"</p>

      {/* Output area */}
      <ScrollArea className="flex-1 border border-border rounded-lg bg-black/20 min-h-[300px]">
        <div ref={scrollRef} className="p-4 space-y-3">
          {segments.length === 0 ? (
            <span className="text-muted-foreground">
              {gladiator.status === "PENDING"
                ? "Waiting for gladiator to begin..."
                : gladiator.status === "RUNNING"
                ? "Starting up..."
                : "No output recorded."}
            </span>
          ) : (
            segments.map((segment, index) => {
              if (segment.type === "text") {
                return (
                  <div
                    key={`text-${index}`}
                    className="text-sm font-mono whitespace-pre-wrap text-foreground/90"
                  >
                    {segment.content}
                  </div>
                );
              }
              return (
                <ToolUseCard
                  key={`tool-${index}`}
                  toolName={segment.toolName || "Tool"}
                  input={segment.toolInput}
                  output={segment.toolOutput}
                />
              );
            })
          )}

          {/* Error display */}
          {stream.error && (
            <div className="mt-4 p-3 rounded-lg bg-red-950/30 border border-red-500/30 text-red-400 text-sm">
              Error: {stream.error}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Completion indicator */}
      {stream.isComplete && (
        <div className="mt-3 flex items-center gap-2 text-sm text-green-400">
          <span>✓</span>
          <span>Gladiator has completed their challenge</span>
        </div>
      )}

      {/* Failed indicator */}
      {gladiator.status === "FAILED" && !stream.isComplete && (
        <div className="mt-3 flex items-center gap-2 text-sm text-red-400">
          <span>✕</span>
          <span>Gladiator failed to complete</span>
        </div>
      )}
    </div>
  );
}
