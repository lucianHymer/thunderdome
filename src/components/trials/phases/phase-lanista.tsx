/**
 * Phase Lanista Component
 *
 * Displays the Lanista planning phase with thinking animation
 * and designed gladiator configurations.
 */

"use client";

import type { PhaseState, GladiatorDesign, CostInfo } from "@/hooks/use-trial-phases";
import { ThinkingIndicator } from "../timeline-phase";
import { GladiatorConfigCard } from "../cards/gladiator-config-card";
import { cn } from "@/lib/utils";

interface PhaseLanistaProps {
  state: PhaseState;
  reasoning?: string;
  gladiatorDesigns?: GladiatorDesign[];
  cost?: CostInfo;
  error?: string;
}

export function PhaseLanista({
  state,
  reasoning,
  gladiatorDesigns,
  cost,
  error,
}: PhaseLanistaProps) {
  if (state === "pending") {
    return (
      <div className="text-muted-foreground text-sm">
        Waiting for trial to start...
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="space-y-2">
        <div className="text-red-400 text-sm font-medium">Planning failed</div>
        {error && (
          <div className="bg-red-950/30 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>
    );
  }

  if (state === "active") {
    return (
      <div className="space-y-4">
        <ThinkingIndicator message="Lanista is designing gladiators" colorScheme="yellow" />
        <div className="text-sm text-muted-foreground">
          Analyzing the challenge and creating optimal gladiator configurations...
        </div>
      </div>
    );
  }

  // Complete state
  return (
    <div className="space-y-4">
      {/* Reasoning */}
      {reasoning && (
        <div className="bg-yellow-950/20 border border-yellow-500/20 rounded-lg p-4">
          <h4 className="text-sm font-medium text-yellow-400 mb-2">Strategy</h4>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {reasoning}
          </p>
        </div>
      )}

      {/* Gladiator designs */}
      {gladiatorDesigns && gladiatorDesigns.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            Designed Gladiators ({gladiatorDesigns.length})
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {gladiatorDesigns.map((gladiator, index) => (
              <GladiatorConfigCard
                key={gladiator.id || gladiator.name}
                gladiator={gladiator}
                index={index}
              />
            ))}
          </div>
        </div>
      )}

      {/* Cost info */}
      {cost && (
        <div className="text-xs text-muted-foreground">
          Planning cost: ${(cost.totalCost || cost.totalUsd || 0).toFixed(4)}
        </div>
      )}
    </div>
  );
}
