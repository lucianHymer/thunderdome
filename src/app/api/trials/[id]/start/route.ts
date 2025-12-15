/**
 * Start Trial Endpoint
 *
 * POST /api/trials/:id/start - Start the trial and kick off Lanista or Code Battle
 */

import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { repoSetups, trials, users } from "@/db/schema";
import { decrypt } from "@/lib/encryption";
import { requireUser } from "@/lib/session";
import { runCodeBattle } from "@/lib/trial/code-battle/orchestrator";
import { runLanista } from "@/lib/trial/lanista";
import { runGladiators } from "@/lib/trial/gladiators";
import { runArbiter } from "@/lib/trial/arbiter";
import { broadcastTrialUpdate } from "@/lib/trial/broadcast";

/**
 * POST - Start a trial
 * Transitions from PENDING to lanista_designing (PLANNING) or starts code battle
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id: trialId } = await params;

    // Get the trial
    const [trial] = await db.select().from(trials).where(eq(trials.id, trialId)).limit(1);

    if (!trial) {
      return NextResponse.json({ error: "Trial not found" }, { status: 404 });
    }

    // Check ownership
    if (trial.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify trial is in PENDING state
    if (trial.status !== "PENDING") {
      return NextResponse.json(
        { error: `Trial is not pending (current status: ${trial.status})` },
        { status: 400 },
      );
    }

    // Check if this is a code battle (repo URL exists)
    if (trial.repoUrl) {
      // Check setup exists
      const setup = await db.query.repoSetups.findFirst({
        where: and(eq(repoSetups.userId, user.id), eq(repoSetups.repoUrl, trial.repoUrl)),
      });

      if (!setup) {
        return NextResponse.json(
          { error: "Repo setup required. Run Setup Discovery first." },
          { status: 400 },
        );
      }

      // Get full user record from database for tokens
      const dbUser = await db.query.users.findFirst({
        where: eq(users.id, user.id),
      });

      // Get Claude token
      if (!dbUser?.claudeToken) {
        return NextResponse.json(
          { error: "Claude token required. Configure in settings." },
          { status: 400 },
        );
      }

      const claudeToken = decrypt(dbUser.claudeToken);

      // Run code battle in background
      runCodeBattle(trial.id, user.id, claudeToken).catch(console.error);

      return NextResponse.json({
        success: true,
        status: "container_starting",
        message: "Code battle starting...",
      });
    }

    // Get user's Claude token
    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, user.id),
    });

    if (!dbUser?.claudeToken) {
      return NextResponse.json(
        { error: "Claude token required. Configure in settings." },
        { status: 400 },
      );
    }

    const claudeToken = decrypt(dbUser.claudeToken);

    // Run Lanista and gladiators in background
    (async () => {
      try {
        // Run Lanista to design gladiators
        await runLanista(trialId, claudeToken, (event) => {
          broadcastTrialUpdate(trialId, event);
        });

        // Run gladiators in parallel
        await runGladiators(trialId, claudeToken);

        // Run Arbiter to design judges and evaluate (includes running judges)
        await runArbiter(trialId, claudeToken, (event) => {
          broadcastTrialUpdate(trialId, event);
        });
      } catch (error) {
        console.error("Trial execution failed:", error);
        broadcastTrialUpdate(trialId, {
          type: "error",
          data: { error: error instanceof Error ? error.message : "Unknown error" },
        });
      }
    })();

    return NextResponse.json({
      success: true,
      message: "Trial started successfully",
      trialId,
      status: "PLANNING",
    });
  } catch (error: any) {
    // Handle state transition errors specially
    if (error.message?.includes("Invalid state transition")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to start trial" }, { status: 500 });
  }
}
