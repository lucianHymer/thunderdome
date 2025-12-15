/**
 * Timeline Phase Component
 *
 * Reusable phase container with indicator, title, and collapsible content.
 * Used in the vertical timeline to show each trial phase.
 */

"use client";

import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { PhaseState } from "@/hooks/use-trial-phases";

export type PhaseColorScheme = "yellow" | "orange" | "purple" | "blue" | "green" | "red";

interface TimelinePhaseProps {
  title: string;
  subtitle?: string;
  state: PhaseState;
  icon: React.ReactNode;
  colorScheme: PhaseColorScheme;
  defaultOpen?: boolean;
  isLast?: boolean;
  children: React.ReactNode;
}

const stateStyles: Record<PhaseState, string> = {
  pending: "bg-muted text-muted-foreground border-muted",
  active: "border-current",
  complete: "bg-green-500/20 text-green-400 border-green-500",
  error: "bg-red-500/20 text-red-400 border-red-500",
};

const colorStyles: Record<PhaseColorScheme, string> = {
  yellow: "text-yellow-400 border-yellow-500",
  orange: "text-orange-400 border-orange-500",
  purple: "text-purple-400 border-purple-500",
  blue: "text-blue-400 border-blue-500",
  green: "text-green-400 border-green-500",
  red: "text-red-400 border-red-500",
};

const connectorColors: Record<PhaseColorScheme, string> = {
  yellow: "from-yellow-500/50",
  orange: "from-orange-500/50",
  purple: "from-purple-500/50",
  blue: "from-blue-500/50",
  green: "from-green-500/50",
  red: "from-red-500/50",
};

export function TimelinePhase({
  title,
  subtitle,
  state,
  icon,
  colorScheme,
  defaultOpen,
  isLast = false,
  children,
}: TimelinePhaseProps) {
  // Auto-expand active phases, collapse completed ones
  const [isOpen, setIsOpen] = useState(
    defaultOpen ?? (state === "active" || state === "error")
  );

  // Update open state when phase becomes active
  const shouldOpen = state === "active" || state === "error";

  return (
    <div className="relative">
      {/* Connector line to next phase */}
      {!isLast && (
        <div
          className={cn(
            "absolute left-5 top-12 w-0.5 h-[calc(100%-2rem)] bg-gradient-to-b to-muted transition-all duration-500",
            state === "complete" && "from-green-500/50",
            state === "active" && cn(connectorColors[colorScheme], "animate-pulse"),
            state === "pending" && "from-muted",
            state === "error" && "from-red-500/50"
          )}
        />
      )}

      <Collapsible open={shouldOpen || isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-start gap-4">
          {/* Phase indicator */}
          <div
            className={cn(
              "relative flex-shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all duration-300",
              state === "pending" && "bg-muted/50 border-muted text-muted-foreground",
              state === "active" && cn(colorStyles[colorScheme], "bg-background"),
              state === "complete" && "bg-green-500/20 border-green-500 text-green-400",
              state === "error" && "bg-red-500/20 border-red-500 text-red-400"
            )}
          >
            {/* Pulse ring for active state */}
            {state === "active" && (
              <div
                className={cn(
                  "absolute inset-0 rounded-full animate-ping opacity-30",
                  colorScheme === "yellow" && "bg-yellow-500",
                  colorScheme === "orange" && "bg-orange-500",
                  colorScheme === "purple" && "bg-purple-500",
                  colorScheme === "blue" && "bg-blue-500",
                  colorScheme === "green" && "bg-green-500"
                )}
              />
            )}
            <span className="text-lg relative z-10">
              {state === "complete" ? "✓" : state === "error" ? "✕" : icon}
            </span>
          </div>

          {/* Header */}
          <div className="flex-1 min-w-0">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className={cn(
                  "w-full text-left group flex items-center justify-between py-2 px-3 -ml-3 rounded-lg transition-colors",
                  "hover:bg-muted/50"
                )}
              >
                <div>
                  <h3
                    className={cn(
                      "font-semibold transition-colors",
                      state === "pending" && "text-muted-foreground",
                      state === "active" && colorStyles[colorScheme].split(" ")[0],
                      state === "complete" && "text-green-400",
                      state === "error" && "text-red-400"
                    )}
                  >
                    {title}
                  </h3>
                  {subtitle && (
                    <p className="text-sm text-muted-foreground">{subtitle}</p>
                  )}
                </div>

                {/* State badge */}
                <div className="flex items-center gap-2">
                  {state === "active" && (
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full animate-pulse",
                        colorScheme === "yellow" && "bg-yellow-500/20 text-yellow-400",
                        colorScheme === "orange" && "bg-orange-500/20 text-orange-400",
                        colorScheme === "purple" && "bg-purple-500/20 text-purple-400",
                        colorScheme === "blue" && "bg-blue-500/20 text-blue-400"
                      )}
                    >
                      Active
                    </span>
                  )}
                  {state === "complete" && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                      Complete
                    </span>
                  )}
                  {state === "error" && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
                      Error
                    </span>
                  )}
                  <span
                    className={cn(
                      "transition-transform text-muted-foreground",
                      (shouldOpen || isOpen) && "rotate-90"
                    )}
                  >
                    ▶
                  </span>
                </div>
              </button>
            </CollapsibleTrigger>

            {/* Content */}
            <CollapsibleContent className="overflow-hidden data-[state=open]:animate-slideDown data-[state=closed]:animate-slideUp">
              <div className="pt-2 pb-4">{children}</div>
            </CollapsibleContent>
          </div>
        </div>
      </Collapsible>
    </div>
  );
}

/**
 * Thinking indicator for active phases
 */
export function ThinkingIndicator({
  message = "Thinking",
  colorScheme = "yellow",
}: {
  message?: string;
  colorScheme?: PhaseColorScheme;
}) {
  const dotColors: Record<PhaseColorScheme, string> = {
    yellow: "bg-yellow-400",
    orange: "bg-orange-400",
    purple: "bg-purple-400",
    blue: "bg-blue-400",
    green: "bg-green-400",
    red: "bg-red-400",
  };

  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <span>{message}</span>
      <span className="flex gap-1">
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full animate-bounce",
            dotColors[colorScheme]
          )}
          style={{ animationDelay: "0ms" }}
        />
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full animate-bounce",
            dotColors[colorScheme]
          )}
          style={{ animationDelay: "150ms" }}
        />
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full animate-bounce",
            dotColors[colorScheme]
          )}
          style={{ animationDelay: "300ms" }}
        />
      </span>
    </div>
  );
}
