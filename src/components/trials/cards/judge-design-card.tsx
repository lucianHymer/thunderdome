/**
 * Judge Design Card
 *
 * Displays a designed judge's focus and evaluation criteria from the Arbiter phase.
 */

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface JudgeDesign {
  id?: string;
  name: string;
  focus: string;
  evaluationCriteria?: string[];
}

interface JudgeDesignCardProps {
  judge: JudgeDesign;
  index: number;
}

export function JudgeDesignCard({ judge, index }: JudgeDesignCardProps) {
  return (
    <Card
      className={cn(
        "border-purple-500/20 bg-purple-950/10 transition-all duration-300",
        "animate-fadeIn"
      )}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span>⚖️</span>
          <span className="text-purple-400">{judge.name}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <span className="text-xs text-muted-foreground">Focus Area</span>
          <p className="text-sm text-foreground">{judge.focus}</p>
        </div>

        {judge.evaluationCriteria && judge.evaluationCriteria.length > 0 && (
          <div>
            <span className="text-xs text-muted-foreground">Criteria</span>
            <ul className="mt-1 space-y-1">
              {judge.evaluationCriteria.map((criterion, i) => (
                <li
                  key={i}
                  className="text-xs text-muted-foreground flex items-start gap-1.5"
                >
                  <span className="text-purple-400 mt-0.5">•</span>
                  <span>{criterion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
