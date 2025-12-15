/**
 * New Trial Page
 *
 * Protected page for creating new trials.
 * Redirects if not logged in or no Claude token.
 */

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { NewTrialForm } from "@/components/trials/new-trial-form";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/session";

export default async function NewTrialPage() {
  const user = await requireUser();

  // Check if user has Claude token
  const [userData] = await db.select().from(users).where(eq(users.id, user.id!)).limit(1);

  if (!userData?.claudeToken) {
    redirect("/settings");
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">Create New Trial</h1>
        <p className="text-muted-foreground mb-8">
          Set up a coding challenge and watch AI gladiators battle it out
        </p>

        <NewTrialForm />
      </div>
    </div>
  );
}
