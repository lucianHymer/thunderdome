/**
 * Phase Battle Component
 *
 * Displays the gladiator battle phase with tabs for each gladiator.
 */

"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { PhaseState } from "@/hooks/use-trial-phases";
import { GladiatorPanel } from "../gladiator-panel";
import { ThinkingIndicator } from "../timeline-phase";
import { cn } from "@/lib/utils";

interface Gladiator {
  id: string;
  name: string;
  persona: string;
  model: string;
  status: string;
  branchName?: string;
}

interface PhaseBattleProps {
  state: PhaseState;
  gladiators: Gladiator[];
  activeGladiators: string[];
  completedGladiators: string[];
  failedGladiators: string[];
  winnerId?: string | null;
  error?: string;
}

const statusIcons: Record<string, string> = {
  PENDING: "⏳",
  RUNNING: "⚡",
  COMPLETED: "✓",
  FAILED: "✕",
};

export function PhaseBattle({
  state,
  gladiators,
  activeGladiators,
  completedGladiators,
  failedGladiators,
  winnerId,
  error,
}: PhaseBattleProps) {
  if (state === "pending") {
    return (
      <div className="text-muted-foreground text-sm">
        Waiting for gladiators to be created...
      </div>
    );
  }

  if (gladiators.length === 0) {
    return (
      <div className="text-muted-foreground text-sm">
        No gladiators created yet.
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="space-y-4">
        <div className="text-red-400 text-sm font-medium">Battle failed</div>
        {error && (
          <div className="bg-red-950/30 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
            {error}
          </div>
        )}
        {/* Still show gladiator tabs even on error */}
        {gladiators.length > 0 && (
          <GladiatorTabs
            gladiators={gladiators}
            activeGladiators={activeGladiators}
            completedGladiators={completedGladiators}
            failedGladiators={failedGladiators}
            winnerId={winnerId}
          />
        )}
      </div>
    );
  }

  // Show progress summary for active state
  const progress = state === "active" && (
    <div className="flex items-center gap-4 mb-4 text-sm">
      <ThinkingIndicator message="Battle in progress" colorScheme="orange" />
      <div className="flex gap-3 text-xs">
        <span className="text-orange-400">
          {activeGladiators.length} active
        </span>
        <span className="text-green-400">
          {completedGladiators.length} complete
        </span>
        {failedGladiators.length > 0 && (
          <span className="text-red-400">
            {failedGladiators.length} failed
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      {progress}
      <GladiatorTabs
        gladiators={gladiators}
        activeGladiators={activeGladiators}
        completedGladiators={completedGladiators}
        failedGladiators={failedGladiators}
        winnerId={winnerId}
      />
    </div>
  );
}

function GladiatorTabs({
  gladiators,
  activeGladiators,
  completedGladiators,
  failedGladiators,
  winnerId,
}: {
  gladiators: Gladiator[];
  activeGladiators: string[];
  completedGladiators: string[];
  failedGladiators: string[];
  winnerId?: string | null;
}) {
  // Determine gladiator status from phase tracking or DB status
  const getGladiatorStatus = (gladiator: Gladiator) => {
    if (activeGladiators.includes(gladiator.id)) return "RUNNING";
    if (completedGladiators.includes(gladiator.id)) return "COMPLETED";
    if (failedGladiators.includes(gladiator.id)) return "FAILED";
    return gladiator.status;
  };

  return (
    <Tabs defaultValue={gladiators[0]?.id} className="w-full">
      <TabsList className="grid w-full gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(gladiators.length, 3)}, 1fr)` }}>
        {gladiators.map((gladiator) => {
          const status = getGladiatorStatus(gladiator);
          const isWinner = winnerId === gladiator.id;
          return (
            <TabsTrigger
              key={gladiator.id}
              value={gladiator.id}
              className={cn(
                "data-[state=active]:bg-orange-600 flex items-center gap-1.5",
                status === "RUNNING" && "animate-pulse"
              )}
            >
              <span>{statusIcons[status] || "⏳"}</span>
              <span className="truncate">{gladiator.name}</span>
              {isWinner && <span>👑</span>}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {gladiators.map((gladiator) => (
        <TabsContent
          key={gladiator.id}
          value={gladiator.id}
          className="mt-4 min-h-[400px]"
        >
          <GladiatorPanel
            gladiator={{
              ...gladiator,
              status: getGladiatorStatus(gladiator),
            }}
            isWinner={winnerId === gladiator.id}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
