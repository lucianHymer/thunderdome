/**
 * Trial Card Component
 *
 * Shows challenge preview, status badge, and trial type.
 * Clickable to navigate to battle view.
 */

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface TrialCardProps {
  trial: {
    id: string;
    challengePrompt: string;
    trialType: string;
    status: string;
    createdAt: Date;
  };
}

const statusColors = {
  PENDING: 'bg-gray-500',
  PLANNING: 'bg-yellow-500',
  RUNNING: 'bg-orange-500',
  JUDGING: 'bg-purple-500',
  COMPLETED: 'bg-green-500',
  FAILED: 'bg-red-500',
};

const statusLabels = {
  PENDING: 'Pending',
  PLANNING: 'Planning',
  RUNNING: 'Battling',
  JUDGING: 'Judging',
  COMPLETED: 'Complete',
  FAILED: 'Failed',
};

const trialTypeEmoji = {
  GLADIATOR: '⚔️',
  LEGION: '🏛️',
};

export function TrialCard({ trial }: TrialCardProps) {
  const statusColor = statusColors[trial.status as keyof typeof statusColors] || 'bg-gray-500';
  const statusLabel = statusLabels[trial.status as keyof typeof statusLabels] || trial.status;
  const typeEmoji = trialTypeEmoji[trial.trialType as keyof typeof trialTypeEmoji] || '⚔️';

  // Truncate challenge prompt for preview
  const preview =
    trial.challengePrompt.length > 150
      ? trial.challengePrompt.slice(0, 150) + '...'
      : trial.challengePrompt;

  return (
    <Link href={`/trials/${trial.id}`}>
      <Card className="hover:border-orange-500/50 transition-colors cursor-pointer">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <span>{typeEmoji}</span>
              <span className="text-muted-foreground text-sm">
                {trial.trialType.toLowerCase()} trial
              </span>
            </CardTitle>
            <Badge className={`${statusColor} text-white`}>{statusLabel}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-2">{preview}</p>
          <p className="text-xs text-muted-foreground">
            Created {new Date(trial.createdAt).toLocaleDateString()}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
