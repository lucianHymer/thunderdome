/**
 * Consul API Endpoint
 *
 * POST /api/trials/:id/consul - Stream Consul conversation responses
 */

import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { decrees, gladiators, judges, trials, users, verdicts } from "@/db/schema";
import { runAgent } from "@/lib/claude/agent";
import { decrypt } from "@/lib/encryption";
import { requireUser } from "@/lib/session";
import {
  buildConsulContext,
  buildConsulGreeting,
  buildConsulSystemPrompt,
} from "@/lib/trial/consul/prompts";

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

    // Build context
    const context = {
      trial: {
        id: trial.id,
        challengePrompt: trial.challengePrompt,
        repoUrl: trial.repoUrl,
        trialType: trial.trialType,
      },
      gladiators: trialGladiators,
      judges: trialJudges,
      verdict,
    };

    const systemPrompt = buildConsulSystemPrompt(context);
    const trialContext = buildConsulContext(context);

    // Get user's Claude token
    const [dbUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

    if (!dbUser?.claudeToken) {
      return NextResponse.json({ error: "Claude token not configured" }, { status: 400 });
    }

    const claudeToken = decrypt(dbUser.claudeToken);

    // If this is initialization, return greeting
    if (message === "__INIT__") {
      const greeting = buildConsulGreeting(context);
      return createStreamResponse(greeting);
    }

    // Build conversation context for the prompt
    let conversationPrompt = message;
    if (history.length > 0) {
      conversationPrompt = `${history
        .map((msg: Message) => `${msg.role === "user" ? "User" : "Consul"}: ${msg.content}`)
        .join("\n\n")}\n\nUser: ${message}`;
    }

    // Stream response using shared agent runner
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullResponse = "";

          // Use the shared runAgent which handles CLI path and auth token
          const agentStream = runAgent(
            conversationPrompt,
            {
              systemPrompt: `${systemPrompt}\n\n# Trial Context\n${trialContext}`,
              model: "sonnet",
              maxTurns: 5,
              allowedTools: [], // No tools for Consul
            },
            claudeToken,
          );

          for await (const event of agentStream) {
            console.log("[Consul] Event type:", event.type);

            // Handle assistant messages - extract text from the message object
            if (event.type === "assistant") {
              const msg = event.content as any;
              // The content is a message object with content array
              const textContent = msg?.content?.find((c: any) => c.type === "text");
              const text = textContent?.text;
              if (text) {
                fullResponse += text;
                const data = JSON.stringify({
                  type: "content",
                  text,
                });
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              }
            } else if (event.type === "result") {
              const resultMsg = event.content as any;
              console.log("[Consul] Result keys:", Object.keys(resultMsg || {}));
              console.log("[Consul] Result.result:", resultMsg?.result);
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
            }
          }

          // Send completion signal
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          console.error("[Consul API] Stream error:", error);
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
    console.error("[Consul API] Request error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process request" },
      { status: 500 },
    );
  }
}

/**
 * Helper to create a simple streaming response for pre-generated text
 */
function createStreamResponse(text: string): NextResponse {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Stream the text character by character for a typing effect
      let index = 0;
      const interval = setInterval(() => {
        if (index < text.length) {
          const char = text[index];
          const data = JSON.stringify({
            type: "content",
            text: char,
          });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          index++;
        } else {
          clearInterval(interval);
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      }, 10); // 10ms per character for smooth typing effect
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
