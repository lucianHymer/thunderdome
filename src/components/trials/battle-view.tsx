/**
 * Battle View Component
 *
 * Main battle viewing interface with tabs for each gladiator,
 * status banner, and verdict display.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTrialStream } from "@/hooks/use-trial-stream";
import { GladiatorPanel } from "./gladiator-panel";
import { StatusBanner } from "./status-banner";

interface Gladiator {
  id: string;
  name: string;
  persona: string;
  status: string;
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
  verdict?: Verdict | null;
}

export function BattleView({ trial: initialTrial, gladiators: initialGladiators, verdict }: BattleViewProps) {
  const stream = useTrialStream(initialTrial.id);
  const [showDebug, setShowDebug] = useState(false);
  const [trial, setTrial] = useState(initialTrial);
  const [gladiators, setGladiators] = useState(initialGladiators);
  const [lastFetchedEventCount, setLastFetchedEventCount] = useState(0);

  // Refetch trial data from server
  const refetchTrial = useCallback(async () => {
    try {
      const response = await fetch(`/api/trials/${initialTrial.id}`);
      if (response.ok) {
        const data = await response.json();
        if (data.trial) {
          // API returns gladiators nested in trial
          const { gladiators: newGladiators, ...trialData } = data.trial;
          setTrial(trialData);
          if (newGladiators) setGladiators(newGladiators);
        }
      }
    } catch (e) {
      console.error("Failed to refetch trial:", e);
    }
  }, [initialTrial.id]);

  // Refetch when important events occur
  useEffect(() => {
    const importantEvents = ['lanista_complete', 'gladiators_created', 'state_change', 'verdict_complete'];
    const hasNewImportantEvent = stream.events.slice(lastFetchedEventCount).some(
      (e: any) => importantEvents.includes(e.type)
    );

    if (hasNewImportantEvent) {
      refetchTrial();
      setLastFetchedEventCount(stream.events.length);
    }
  }, [stream.events, lastFetchedEventCount, refetchTrial]);

  // Use streamed status if available, otherwise use initial status
  const currentStatus = (stream.lastEvent as any)?.trial?.status || trial.status;

  // Parse lanista plan if available
  const lanistaPlan = trial.lanistaPlan ? JSON.parse(trial.lanistaPlan) : null;

  // Get error from stream events OR from stored lanistaPlan
  const errorEvent = stream.events.find((e: any) => e.type === 'error' || e.type === 'lanista_error');
  const errorMessage = errorEvent?.data?.error
    || (stream.lastEvent as any)?.error
    || lanistaPlan?.error;

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
          <p className="text-muted-foreground whitespace-pre-wrap">{trial.challengePrompt}</p>
        </CardContent>
      </Card>

      {/* Status Banner */}
      <StatusBanner status={currentStatus} message={(stream.lastEvent as any)?.message} />

      {/* Error Display */}
      {(errorMessage || stream.error || currentStatus === 'FAILED') && (
        <Card className="border-red-500 bg-red-950/30">
          <CardHeader>
            <CardTitle className="text-red-400 flex items-center gap-2">
              <span>❌</span>
              <span>Error Details</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-red-300 font-mono text-sm">
            {errorMessage && <p className="mb-2"><strong>Error:</strong> {errorMessage}</p>}
            {stream.error && <p className="mb-2"><strong>Stream:</strong> {stream.error}</p>}
            {!errorMessage && !stream.error && currentStatus === 'FAILED' && (
              <p>Trial failed but no error message was captured. Check server logs.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Event Stream - shows what's happening */}
      {stream.events.length > 0 && (
        <Card className="border-blue-500/30">
          <CardHeader>
            <CardTitle className="text-blue-400 flex items-center gap-2">
              <span>📡</span>
              <span>Live Events ({stream.events.length})</span>
              {stream.connected && <Badge className="bg-green-600 text-xs">Connected</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-48 overflow-y-auto space-y-1 font-mono text-xs">
              {stream.events.map((event: any, i: number) => (
                <div key={i} className="text-muted-foreground">
                  <span className="text-blue-400">[{event.type}]</span>{' '}
                  {JSON.stringify(event.data || event).slice(0, 200)}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lanista Plan - if available */}
      {lanistaPlan && (
        <Card className="border-yellow-500/30">
          <CardHeader>
            <CardTitle className="text-yellow-400 flex items-center gap-2">
              <span>🧠</span>
              <span>Lanista's Plan</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap mb-4">{lanistaPlan.reasoning}</p>
            {lanistaPlan.cost && (
              <p className="text-xs text-muted-foreground">
                Cost: ${lanistaPlan.cost.totalCost?.toFixed(4) || 'N/A'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Verdict Display */}
      {verdict && (
        <Card className="border-purple-500/50 bg-purple-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>⚖️</span>
              <span>Verdict</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold mb-4">{verdict.summary}</p>
            <div className="text-muted-foreground whitespace-pre-wrap mb-4">
              {verdict.reasoning}
            </div>
            {verdict.winnerGladiatorId && (
              <div className="flex items-center gap-2">
                <Badge className="bg-yellow-500 text-black">👑 Winner</Badge>
                <span>
                  {gladiators.find((g) => g.id === verdict.winnerGladiatorId)?.name || "Unknown"}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Gladiator Tabs */}
      {gladiators.length > 0 ? (
        <Tabs defaultValue={gladiators[0].id} className="w-full">
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-3 gap-2">
            {gladiators.map((gladiator) => (
              <TabsTrigger
                key={gladiator.id}
                value={gladiator.id}
                className="data-[state=active]:bg-orange-600"
              >
                {gladiator.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {gladiators.map((gladiator) => (
            <TabsContent key={gladiator.id} value={gladiator.id} className="mt-6 min-h-[500px]">
              <GladiatorPanel
                gladiator={gladiator}
                isWinner={verdict?.winnerGladiatorId === gladiator.id}
              />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-center">
              Waiting for gladiators to be created...
            </p>
          </CardContent>
        </Card>
      )}

      {/* Debug Panel */}
      <div className="border-t border-border pt-6 mt-8">
        <button
          type="button"
          onClick={() => setShowDebug(!showDebug)}
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-2"
        >
          <span className={`transition-transform ${showDebug ? 'rotate-90' : ''}`}>▶</span>
          Debug Panel
        </button>
        {showDebug && (
          <div className="mt-4 space-y-4">
            {/* Trial Raw Data */}
            <Card className="border-gray-700">
              <CardHeader className="py-3">
                <CardTitle className="text-sm text-gray-400">Trial Record</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs font-mono overflow-x-auto bg-black/50 p-3 rounded">
{JSON.stringify({
  id: trial.id,
  status: trial.status,
  trialType: trial.trialType,
  repoUrl: trial.repoUrl,
  createdAt: trial.createdAt,
  completedAt: trial.completedAt,
  hasLanistaPlan: !!trial.lanistaPlan,
  hasArbiterPlan: !!trial.arbiterPlan,
}, null, 2)}
                </pre>
              </CardContent>
            </Card>

            {/* Gladiators Raw Data */}
            <Card className="border-gray-700">
              <CardHeader className="py-3">
                <CardTitle className="text-sm text-gray-400">Gladiators ({gladiators.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs font-mono overflow-x-auto bg-black/50 p-3 rounded max-h-48 overflow-y-auto">
{JSON.stringify(gladiators, null, 2)}
                </pre>
              </CardContent>
            </Card>

            {/* Stream State */}
            <Card className="border-gray-700">
              <CardHeader className="py-3">
                <CardTitle className="text-sm text-gray-400">Stream State</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs font-mono overflow-x-auto bg-black/50 p-3 rounded">
{JSON.stringify({
  connected: stream.connected,
  error: stream.error,
  eventCount: stream.events.length,
  lastEvent: stream.lastEvent,
}, null, 2)}
                </pre>
              </CardContent>
            </Card>

            {/* All Events */}
            {stream.events.length > 0 && (
              <Card className="border-gray-700">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm text-gray-400">All Stream Events</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs font-mono overflow-x-auto bg-black/50 p-3 rounded max-h-64 overflow-y-auto">
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
