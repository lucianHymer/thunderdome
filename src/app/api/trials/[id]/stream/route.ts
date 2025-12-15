/**
 * SSE Stream Endpoint
 *
 * GET /api/trials/:id/stream - Server-sent events endpoint for trial updates
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { db } from "@/db";
import { trials } from "@/db/schema";
import { eq } from "drizzle-orm";
import { subscribeToTrial } from "@/lib/trial/broadcast";

/**
 * GET - Stream trial updates via Server-Sent Events
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id: trialId } = await params;

    // Get the trial and verify ownership
    const [trial] = await db
      .select()
      .from(trials)
      .where(eq(trials.id, trialId))
      .limit(1);

    if (!trial) {
      return NextResponse.json({ error: "Trial not found" }, { status: 404 });
    }

    if (trial.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Create the SSE stream
    const stream = subscribeToTrial(trialId, user.id);

    // Send initial state immediately
    const encoder = new TextEncoder();
    const initialData = JSON.stringify({
      type: "initial_state",
      trial: {
        id: trial.id,
        status: trial.status,
        repoUrl: trial.repoUrl,
        challengePrompt: trial.challengePrompt,
        trialType: trial.trialType,
        createdAt: trial.createdAt?.toISOString(),
        completedAt: trial.completedAt?.toISOString(),
      },
      timestamp: new Date().toISOString(),
    });

    // Combine initial state with subscription stream
    const combinedStream = new ReadableStream({
      async start(controller) {
        // Send initial state
        controller.enqueue(encoder.encode(`data: ${initialData}\n\n`));

        // Pipe the subscription stream
        const reader = stream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch (error) {
          console.error("Stream error:", error);
        } finally {
          controller.close();
        }
      },
    });

    // Return SSE response
    return new NextResponse(combinedStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error creating SSE stream:", error);
    return NextResponse.json(
      { error: "Failed to create stream" },
      { status: 500 }
    );
  }
}
