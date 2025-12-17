/**
 * Interactive Agent Session API
 *
 * POST /api/agent/session - Manage interactive Claude sessions
 *
 * Actions:
 * - start: Create a new session and send initial prompt
 * - send: Send a message to an existing session
 * - stop: Close a session
 */

import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  closeSession,
  createInteractiveSession,
  getSession,
  processSDKMessage,
  type InteractiveSessionConfig,
} from "@/lib/claude/interactive-session";
import { decrypt } from "@/lib/encryption";
import { requireUser } from "@/lib/session";

interface StartAction {
  action: "start";
  prompt: string;
  config?: Partial<InteractiveSessionConfig>;
}

interface SendAction {
  action: "send";
  sessionId: string;
  message: string;
}

interface StopAction {
  action: "stop";
  sessionId: string;
}

type RequestBody = StartAction | SendAction | StopAction;

/**
 * Create SSE stream response
 */
function createSSEResponse(stream: ReadableStream): NextResponse {
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * Send SSE event
 */
function sendSSE(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  event: any,
) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
}

/**
 * POST - Handle session actions
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as RequestBody;

    // Get user's Claude token
    const [dbUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

    if (!dbUser?.claudeToken) {
      return NextResponse.json(
        { error: "Claude API token not configured. Please set it in settings." },
        { status: 401 },
      );
    }

    const claudeToken = decrypt(dbUser.claudeToken);

    switch (body.action) {
      case "start":
        return handleStart(body, claudeToken);

      case "send":
        return handleSend(body, claudeToken);

      case "stop":
        return handleStop(body);

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("[Agent Session API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/**
 * Handle starting a new session
 */
async function handleStart(body: StartAction, claudeToken: string) {
  const { prompt, config = {} } = body;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Create session
        const { sessionId, session } = await createInteractiveSession(
          config as InteractiveSessionConfig,
          claudeToken,
        );

        // Send session ID to client
        sendSSE(controller, encoder, {
          type: "session_created",
          sessionId,
        });

        // Set OAuth token for this request
        const originalToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
        process.env.CLAUDE_CODE_OAUTH_TOKEN = claudeToken;

        try {
          // Send initial prompt
          await session.send(prompt);

          // Stream responses
          for await (const message of session.receive()) {
            const processed = processSDKMessage(message);
            if (processed) {
              sendSSE(controller, encoder, processed);
            }

            // Check if result - session complete
            if (message.type === "result") {
              break;
            }
          }
        } finally {
          // Restore token
          if (originalToken) {
            process.env.CLAUDE_CODE_OAUTH_TOKEN = originalToken;
          } else {
            delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
          }
        }

        sendSSE(controller, encoder, { type: "done" });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        console.error("[Agent Session] Stream error:", error);
        sendSSE(controller, encoder, {
          type: "error",
          content: {
            message: error instanceof Error ? error.message : "Unknown error",
          },
        });
        controller.close();
      }
    },
  });

  return createSSEResponse(stream);
}

/**
 * Handle sending a message to existing session
 */
async function handleSend(body: SendAction, claudeToken: string) {
  const { sessionId, message } = body;

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found or expired" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Set OAuth token for this request
        const originalToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
        process.env.CLAUDE_CODE_OAUTH_TOKEN = claudeToken;

        try {
          // Send message
          await session.send(message);

          // Stream responses
          for await (const sdkMessage of session.receive()) {
            const processed = processSDKMessage(sdkMessage);
            if (processed) {
              sendSSE(controller, encoder, processed);
            }

            // Check if result - turn complete
            if (sdkMessage.type === "result") {
              break;
            }
          }
        } finally {
          // Restore token
          if (originalToken) {
            process.env.CLAUDE_CODE_OAUTH_TOKEN = originalToken;
          } else {
            delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
          }
        }

        sendSSE(controller, encoder, { type: "done" });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        console.error("[Agent Session] Send error:", error);
        sendSSE(controller, encoder, {
          type: "error",
          content: {
            message: error instanceof Error ? error.message : "Unknown error",
          },
        });
        controller.close();
      }
    },
  });

  return createSSEResponse(stream);
}

/**
 * Handle stopping a session
 */
async function handleStop(body: StopAction) {
  const { sessionId } = body;
  closeSession(sessionId);
  return NextResponse.json({ success: true });
}
