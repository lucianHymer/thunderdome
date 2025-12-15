/**
 * Gladiator Panel Component
 *
 * Shows streaming output from a gladiator.
 * Displays winner badge if applicable.
 */

'use client';

import { useGladiatorStream } from '@/hooks/use-gladiator-stream';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEffect, useRef } from 'react';

interface GladiatorPanelProps {
  gladiator: {
    id: string;
    name: string;
    persona: string;
    status: string;
  };
  isWinner?: boolean;
}

const statusDots = {
  PENDING: '⚪',
  RUNNING: '🟡',
  COMPLETED: '🟢',
  FAILED: '🔴',
};

export function GladiatorPanel({ gladiator, isWinner }: GladiatorPanelProps) {
  const stream = useGladiatorStream(gladiator.id);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [stream.output]);

  const statusDot = statusDots[gladiator.status as keyof typeof statusDots] || '⚪';

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span>{statusDot}</span>
          <h3 className="text-lg font-semibold">{gladiator.name}</h3>
          {isWinner && (
            <Badge className="bg-yellow-500 text-black">
              👑 Winner
            </Badge>
          )}
        </div>
        {stream.isStreaming && (
          <span className="text-sm text-orange-400 animate-pulse">Streaming...</span>
        )}
      </div>

      <p className="text-sm text-muted-foreground mb-4">{gladiator.persona}</p>

      <ScrollArea className="flex-1 border border-border rounded-lg bg-black/20">
        <div ref={scrollRef} className="p-4 font-mono text-sm whitespace-pre-wrap">
          {stream.output || (
            <span className="text-muted-foreground">Waiting for gladiator to begin...</span>
          )}
          {stream.error && (
            <div className="text-red-400 mt-4">
              Error: {stream.error}
            </div>
          )}
        </div>
      </ScrollArea>

      {stream.isComplete && (
        <div className="mt-4 text-sm text-green-400">
          ✓ Gladiator has completed their challenge
        </div>
      )}
    </div>
  );
}
