/**
 * Phase Judging Component
 *
 * Displays parallel judge evaluations with live progress.
 */

"use client";

import type { PhaseState } from "@/hooks/use-trial-phases";
import { ThinkingIndicator } from "../timeline-phase";
import { JudgeEvaluationCard } from "../cards/judge-evaluation-card";

interface Gladiator {
  id: string;
  name: string;
}

interface JudgeWithEvaluation {
  id: string;
  name: string;
  focus: string;
  model: string;
  status: PhaseState | string;
  evaluationData?: any;
}

interface PhaseJudgingProps {
  state: PhaseState;
  judges: JudgeWithEvaluation[];
  gladiators: Gladiator[];
  totalCost?: number;
  error?: string;
}

export function PhaseJudging({
  state,
  judges,
  gladiators,
  totalCost,
  error,
}: PhaseJudgingProps) {
  if (state === "pending") {
    return (
      <div className="text-muted-foreground text-sm">
        Waiting for Arbiter to design judges...
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="space-y-2">
        <div className="text-red-400 text-sm font-medium">Judging failed</div>
        {error && (
          <div className="bg-red-950/30 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>
    );
  }

  if (judges.length === 0) {
    return (
      <div className="text-muted-foreground text-sm">
        No judges created yet.
      </div>
    );
  }

  // Count judge statuses
  const activeCount = judges.filter((j) => j.status === "active").length;
  const completeCount = judges.filter((j) => j.status === "complete").length;

  return (
    <div className="space-y-4">
      {/* Progress indicator for active state */}
      {state === "active" && (
        <div className="flex items-center gap-4">
          <ThinkingIndicator message="Judges evaluating" colorScheme="blue" />
          <div className="text-xs text-muted-foreground">
            {activeCount > 0 && <span className="text-blue-400">{activeCount} active</span>}
            {activeCount > 0 && completeCount > 0 && <span> · </span>}
            {completeCount > 0 && <span className="text-green-400">{completeCount} complete</span>}
          </div>
        </div>
      )}

      {/* Judge cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {judges.map((judge, index) => (
          <JudgeEvaluationCard
            key={judge.id}
            judge={judge}
            gladiators={gladiators}
            index={index}
          />
        ))}
      </div>

      {/* Cost info */}
      {state === "complete" && totalCost !== undefined && (
        <div className="text-xs text-muted-foreground">
          Total judging cost: ${totalCost.toFixed(4)}
        </div>
      )}
    </div>
  );
}
