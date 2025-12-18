/**
 * Consul API Endpoint
 *
 * POST /api/trials/:id/consul - Stream Consul conversation responses
 * Uses container-based Consul with git tools for code battle trials.
 */

import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { decrees, gladiators, judges, trials, users, verdicts } from "@/db/schema";
import { decrypt } from "@/lib/encryption";
import { requireUser } from "@/lib/session";
import { createWordStreamResponse, streamTextToSSE } from "@/lib/streaming";
import { buildConsulGreeting } from "@/lib/trial/consul/prompts";
import { sendConsulMessage } from "@/lib/trial/consul/runner";

interface Message {
  role: "user" | "consul";
  content: string;
}

/**
 * POST - Send message to Consul and stream response
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id: trialId } = await params;
    const body = await request.json();
    const { message, history = [] } = body as {
      message: string;
      history?: Message[];
    };

    // Get the trial and verify ownership
    const [trial] = await db.select().from(trials).where(eq(trials.id, trialId)).limit(1);

    if (!trial) {
      return NextResponse.json({ error: "Trial not found" }, { status: 404 });
    }

    if (trial.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Load all trial data
    const trialGladiators = await db
      .select()
      .from(gladiators)
      .where(eq(gladiators.trialId, trialId));

    const trialJudges = await db.select().from(judges).where(eq(judges.trialId, trialId));

    const [verdict] = await db
      .select()
      .from(verdicts)
      .where(eq(verdicts.trialId, trialId))
      .limit(1);

    if (!verdict) {
      return NextResponse.json({ error: "No verdict found for this trial" }, { status: 400 });
    }

    // Build context for Consul
    const context = {
      trial: {
        id: trial.id,
        challengePrompt: trial.challengePrompt,
        repoUrl: trial.repoUrl,
        trialType: trial.trialType,
      },
      gladiators: trialGladiators.map((g) => ({
        id: g.id,
        name: g.name,
        persona: g.persona,
        responseContent: g.responseContent,
        branchName: g.branchName || "",
      })),
      judges: trialJudges.map((j) => ({
        id: j.id,
        name: j.name,
        focus: j.focus,
        evaluation: j.evaluation,
      })),
      verdict: {
        summary: verdict.summary,
        winnerGladiatorId: verdict.winnerGladiatorId,
        reasoning: verdict.reasoning,
      },
    };

    // Get user's Claude token
    const [dbUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

    if (!dbUser?.claudeToken) {
      return NextResponse.json({ error: "Claude token not configured" }, { status: 400 });
    }

    const claudeToken = decrypt(dbUser.claudeToken);

    // If this is initialization, return greeting with word-by-word streaming
    if (message === "__INIT__") {
      const greeting = buildConsulGreeting(context);
      const stream = createWordStreamResponse(greeting, 25);
      return new NextResponse(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Build conversation context for the prompt (include history)
    let conversationPrompt = message;
    if (history.length > 0) {
      conversationPrompt = `${history
        .map((msg: Message) => `${msg.role === "user" ? "User" : "Consul"}: ${msg.content}`)
        .join("\n\n")}\n\nUser: ${message}`;
    }

    // Stream response using container-based Consul with git tools
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullResponse = "";

          const result = await sendConsulMessage(
            trialId,
            conversationPrompt,
            context,
            user.id,
            claudeToken,
            async (event) => {
              // Handle assistant messages - extract text and stream
              if (event.event === "assistant") {
                const data = event.data as { content?: string };
                if (data.content) {
                  fullResponse += data.content;
                  // Re-chunk text word-by-word for smooth streaming display
                  await streamTextToSSE(controller, encoder, data.content, 15);
                }
              }
            },
          );

          if (!result.success) {
            throw new Error(result.error || "Consul failed to respond");
          }

          // Store the conversation in the decrees table
          await db.insert(decrees).values({
            trialId,
            actionType: "COMMENT",
            actionDetails: JSON.stringify({
              type: "consul_conversation",
              userMessage: message,
              consulResponse: fullResponse,
            }),
            consulConversation: JSON.stringify([
              ...history,
              { role: "user", content: message },
              { role: "consul", content: fullResponse },
            ]),
          });

          // Send completion signal
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          const errorData = JSON.stringify({
            type: "error",
            message: error instanceof Error ? error.message : "Failed to get response from Consul",
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process request" },
      { status: 500 },
    );
  }
}
