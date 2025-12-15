/**
 * Resume Trial Endpoint
 *
 * POST /api/trials/:id/resume - Resume a stuck trial from where it left off
 */

import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { gladiators, trials, users } from "@/db/schema";
import { decrypt } from "@/lib/encryption";
import { requireUser } from "@/lib/session";
import { runArbiter } from "@/lib/trial/arbiter";
import { broadcastTrialUpdate } from "@/lib/trial/broadcast";
import { runGladiators } from "@/lib/trial/gladiators";
import { runLanista } from "@/lib/trial/lanista";

/**
 * POST - Resume a stuck trial
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

    // Get gladiators to check state
    const trialGladiators = await db
      .select()
      .from(gladiators)
      .where(eq(gladiators.trialId, trialId));

    const completedGladiators = trialGladiators.filter((g) => g.status === "COMPLETED");

    // Determine what to run based on current state
    let resumeFrom = "";

    if (trial.status === "PENDING") {
      resumeFrom = "lanista";
    } else if (trial.status === "PLANNING" && !trial.lanistaPlan) {
      resumeFrom = "lanista";
    } else if (trial.status === "PLANNING" || trial.status === "RUNNING") {
      if (trialGladiators.length === 0) {
        resumeFrom = "lanista";
      } else if (completedGladiators.length < trialGladiators.length) {
        resumeFrom = "gladiators";
      } else {
        resumeFrom = "arbiter";
      }
    } else if (trial.status === "JUDGING") {
      resumeFrom = "arbiter";
    } else if (trial.status === "COMPLETED") {
      return NextResponse.json({ error: "Trial already completed" }, { status: 400 });
    } else if (trial.status === "FAILED") {
      // Reset to appropriate state and resume
      if (trialGladiators.length === 0) {
        resumeFrom = "lanista";
      } else if (completedGladiators.length < trialGladiators.length) {
        resumeFrom = "gladiators";
      } else {
        resumeFrom = "arbiter";
      }
    }

    // Run in background
    (async () => {
      try {
        if (resumeFrom === "lanista") {
          await runLanista(trialId, claudeToken, (event) => {
            broadcastTrialUpdate(trialId, event);
          });
          await runGladiators(trialId, claudeToken);
          await runArbiter(trialId, claudeToken, (event) => {
            broadcastTrialUpdate(trialId, event);
          });
        } else if (resumeFrom === "gladiators") {
          await runGladiators(trialId, claudeToken);
          await runArbiter(trialId, claudeToken, (event) => {
            broadcastTrialUpdate(trialId, event);
          });
        } else if (resumeFrom === "arbiter") {
          await runArbiter(trialId, claudeToken, (event) => {
            broadcastTrialUpdate(trialId, event);
          });
        }
      } catch (error) {
        console.error("Trial resume failed:", error);
        broadcastTrialUpdate(trialId, {
          type: "error",
          data: { error: error instanceof Error ? error.message : "Unknown error" },
        });
      }
    })();

    return NextResponse.json({
      success: true,
      message: `Resuming trial from ${resumeFrom}`,
      resumeFrom,
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to resume trial" }, { status: 500 });
  }
}
