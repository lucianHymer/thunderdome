/**
 * Trials CRUD API
 *
 * GET /api/trials - List user's trials
 * POST /api/trials - Create new trial
 */

import { desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { trials } from "@/db/schema";
import { requireUser } from "@/lib/session";

/**
 * GET - List all trials for the current user
 */
export async function GET() {
  try {
    const user = await requireUser();

    // Get all trials for this user with related data
    const userTrials = await db
      .select({
        id: trials.id,
        userId: trials.userId,
        repoUrl: trials.repoUrl,
        challengePrompt: trials.challengePrompt,
        trialType: trials.trialType,
        status: trials.status,
        createdAt: trials.createdAt,
        completedAt: trials.completedAt,
      })
      .from(trials)
      .where(eq(trials.userId, user.id))
      .orderBy(desc(trials.createdAt));

    return NextResponse.json({ trials: userTrials });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to list trials" }, { status: 500 });
  }
}

/**
 * POST - Create a new trial
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

    const body = await request.json();
    const { repoUrl, challengePrompt, trialType } = body;

    // Validate required fields
    if (!repoUrl || typeof repoUrl !== "string") {
      return NextResponse.json({ error: "repoUrl is required" }, { status: 400 });
    }

    if (!challengePrompt || typeof challengePrompt !== "string") {
      return NextResponse.json({ error: "challengePrompt is required" }, { status: 400 });
    }

    if (!trialType || !["GLADIATOR", "LEGION"].includes(trialType)) {
      return NextResponse.json({ error: "trialType must be GLADIATOR or LEGION" }, { status: 400 });
    }

    // Create the trial
    const [newTrial] = await db
      .insert(trials)
      .values({
        userId: user.id,
        repoUrl,
        challengePrompt,
        trialType,
        status: "PENDING",
      })
      .returning();

    return NextResponse.json(
      {
        trial: {
          id: newTrial.id,
          userId: newTrial.userId,
          repoUrl: newTrial.repoUrl,
          challengePrompt: newTrial.challengePrompt,
          trialType: newTrial.trialType,
          status: newTrial.status,
          createdAt: newTrial.createdAt,
          completedAt: newTrial.completedAt,
        },
      },
      { status: 201 },
    );
  } catch (_error) {
    return NextResponse.json({ error: "Failed to create trial" }, { status: 500 });
  }
}
