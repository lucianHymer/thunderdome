/**
 * Single Trial API
 *
 * GET /api/trials/:id - Get trial with all related data
 * DELETE /api/trials/:id - Delete pending trials only
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { db } from "@/db";
import { trials, gladiators, judges, verdicts, decrees } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { closeTrialSubscriptions } from "@/lib/trial/broadcast";

/**
 * GET - Get a single trial with all related data
 */
export async function GET(
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

    // Get related gladiators
    const trialGladiators = await db
      .select()
      .from(gladiators)
      .where(eq(gladiators.trialId, trialId));

    // Get related judges
    const trialJudges = await db
      .select()
      .from(judges)
      .where(eq(judges.trialId, trialId));

    // Get verdict if exists
    const [verdict] = await db
      .select()
      .from(verdicts)
      .where(eq(verdicts.trialId, trialId))
      .limit(1);

    // Get decrees
    const trialDecrees = await db
      .select()
      .from(decrees)
      .where(eq(decrees.trialId, trialId));

    // Return complete trial data
    return NextResponse.json({
      trial: {
        ...trial,
        gladiators: trialGladiators,
        judges: trialJudges,
        verdict: verdict || null,
        decrees: trialDecrees,
      },
    });
  } catch (error) {
    console.error("Error getting trial:", error);
    return NextResponse.json(
      { error: "Failed to get trial" },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Delete a trial (only if PENDING)
 */
export async function DELETE(
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

    // Only allow deleting pending trials
    if (trial.status !== "PENDING") {
      return NextResponse.json(
        { error: "Can only delete pending trials" },
        { status: 400 }
      );
    }

    // Delete the trial (cascade will handle related records)
    await db.delete(trials).where(eq(trials.id, trialId));

    // Close any SSE subscriptions
    closeTrialSubscriptions(trialId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting trial:", error);
    return NextResponse.json(
      { error: "Failed to delete trial" },
      { status: 500 }
    );
  }
}
