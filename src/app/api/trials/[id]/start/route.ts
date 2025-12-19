/**
 * Start Trial Endpoint
 *
 * POST /api/trials/:id/start - Start the trial and kick off Lanista or Code Battle
 */

import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { trials, users } from "@/db/schema";
import { decrypt } from "@/lib/encryption";
import { requireUser } from "@/lib/session";
import { runCodeBattle } from "@/lib/trial/code-battle/orchestrator";

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

    // All trials run in containers
    runCodeBattle(trial.id, user.id, claudeToken).catch((error) => {
      console.error(`[Trial ${trial.id}] Code battle error:`, error);
    });

    return NextResponse.json({
      success: true,
      status: "container_starting",
      message: trial.repoUrl ? "Starting code battle..." : "Starting trial...",
    });
  } catch (error: any) {
    // Handle state transition errors specially
    if (error.message?.includes("Invalid state transition")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to start trial" }, { status: 500 });
  }
}
