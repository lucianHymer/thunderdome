/**
 * Judge Evaluation Card
 *
 * Displays a judge's evaluation progress and results.
 */

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PhaseState } from "@/hooks/use-trial-phases";
import { cn } from "@/lib/utils";

interface Gladiator {
  id: string;
  name: string;
}

interface JudgeEvaluation {
  gladiatorId: string;
  gladiatorName?: string;
  score: number;
  strengths: string[];
  weaknesses: string[];
  reasoning: string;
}

interface JudgeWithEvaluation {
  id: string;
  name: string;
  focus: string;
  status: PhaseState | string;
  evaluationData?: {
    output?: {
      evaluations?: JudgeEvaluation[];
      summary?: string;
    };
    cost?: {
      totalUsd: number;
    };
  } | null;
}

interface JudgeEvaluationCardProps {
  judge: JudgeWithEvaluation;
  gladiators: Gladiator[];
  index: number;
}

export function JudgeEvaluationCard({
  judge,
  gladiators,
  index,
}: JudgeEvaluationCardProps) {
  const status = judge.status as PhaseState;
  const evaluations = judge.evaluationData?.output?.evaluations || [];
  const summary = judge.evaluationData?.output?.summary;

  return (
    <Card
      className={cn(
        "border-blue-500/20 bg-blue-950/10 transition-all duration-300",
        "animate-fadeIn",
        status === "active" && "border-blue-500/50"
      )}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <span>📊</span>
            <span className={cn(
              status === "active" && "text-blue-400",
              status === "complete" && "text-green-400",
              status === "error" && "text-red-400"
            )}>
              {judge.name}
            </span>
          </span>
          <StatusBadge status={status} />
        </CardTitle>
        <p className="text-xs text-muted-foreground">{judge.focus}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {status === "pending" && (
          <div className="text-sm text-muted-foreground">
            Waiting to evaluate...
          </div>
        )}

        {status === "active" && (
          <div className="flex items-center gap-2 text-sm text-blue-400">
            <span className="animate-pulse">Evaluating</span>
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          </div>
        )}

        {status === "error" && (
          <div className="text-sm text-red-400">
            Evaluation failed
          </div>
        )}

        {status === "complete" && evaluations.length > 0 && (
          <div className="space-y-2">
            {/* Summary */}
            {summary && (
              <p className="text-xs text-muted-foreground italic mb-2">
                "{summary}"
              </p>
            )}

            {/* Scores */}
            <div className="space-y-1.5">
              {evaluations.map((evaluation) => {
                const gladiator = gladiators.find((g) => g.id === evaluation.gladiatorId);
                return (
                  <div
                    key={evaluation.gladiatorId}
                    className="flex items-center justify-between bg-muted/30 rounded px-2 py-1"
                  >
                    <span className="text-sm">
                      {evaluation.gladiatorName || gladiator?.name || "Unknown"}
                    </span>
                    <ScoreBadge score={evaluation.score} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: PhaseState | string }) {
  const styles: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    active: "bg-blue-500/20 text-blue-400 animate-pulse",
    complete: "bg-green-500/20 text-green-400",
    error: "bg-red-500/20 text-red-400",
  };

  const labels: Record<string, string> = {
    pending: "Waiting",
    active: "Evaluating",
    complete: "Done",
    error: "Failed",
  };

  return (
    <Badge className={cn("text-xs", styles[status] || styles.pending)}>
      {labels[status] || status}
    </Badge>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const getScoreColor = (s: number) => {
    if (s >= 80) return "bg-green-500/20 text-green-400";
    if (s >= 60) return "bg-yellow-500/20 text-yellow-400";
    if (s >= 40) return "bg-orange-500/20 text-orange-400";
    return "bg-red-500/20 text-red-400";
  };

  return (
    <Badge className={cn("text-xs font-mono", getScoreColor(score))}>
      {score}/100
    </Badge>
  );
}
