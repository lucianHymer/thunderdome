/**
 * Battle View Component
 *
 * Main battle viewing interface with timeline showing all trial phases.
 * Uses the new timeline components for a beautiful, living UI experience.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTrialPhases } from "@/hooks/use-trial-phases";
import { StatusBanner } from "./status-banner";
import { TrialTimeline } from "./trial-timeline";

interface Gladiator {
  id: string;
  name: string;
  persona: string;
  model: string;
  status: string;
  branchName?: string;
  responseSummary?: string | null;
}

interface Judge {
  id: string;
  name: string;
  focus: string;
  model: string;
  evaluation?: string | null;
}

interface Verdict {
  summary: string;
  winnerGladiatorId: string | null;
  reasoning: string;
}

interface Trial {
  id: string;
  challengePrompt: string;
  status: string;
  trialType: string;
  repoUrl?: string | null;
  lanistaPlan?: string | null;
  arbiterPlan?: string | null;
  createdAt: Date;
  completedAt?: Date | null;
}

interface BattleViewProps {
  trial: Trial;
  gladiators: Gladiator[];
  judges?: Judge[];
  verdict?: Verdict | null;
}

export function BattleView({
  trial: initialTrial,
  gladiators: initialGladiators,
  judges: initialJudges = [],
  verdict: initialVerdict,
}: BattleViewProps) {
  const [trial, setTrial] = useState(initialTrial);
  const [gladiators, setGladiators] = useState(initialGladiators);
  const [judges, setJudges] = useState(initialJudges);
  const [verdict, setVerdict] = useState(initialVerdict);
  const [showDebug, setShowDebug] = useState(false);
  const [lastFetchedEventCount, setLastFetchedEventCount] = useState(0);

  // Use the new trial phases hook
  const { phases, stream, currentPhase } = useTrialPhases(
    trial.id,
    trial.status,
    trial.lanistaPlan,
    trial.arbiterPlan
  );

  // Refetch trial data from server
  const refetchTrial = useCallback(async () => {
    try {
      const response = await fetch(`/api/trials/${initialTrial.id}`);
      if (response.ok) {
        const data = await response.json();
        if (data.trial) {
          const {
            gladiators: newGladiators,
            judges: newJudges,
            verdict: newVerdict,
            ...trialData
          } = data.trial;
          setTrial(trialData);
          if (newGladiators) setGladiators(newGladiators);
          if (newJudges) setJudges(newJudges);
          if (newVerdict) setVerdict(newVerdict);
        }
      }
    } catch (e) {
      console.error("Failed to refetch trial:", e);
    }
  }, [initialTrial.id]);

  // Refetch when important events occur
  useEffect(() => {
    const importantEvents = [
      "lanista_complete",
      "gladiators_created",
      "state_change",
      "battle_completed",
      "arbiter_complete",
      "judges_created",
      "all_judges_complete",
      "verdict_complete",
    ];
    const hasNewImportantEvent = stream.events
      .slice(lastFetchedEventCount)
      .some((e: any) => importantEvents.includes(e.type));

    if (hasNewImportantEvent) {
      refetchTrial();
      setLastFetchedEventCount(stream.events.length);
    }
  }, [stream.events, lastFetchedEventCount, refetchTrial]);

  // Use streamed status if available, otherwise use trial status
  const currentStatus =
    (stream.lastEvent as any)?.trial?.status ||
    (stream.lastEvent as any)?.status ||
    trial.status;

  // Get error from stream events
  const errorEvent = stream.events.find(
    (e: any) => e.type === "error" || e.type?.includes("_error")
  );
  const errorMessage =
    errorEvent?.data?.error ||
    (stream.lastEvent as any)?.error ||
    (phases.lanista.state === "error" && phases.lanista.error) ||
    (phases.battle.state === "error" && phases.battle.error) ||
    (phases.arbiter.state === "error" && phases.arbiter.error) ||
    (phases.judging.state === "error" && phases.judging.error);

  // Resume handler for stuck trials
  const [isResuming, setIsResuming] = useState(false);
  const handleResume = async () => {
    setIsResuming(true);
    try {
      const response = await fetch(`/api/trials/${initialTrial.id}/resume`, {
        method: "POST",
      });
      if (!response.ok) {
        const data = await response.json();
        console.error("Resume failed:", data.error);
      }
    } catch (e) {
      console.error("Resume failed:", e);
    } finally {
      setIsResuming(false);
    }
  };

  // Show resume button only for failed trials
  const canResume = currentStatus === "FAILED";

  return (
    <div className="space-y-6">
      {/* Challenge Display */}
      <Card className="border-orange-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>⚔️</span>
            <span>The Challenge</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground whitespace-pre-wrap">
            {trial.challengePrompt}
          </p>
        </CardContent>
      </Card>

      {/* Status Banner with Resume */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <StatusBanner
            status={currentStatus}
            message={(stream.lastEvent as any)?.message}
          />
        </div>
        <div className="flex items-center gap-2">
          {stream.connected && (
            <Badge className="bg-green-600 text-xs">Live</Badge>
          )}
          {currentPhase && (
            <Badge variant="outline" className="text-xs capitalize">
              {currentPhase}
            </Badge>
          )}
          {canResume && (
            <button
              type="button"
              onClick={handleResume}
              disabled={isResuming}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
            >
              {isResuming ? "Resuming..." : "Resume"}
            </button>
          )}
        </div>
      </div>

      {/* Error Display */}
      {(errorMessage || stream.error || currentStatus === "FAILED") && (
        <Card className="border-red-500 bg-red-950/30">
          <CardHeader>
            <CardTitle className="text-red-400 flex items-center gap-2">
              <span>❌</span>
              <span>Error Details</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-red-300 font-mono text-sm">
            {errorMessage && (
              <p className="mb-2">
                <strong>Error:</strong> {errorMessage}
              </p>
            )}
            {stream.error && (
              <p className="mb-2">
                <strong>Stream:</strong> {stream.error}
              </p>
            )}
            {!errorMessage && !stream.error && currentStatus === "FAILED" && (
              <p>Trial failed but no error message was captured. Check server logs.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Trial Timeline - The main event! */}
      <TrialTimeline
        phases={phases}
        gladiators={gladiators}
        judges={judges}
        verdict={verdict}
      />

      {/* Debug Panel */}
      <div className="border-t border-border pt-6 mt-8">
        <button
          type="button"
          onClick={() => setShowDebug(!showDebug)}
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-2"
        >
          <span
            className={`transition-transform ${showDebug ? "rotate-90" : ""}`}
          >
            ▶
          </span>
          Debug Panel
        </button>
        {showDebug && (
          <div className="mt-4 space-y-4">
            {/* Trial Raw Data */}
            <Card className="border-gray-700">
              <CardHeader className="py-3">
                <CardTitle className="text-sm text-gray-400">
                  Trial Record
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs font-mono overflow-x-auto bg-black/50 text-gray-200 p-3 rounded">
                  {JSON.stringify(
                    {
                      id: trial.id,
                      status: trial.status,
                      trialType: trial.trialType,
                      repoUrl: trial.repoUrl,
                      createdAt: trial.createdAt,
                      completedAt: trial.completedAt,
                      hasLanistaPlan: !!trial.lanistaPlan,
                      hasArbiterPlan: !!trial.arbiterPlan,
                    },
                    null,
                    2
                  )}
                </pre>
              </CardContent>
            </Card>

            {/* Phase States */}
            <Card className="border-gray-700">
              <CardHeader className="py-3">
                <CardTitle className="text-sm text-gray-400">
                  Phase States
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs font-mono overflow-x-auto bg-black/50 text-gray-200 p-3 rounded max-h-48 overflow-y-auto">
                  {JSON.stringify(
                    {
                      currentPhase,
                      lanista: phases.lanista.state,
                      battle: phases.battle.state,
                      arbiter: phases.arbiter.state,
                      judging: phases.judging.state,
                      verdict: phases.verdict.state,
                    },
                    null,
                    2
                  )}
                </pre>
              </CardContent>
            </Card>

            {/* Stream State */}
            <Card className="border-gray-700">
              <CardHeader className="py-3">
                <CardTitle className="text-sm text-gray-400">
                  Stream State
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs font-mono overflow-x-auto bg-black/50 text-gray-200 p-3 rounded">
                  {JSON.stringify(
                    {
                      connected: stream.connected,
                      error: stream.error,
                      eventCount: stream.events.length,
                      lastEvent: stream.lastEvent,
                    },
                    null,
                    2
                  )}
                </pre>
              </CardContent>
            </Card>

            {/* All Events */}
            {stream.events.length > 0 && (
              <Card className="border-gray-700">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm text-gray-400">
                    All Stream Events ({stream.events.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs font-mono overflow-x-auto bg-black/50 text-gray-200 p-3 rounded max-h-64 overflow-y-auto">
                    {JSON.stringify(stream.events, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
