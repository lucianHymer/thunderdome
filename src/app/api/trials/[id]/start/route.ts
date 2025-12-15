/**
 * Start Trial Endpoint
 *
 * POST /api/trials/:id/start - Start the trial and kick off Lanista
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { db } from "@/db";
import { trials } from "@/db/schema";
import { eq } from "drizzle-orm";
import { transitionTrialState } from "@/lib/trial/state";

/**
 * POST - Start a trial
 * Transitions from PENDING to lanista_designing (PLANNING)
 * In the future, this will kick off the Lanista agent (Issue 5)
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
