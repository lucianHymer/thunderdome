/**
 * Consul API Endpoint
 *
 * POST /api/trials/:id/consul - Stream Consul conversation responses
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { decrees, gladiators, judges, trials, users, verdicts } from "@/db/schema";
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

    // Set up authentication token
    const originalToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = claudeToken;

    // Stream response from Claude
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullResponse = "";

          const agentStream = query({
            prompt: conversationPrompt,
            options: {
              systemPrompt: `${systemPrompt}\n\n# Trial Context\n${trialContext}`,
              model: "sonnet",
              maxTurns: 5,
              allowedTools: [], // No tools for Consul
            },
          });

          for await (const event of agentStream) {
            if (event.type === "stream_event") {
              const streamEvent = event.event;

              // Handle content block delta for streaming text
              if (
                streamEvent.type === "content_block_delta" &&
                streamEvent.delta?.type === "text_delta"
              ) {
                const text = streamEvent.delta.text;
                fullResponse += text;

                const data = JSON.stringify({
                  type: "content",
                  text,
                });
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              }
            } else if (event.type === "result") {
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
        } catch (_error) {
          const errorData = JSON.stringify({
            type: "error",
            message: "Failed to get response from Consul",
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
        } finally {
          // Restore original token
          if (originalToken) {
            process.env.CLAUDE_CODE_OAUTH_TOKEN = originalToken;
          } else {
            delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
          }
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
  } catch (_error) {
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
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
