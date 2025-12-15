/**
 * Phase Arbiter Component
 *
 * Displays the Arbiter analysis phase with thinking animation
 * and designed judge configurations.
 */

"use client";

import type { PhaseState, JudgeDesign, CostInfo } from "@/hooks/use-trial-phases";
import { ThinkingIndicator } from "../timeline-phase";
import { JudgeDesignCard } from "../cards/judge-design-card";

interface PhaseArbiterProps {
  state: PhaseState;
  reasoning?: string;
  judgeDesigns?: JudgeDesign[];
  cost?: CostInfo;
  error?: string;
}

export function PhaseArbiter({
  state,
  reasoning,
  judgeDesigns,
  cost,
  error,
}: PhaseArbiterProps) {
  if (state === "pending") {
    return (
      <div className="text-muted-foreground text-sm">
        Waiting for gladiators to complete their battle...
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="space-y-2">
        <div className="text-red-400 text-sm font-medium">Arbiter analysis failed</div>
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
        <ThinkingIndicator message="Arbiter is analyzing gladiator outputs" colorScheme="purple" />
        <div className="text-sm text-muted-foreground">
          Reviewing battle results and designing evaluation criteria...
        </div>
      </div>
    );
  }

  // Complete state
  return (
    <div className="space-y-4">
      {/* Reasoning */}
      {reasoning && (
        <div className="bg-purple-950/20 border border-purple-500/20 rounded-lg p-4">
          <h4 className="text-sm font-medium text-purple-400 mb-2">Analysis</h4>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {reasoning}
          </p>
        </div>
      )}

      {/* Judge designs */}
      {judgeDesigns && judgeDesigns.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            Designed Judges ({judgeDesigns.length})
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {judgeDesigns.map((judge, index) => (
              <JudgeDesignCard
                key={judge.id || judge.name}
                judge={judge}
                index={index}
              />
            ))}
          </div>
        </div>
      )}

      {/* Cost info */}
      {cost && (
        <div className="text-xs text-muted-foreground">
          Analysis cost: ${(cost.totalCost || cost.totalUsd || 0).toFixed(4)}
        </div>
      )}
    </div>
  );
}
