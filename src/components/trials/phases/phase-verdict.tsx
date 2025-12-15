/**
 * Phase Verdict Component
 *
 * Displays the final verdict with animated winner reveal.
 */

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PhaseState } from "@/hooks/use-trial-phases";
import { ThinkingIndicator } from "../timeline-phase";
import { cn } from "@/lib/utils";

interface Gladiator {
  id: string;
  name: string;
}

interface Verdict {
  summary: string;
  winnerGladiatorId: string | null;
  reasoning: string;
}

interface PhaseVerdictProps {
  state: PhaseState;
  verdict?: Verdict | null;
  gladiators: Gladiator[];
  scores?: Record<string, number>;
  error?: string;
}

export function PhaseVerdict({
  state,
  verdict,
  gladiators,
  scores,
  error,
}: PhaseVerdictProps) {
  if (state === "pending") {
    return (
      <div className="text-muted-foreground text-sm">
        Waiting for judges to complete evaluation...
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="space-y-2">
        <div className="text-red-400 text-sm font-medium">Verdict synthesis failed</div>
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
        <ThinkingIndicator message="Synthesizing verdict" colorScheme="green" />
        <div className="text-sm text-muted-foreground">
          Combining judge evaluations to determine the winner...
        </div>
      </div>
    );
  }

  // Complete state - show verdict
  if (!verdict) {
    return (
      <div className="text-muted-foreground text-sm">
        Verdict not available.
      </div>
    );
  }

  const winner = gladiators.find((g) => g.id === verdict.winnerGladiatorId);
  const winnerScore = scores?.[verdict.winnerGladiatorId || ""];

  // Sort gladiators by score
  const sortedGladiators = scores
    ? [...gladiators].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0))
    : gladiators;

  return (
    <div className="space-y-4">
      {/* Winner announcement */}
      {winner && (
        <Card className="border-yellow-500/50 bg-gradient-to-br from-yellow-950/30 to-orange-950/20 animate-fadeIn">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-3">
              <span className="text-2xl">👑</span>
              <span className="text-yellow-400 text-xl">{winner.name}</span>
              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50">
                Winner
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {winnerScore !== undefined && (
              <div className="text-lg font-mono text-green-400 mb-2">
                {winnerScore.toFixed(1)}/100
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Score breakdown */}
      {scores && Object.keys(scores).length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Final Scores</h4>
          <div className="space-y-1.5">
            {sortedGladiators.map((gladiator, index) => {
              const score = scores[gladiator.id];
              const isWinner = gladiator.id === verdict.winnerGladiatorId;
              return (
                <div
                  key={gladiator.id}
                  className={cn(
                    "flex items-center justify-between rounded px-3 py-2 transition-all",
                    isWinner
                      ? "bg-yellow-500/10 border border-yellow-500/30"
                      : "bg-muted/30"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground w-4">{index + 1}.</span>
                    <span className={cn(isWinner && "text-yellow-400 font-medium")}>
                      {gladiator.name}
                    </span>
                    {isWinner && <span>👑</span>}
                  </span>
                  <span
                    className={cn(
                      "font-mono",
                      isWinner ? "text-yellow-400" : "text-muted-foreground"
                    )}
                  >
                    {score !== undefined ? `${score.toFixed(1)}/100` : "N/A"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="bg-green-950/20 border border-green-500/20 rounded-lg p-4">
        <h4 className="text-sm font-medium text-green-400 mb-2">Summary</h4>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
          {verdict.summary}
        </p>
      </div>

      {/* Detailed reasoning */}
      {verdict.reasoning && (
        <div className="bg-muted/20 border border-muted rounded-lg p-4">
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Detailed Reasoning</h4>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {verdict.reasoning}
          </p>
        </div>
      )}
    </div>
  );
}
