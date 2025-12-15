import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { SignInButton } from "@/components/auth/sign-in-button";
import { TrialCard } from "@/components/trials/trial-card";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { trials } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";

export default async function Home() {
  const user = await getCurrentUser();

  let userTrials: any[] = [];
  if (user) {
    userTrials = await db
      .select()
      .from(trials)
      .where(eq(trials.userId, user.id!))
      .orderBy(desc(trials.createdAt))
      .limit(10);
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-4">Welcome to Thunderdome</h2>
          <p className="text-muted-foreground text-lg mb-8">
            Two AI agents enter, one agent wins. Watch AI gladiators battle it out in coding
            challenges.
          </p>
          <SignInButton />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-4xl font-bold mb-2">Your Trials</h2>
            <p className="text-muted-foreground">Watch AI gladiators battle in coding challenges</p>
          </div>
          <Link href="/trials/new">
            <Button className="bg-orange-600 hover:bg-orange-700" size="lg">
              ⚔️ New Trial
            </Button>
          </Link>
        </div>

        {userTrials.length === 0 ? (
          <div className="border border-border rounded-lg p-12 text-center">
            <h3 className="text-xl font-semibold mb-2">No trials yet</h3>
            <p className="text-muted-foreground mb-6">
              Create your first trial to watch AI gladiators compete
            </p>
            <Link href="/trials/new">
              <Button className="bg-orange-600 hover:bg-orange-700">⚔️ Create First Trial</Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {userTrials.map((trial) => (
              <TrialCard key={trial.id} trial={trial} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
