/**
 * Battle View Page
 *
 * Server component that loads trial data and renders the battle view.
 */

import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BattleView } from "@/components/trials/battle-view";
import { ResultsView } from "@/components/trials/results-view";
import { db } from "@/db";
import { gladiators, judges, trials, verdicts } from "@/db/schema";
import { requireUser } from "@/lib/session";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function TrialPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireUser();

  // Load trial data
  const [trial] = await db.select().from(trials).where(eq(trials.id, id)).limit(1);

  if (!trial) {
    notFound();
  }

  // Ensure user owns this trial
  if (trial.userId !== user.id) {
    notFound();
  }

  // Load gladiators
  const trialGladiators = await db
    .select()
    .from(gladiators)
    .where(eq(gladiators.trialId, trial.id));

  // Load verdict if exists
  const [verdict] = await db.select().from(verdicts).where(eq(verdicts.trialId, trial.id)).limit(1);

  // Load judges if trial is completed
  const trialJudges = await db.select().from(judges).where(eq(judges.trialId, trial.id));

  // Determine if we should show results view
  const isCompleted = trial.status === "COMPLETED" && verdict;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Trial Arena</h1>
          <p className="text-muted-foreground">{trial.trialType} Battle</p>
        </div>

        {isCompleted ? (
          <ResultsView
            trialId={trial.id}
            verdict={verdict}
            gladiators={trialGladiators}
            judges={trialJudges}
          />
        ) : (
          <BattleView
            trial={trial}
            gladiators={trialGladiators}
            judges={trialJudges}
            verdict={verdict || null}
          />
        )}
      </div>
    </div>
  );
}
