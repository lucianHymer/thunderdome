/**
 * New Trial Form Component
 *
 * Form for creating a new trial with challenge prompt and type selection.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export function NewTrialForm() {
  const router = useRouter();
  const [challengePrompt, setChallengePrompt] = useState('');
  const [trialType, setTrialType] = useState<'GLADIATOR' | 'LEGION'>('GLADIATOR');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!challengePrompt.trim()) {
      setError('Please enter a challenge prompt');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/trials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengePrompt,
          trialType,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create trial');
      }

      const { trialId } = await response.json();
      router.push(`/trials/${trialId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create trial');
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <Label htmlFor="challenge" className="text-lg font-semibold">
          Challenge Prompt
        </Label>
        <p className="text-sm text-muted-foreground mb-2">
          Describe the coding challenge for the AI gladiators to complete
        </p>
        <Textarea
          id="challenge"
          value={challengePrompt}
          onChange={(e) => setChallengePrompt(e.target.value)}
          placeholder="e.g., Implement a function that validates email addresses using regex..."
          className="min-h-[200px] font-mono"
          disabled={isSubmitting}
        />
      </div>

      <div>
        <Label className="text-lg font-semibold mb-2 block">Trial Type</Label>
        <RadioGroup value={trialType} onValueChange={(v) => setTrialType(v as 'GLADIATOR' | 'LEGION')}>
          <div className="flex items-start space-x-3 border border-border rounded-lg p-4">
            <RadioGroupItem value="GLADIATOR" id="gladiator" />
            <div className="flex-1">
              <Label htmlFor="gladiator" className="font-semibold cursor-pointer">
                ⚔️ Gladiator (Ideation)
              </Label>
              <p className="text-sm text-muted-foreground">
                Multiple AI agents compete to solve the same challenge. Best for exploring different approaches.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3 border border-border rounded-lg p-4 opacity-50">
            <RadioGroupItem value="LEGION" id="legion" disabled />
            <div className="flex-1">
              <Label htmlFor="legion" className="font-semibold">
                🏛️ Legion (Implementation)
              </Label>
              <p className="text-sm text-muted-foreground">
                AI agents collaborate in phases to implement a feature. Coming soon!
              </p>
            </div>
          </div>
        </RadioGroup>
      </div>

      {error && (
        <div className="border border-red-500 bg-red-950/30 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      <Button
        type="submit"
        disabled={isSubmitting || !challengePrompt.trim()}
        className="w-full bg-orange-600 hover:bg-orange-700"
        size="lg"
      >
        {isSubmitting ? 'Creating Trial...' : '⚔️ Start Battle'}
      </Button>
    </form>
  );
}
