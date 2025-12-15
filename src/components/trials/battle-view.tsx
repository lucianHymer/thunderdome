/**
 * Battle View Component
 *
 * Main battle viewing interface with tabs for each gladiator,
 * status banner, and verdict display.
 */

'use client';

import { useTrialStream } from '@/hooks/use-trial-stream';
import { StatusBanner } from './status-banner';
import { GladiatorPanel } from './gladiator-panel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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

interface BattleViewProps {
  trial: {
    id: string;
    challengePrompt: string;
    status: string;
    trialType: string;
  };
  gladiators: Gladiator[];
  verdict?: Verdict | null;
}

export function BattleView({ trial, gladiators, verdict }: BattleViewProps) {
  const stream = useTrialStream(trial.id);

  // Use streamed status if available, otherwise use initial status
  // Extract status from the last event if available
  const currentStatus = (stream.lastEvent as any)?.trial?.status || trial.status;

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

      {/* Connection Status */}
      {!stream.connected && stream.error && (
        <div className="border border-red-500 bg-red-950/30 rounded-lg p-4 text-red-400">
          Connection Error: {stream.error}
        </div>
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
                  {gladiators.find(g => g.id === verdict.winnerGladiatorId)?.name || 'Unknown'}
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
    </div>
  );
}
