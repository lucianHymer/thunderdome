/**
 * Results View Component
 *
 * Shows verdict summary, gladiator responses with scores,
 * judge evaluations, and decree action buttons.
 */

"use client";

import { ChevronDown, ChevronRight, Download, MessageSquare, Trophy } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Markdown } from "@/components/ui/markdown";
import { ConsulDialog } from "./consul-dialog";

interface Gladiator {
  id: string;
  name: string;
  persona: string;
  responseContent: string | null;
}

interface Judge {
  id: string;
  name: string;
  focus: string;
  evaluation: string | null;
}

interface Verdict {
  id: string;
  summary: string;
  winnerGladiatorId: string | null;
  reasoning: string;
}

interface ResultsViewProps {
  trialId: string;
  verdict: Verdict;
  gladiators: Gladiator[];
  judges: Judge[];
}

interface JudgeEvaluation {
  gladiatorId: string;
  score: number;
  strengths: string[];
  weaknesses: string[];
  comments: string;
}

interface ParsedEvaluation {
  summary: string;
  evaluations: JudgeEvaluation[];
}

export function ResultsView({ trialId, verdict, gladiators, judges }: ResultsViewProps) {
  const [consulOpen, setConsulOpen] = useState(false);
  const [expandedGladiators, setExpandedGladiators] = useState<Set<string>>(new Set());
  const [expandedJudges, setExpandedJudges] = useState<Set<string>>(new Set());

  // Parse judge evaluations to extract scores
  const parseEvaluation = (evaluation: string | null): ParsedEvaluation | null => {
    if (!evaluation) return null;

    try {
      const parsed = JSON.parse(evaluation);
      // Handle the stored structure which has evaluations under 'output'
      if (parsed.output) {
        return {
          summary: parsed.output.summary,
          evaluations: parsed.output.evaluations || [],
        };
      }
      // Fallback for direct structure
      return parsed;
    } catch {
      // If not JSON, return null and just show raw text
      return null;
    }
  };

  // Calculate average score for each gladiator
  const calculateAverageScore = (gladiatorId: string): number | null => {
    const scores: number[] = [];

    judges.forEach((judge) => {
      const parsed = parseEvaluation(judge.evaluation);
      if (parsed?.evaluations) {
        const evalData = parsed.evaluations.find((e) => e.gladiatorId === gladiatorId);
        if (evalData) {
          scores.push(evalData.score);
        }
      }
    });

    if (scores.length === 0) return null;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  };

  const toggleGladiator = (id: string) => {
    const newExpanded = new Set(expandedGladiators);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedGladiators(newExpanded);
  };

  const toggleJudge = (id: string) => {
    const newExpanded = new Set(expandedJudges);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedJudges(newExpanded);
  };

  const handleExport = async () => {
    const response = await fetch(`/api/trials/${trialId}/export`);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trial-${trialId}-report.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Verdict Card */}
      <Card className="border-purple-500/50 bg-purple-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            <span>Verdict</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-lg">
            {verdict.summary.split(/\n\n##/)[0].trim()}
          </div>
          <div className="text-muted-foreground text-sm">
            <Markdown>{verdict.reasoning}</Markdown>
          </div>
          {verdict.winnerGladiatorId && (
            <div className="flex items-center gap-2 pt-2">
              <Badge className="bg-yellow-500 text-black font-semibold">👑 Winner</Badge>
              <span className="font-medium">
                {gladiators.find((g) => g.id === verdict.winnerGladiatorId)?.name || "Unknown"}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gladiator Responses */}
      <Card>
        <CardHeader>
          <CardTitle>Gladiator Responses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {gladiators.map((gladiator) => {
            const isWinner = verdict.winnerGladiatorId === gladiator.id;
            const avgScore = calculateAverageScore(gladiator.id);
            const isExpanded = expandedGladiators.has(gladiator.id);

            return (
              <Collapsible
                key={gladiator.id}
                open={isExpanded}
                onOpenChange={() => toggleGladiator(gladiator.id)}
              >
                <Card className={isWinner ? "border-yellow-500/50 bg-yellow-950/10" : ""}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          <CardTitle className="text-base">
                            {gladiator.name}
                            {isWinner && <span className="ml-2">👑</span>}
                          </CardTitle>
                        </div>
                        {avgScore !== null && (
                          <Badge variant="outline">Avg Score: {avgScore.toFixed(1)}/10</Badge>
                        )}
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <div className="text-sm text-muted-foreground mb-3">
                        <strong>Persona:</strong> {gladiator.persona}
                      </div>
                      <div className="bg-muted/50 rounded-lg p-4 text-sm">
                        {gladiator.responseContent ? (
                          <Markdown>{gladiator.responseContent}</Markdown>
                        ) : (
                          <span className="text-muted-foreground">No response available</span>
                        )}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </CardContent>
      </Card>

      {/* Judge Evaluations */}
      <Card>
        <CardHeader>
          <CardTitle>Judge Evaluations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {judges.map((judge) => {
            const isExpanded = expandedJudges.has(judge.id);
            const parsed = parseEvaluation(judge.evaluation);

            return (
              <Collapsible
                key={judge.id}
                open={isExpanded}
                onOpenChange={() => toggleJudge(judge.id)}
              >
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          <div>
                            <CardTitle className="text-base">{judge.name}</CardTitle>
                            <p className="text-sm text-muted-foreground mt-1">
                              Focus: {judge.focus}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0 space-y-4">
                      {parsed ? (
                        <>
                          {parsed.summary && (
                            <div className="text-sm">
                              <strong>Summary:</strong> {parsed.summary}
                            </div>
                          )}
                          {parsed.evaluations?.map((evalData) => {
                            const gladiator = gladiators.find((g) => g.id === evalData.gladiatorId);
                            return (
                              <div key={evalData.gladiatorId} className="border-t pt-3">
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="font-semibold">{gladiator?.name}</h4>
                                  <Badge variant="outline">Score: {evalData.score}/10</Badge>
                                </div>
                                <div className="text-sm space-y-2">
                                  {evalData.strengths && evalData.strengths.length > 0 && (
                                    <div>
                                      <strong className="text-green-400">Strengths:</strong>
                                      <ul className="list-disc list-inside ml-2">
                                        {evalData.strengths.map((s, i) => (
                                          <li key={i}>{s}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {evalData.weaknesses && evalData.weaknesses.length > 0 && (
                                    <div>
                                      <strong className="text-red-400">Weaknesses:</strong>
                                      <ul className="list-disc list-inside ml-2">
                                        {evalData.weaknesses.map((w, i) => (
                                          <li key={i}>{w}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {evalData.comments && (
                                    <div>
                                      <strong>Comments:</strong> {evalData.comments}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {judge.evaluation || "No evaluation available"}
                        </div>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </CardContent>
      </Card>

      {/* Decree Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Decree Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setConsulOpen(true)} className="bg-purple-600 hover:bg-purple-700">
              <MessageSquare className="h-4 w-4 mr-2" />
              Summon the Consul
            </Button>
            <Button onClick={handleExport} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
            <Button onClick={() => (window.location.href = "/trials/new")} variant="outline">
              New Trial
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Consul Dialog */}
      <ConsulDialog
        open={consulOpen}
        onOpenChange={setConsulOpen}
        trialId={trialId}
        verdict={verdict}
      />
    </div>
  );
}
