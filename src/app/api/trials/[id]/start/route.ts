/**
 * Start Trial Endpoint
 *
 * POST /api/trials/:id/start - Start the trial and kick off Lanista or Code Battle
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { db } from "@/db";
import { trials, repoSetups, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { transitionTrialState } from "@/lib/trial/state";
import { runCodeBattle } from "@/lib/trial/code-battle/orchestrator";
import { decrypt } from "@/lib/encryption";

/**
 * POST - Start a trial
 * Transitions from PENDING to lanista_designing (PLANNING) or starts code battle
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id: trialId } = await params;

    // Get the trial
    const [trial] = await db
      .select()
      .from(trials)
      .where(eq(trials.id, trialId))
      .limit(1);

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
        { status: 400 }
      );
    }

    // Check if this is a code battle (repo URL exists)
    if (trial.repoUrl) {
      // Check setup exists
      const setup = await db.query.repoSetups.findFirst({
        where: and(
          eq(repoSetups.userId, user.id),
          eq(repoSetups.repoUrl, trial.repoUrl)
        ),
      });

      if (!setup) {
        return NextResponse.json(
          { error: "Repo setup required. Run Setup Discovery first." },
          { status: 400 }
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
          { status: 400 }
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

    // Transition to lanista_designing state
    await transitionTrialState(trialId, "lanista_designing", {
      message: "Trial started - Lanista is designing the battle plan",
    });

    // TODO (Issue 5): Kick off Lanista agent in the background
    // This is just a placeholder for now
    // Future: startLanistaAgent(trialId, trial.repoUrl, trial.challengePrompt);

    return NextResponse.json({
      success: true,
      message: "Trial started successfully",
      trialId,
      status: "PLANNING",
    });
  } catch (error: any) {
    console.error("Error starting trial:", error);

    // Handle state transition errors specially
    if (error.message?.includes("Invalid state transition")) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to start trial" },
      { status: 500 }
    );
  }
}
