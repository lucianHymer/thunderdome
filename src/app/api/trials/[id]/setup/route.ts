/**
 * Interactive Setup Discovery API
 *
 * POST /api/trials/:id/setup - Send messages to setup discovery session
 *
 * Actions:
 * - message: "__INIT__" - Start session and get initial exploration
 * - message: "user text" - Send user response to agent
 * - message: "__FINALIZE__" - Parse and save setup files from conversation
 */

import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { trials, users } from "@/db/schema";
import { decrypt } from "@/lib/encryption";
import { requireUser } from "@/lib/session";
import {
  commitSetupFiles,
  endSetupSession,
  extractSetupFiles,
  finalizeSetup,
  sendSetupMessage,
} from "@/lib/setup/runner";
import { streamTextToSSE } from "@/lib/streaming";
import { broadcastTrialUpdate } from "@/lib/trial/broadcast";
import { continueAfterSetup } from "@/lib/trial/code-battle/orchestrator";

interface Message {
  role: "user" | "assistant";
  content: string;
}

/**
 * POST - Send message to setup discovery session
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
    const trial = await db.query.trials.findFirst({
      where: eq(trials.id, trialId),
    });

    if (!trial) {
      return NextResponse.json({ error: "Trial not found" }, { status: 404 });
    }

    if (trial.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!trial.repoUrl) {
      return NextResponse.json({ error: "Trial has no repository URL" }, { status: 400 });
    }

    // Get user's Claude token
    const [dbUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

    if (!dbUser?.claudeToken) {
      return NextResponse.json({ error: "Claude token not configured" }, { status: 400 });
    }

    const claudeToken = decrypt(dbUser.claudeToken);

    // Handle finalize action - extract setup files using structured output
    if (message === "__FINALIZE__") {
      // Build conversation summary from history
      const conversationSummary = history
        .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
        .join("\n\n");

      // Extract setup files using structured output
      const extractResult = await extractSetupFiles(trialId, conversationSummary, claudeToken);

      if (!extractResult.success || !extractResult.files) {
        return NextResponse.json(
          {
            error: extractResult.error || "Failed to extract setup files from conversation.",
          },
          { status: 400 },
        );
      }

      // Write files to container
      const writeResult = await finalizeSetup(
        trialId,
        extractResult.files.setup_md,
        extractResult.files.setup_sh,
      );

      if (!writeResult.success) {
        return NextResponse.json({ error: writeResult.error }, { status: 500 });
      }

      // Commit and push setup files to repo
      await broadcastTrialUpdate(trialId, {
        type: "container_status",
        status: "committing",
        message: "Committing setup files to repository...",
      });

      const commitResult = await commitSetupFiles(trialId);

      if (!commitResult.success) {
        return NextResponse.json(
          { error: `Failed to commit setup files: ${commitResult.error}` },
          { status: 500 },
        );
      }

      // Broadcast that setup is complete
      await broadcastTrialUpdate(trialId, {
        type: "setup_complete",
        message: "Setup files committed to repository",
      });

      // Continue the battle (runs setup script, then gladiators, etc.)
      // This runs in the background - don't await
      continueAfterSetup(trialId, claudeToken).catch((error) => {
        broadcastTrialUpdate(trialId, {
          type: "error",
          phase: "setup",
          message: error instanceof Error ? error.message : "Failed to continue after setup",
        });
      });

      return NextResponse.json({
        success: true,
        message: "Setup files committed. Battle continuing...",
      });
    }

    // Handle cancel action
    if (message === "__CANCEL__") {
      await endSetupSession(trialId);
      return NextResponse.json({ success: true, message: "Setup session cancelled" });
    }

    // Build conversation context for follow-up messages
    let conversationPrompt = message;
    if (message !== "__INIT__" && history.length > 0) {
      conversationPrompt = `${history
        .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
        .join("\n\n")}\n\nUser: ${message}`;
    }

    // For __INIT__, just use empty string - runner will send the initial prompt
    if (message === "__INIT__") {
      conversationPrompt = "";
    }

    // Stream response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullResponse = "";

          const result = await sendSetupMessage(
            trialId,
            conversationPrompt,
            trial.repoUrl!,
            claudeToken,
            async (event) => {
              // Handle assistant messages - stream text
              if (event.event === "assistant") {
                const data = event.data as { content?: string };
                if (data.content) {
                  fullResponse += data.content;
                  await streamTextToSSE(controller, encoder, data.content, 10);
                }
              }

              // Handle tool use events - show what the agent is doing
              if (event.event === "tool_use") {
                const data = event.data as { tool?: string; input?: unknown };
                if (data.tool) {
                  const toolMsg = `\n[Using ${data.tool}...]\n`;
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ text: toolMsg })}\n\n`),
                  );
                }
              }
            },
          );

          if (!result.success) {
            throw new Error(result.error || "Setup discovery failed");
          }

          // Send completion signal
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          const errorData = JSON.stringify({
            type: "error",
            message: error instanceof Error ? error.message : "Failed to get response",
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
