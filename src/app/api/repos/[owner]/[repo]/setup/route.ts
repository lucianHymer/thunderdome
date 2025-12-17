/**
 * Setup Discovery API
 *
 * GET /api/repos/:owner/:repo/setup - Check if setup exists
 * POST /api/repos/:owner/:repo/setup - Interactive setup discovery
 *
 * Supports actions:
 * - action: "start" - Clone repo and start interactive session
 * - action: "send" - Send message to existing session
 * - action: "stop" - Close session and cleanup
 */

import { exec } from "child_process";
import { mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import {
  query,
  type Query,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { repoSetups, users } from "@/db/schema";
import { decrypt } from "@/lib/encryption";
import { checkRepoAccess, getInstallationToken } from "@/lib/github/app";
import { requireUser } from "@/lib/session";
import { SETUP_DISCOVERY_SYSTEM_PROMPT } from "@/lib/setup/prompts";

const execAsync = promisify(exec);

const CLAUDE_CLI_PATH =
  process.env.CLAUDE_CLI_PATH || `${process.env.HOME}/.local/bin/claude`;

/**
 * Active setup sessions with their temp directories
 */
interface SetupSession {
  tempDir: string;
  workingDir: string;
  repoUrl: string;
  owner: string;
  repo: string;
  userId: string;
  claudeToken: string;
  createdAt: Date;
  lastActivityAt: Date;
  sdkSessionId: string | null; // Session ID from the SDK for resume
}

const activeSessions = new Map<string, SetupSession>();

// Clean up stale sessions every 5 minutes
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, data] of activeSessions.entries()) {
    if (now - data.lastActivityAt.getTime() > SESSION_TIMEOUT_MS) {
      console.log(`[Setup Session] Cleaning up stale session: ${id}`);
      cleanupSession(id);
    }
  }
}, 5 * 60 * 1000);

/**
 * Cleanup a session and its temp directory
 */
async function cleanupSession(sessionId: string) {
  const data = activeSessions.get(sessionId);
  if (data) {
    try {
      await rm(data.tempDir, { recursive: true, force: true });
    } catch {}
    activeSessions.delete(sessionId);
  }
}

/**
 * Process SDK message into streamable format
 */
function processSDKMessage(message: SDKMessage): any | null {
  const timestamp = new Date();

  switch (message.type) {
    case "system":
      if (message.subtype === "init") {
        return {
          type: "init",
          content: {
            model: message.model,
            tools: message.tools,
            cwd: message.cwd,
          },
          timestamp,
        };
      }
      return null;

    case "assistant": {
      const content = message.message.content;
      const textBlocks: string[] = [];
      const toolUses: any[] = [];

      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text") {
            textBlocks.push(block.text);
          } else if (block.type === "tool_use") {
            toolUses.push({
              id: block.id,
              name: block.name,
              input: block.input,
            });
          }
        }
      }

      return {
        type: "assistant",
        content: {
          text: textBlocks.join("\n"),
          toolUses,
        },
        timestamp,
        messageId: message.uuid,
      };
    }

    case "user":
      return {
        type: "user",
        content: message.message,
        timestamp,
        messageId: message.uuid,
      };

    case "stream_event":
      if (message.event?.type === "content_block_delta") {
        const delta = message.event.delta as any;
        if (delta?.type === "thinking_delta") {
          return {
            type: "thinking",
            content: { text: delta.thinking },
            timestamp,
          };
        } else if (delta?.type === "text_delta") {
          return {
            type: "assistant",
            content: { text: delta.text, partial: true },
            timestamp,
          };
        }
      }
      return null;

    case "result":
      return {
        type: "result",
        content: {
          success: message.subtype === "success",
          result: message.subtype === "success" ? (message as any).result : undefined,
          error: message.subtype !== "success" ? (message as any).errors?.join(", ") : undefined,
          cost: {
            totalUsd: message.total_cost_usd,
            inputTokens: message.usage.input_tokens,
            outputTokens: message.usage.output_tokens,
          },
          turns: message.num_turns,
        },
        timestamp,
        messageId: message.uuid,
      };

    default:
      return null;
  }
}

/**
 * Create SSE response helper
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
 * Send SSE event helper
 */
function sendSSE(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  event: any,
) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
}

/**
 * GET - Check if setup exists for a repository
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  try {
    const _user = await requireUser();
    const { owner, repo } = await params;
    const repoUrl = `https://github.com/${owner}/${repo}`;

    const setup = await db.query.repoSetups.findFirst({
      where: eq(repoSetups.repoUrl, repoUrl),
    });

    if (!setup) {
      return NextResponse.json({ exists: false });
    }

    return NextResponse.json({
      exists: true,
      setup: {
        id: setup.id,
        repoUrl: setup.repoUrl,
        setupMd: setup.setupMd,
        setupSh: setup.setupSh,
        createdAt: setup.createdAt?.toISOString(),
        updatedAt: setup.updatedAt?.toISOString(),
      },
    });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to check setup" }, { status: 500 });
  }
}

/**
 * POST - Interactive setup discovery
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  try {
    const user = await requireUser();
    const { owner, repo } = await params;
    const repoUrl = `https://github.com/${owner}/${repo}`;
    const repoFullName = `${owner}/${repo}`;

    const body = await request.json().catch(() => ({}));
    const { action = "start", sessionId, message, guidance, force = false } = body;

    // Get user's Claude token
    const [dbUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

    if (!dbUser?.claudeToken) {
      return NextResponse.json(
        { error: "Claude API token not configured. Please set it in settings." },
        { status: 401 },
      );
    }

    const claudeToken = decrypt(dbUser.claudeToken);

    switch (action) {
      case "start":
        return handleStart({
          user,
          owner,
          repo,
          repoUrl,
          repoFullName,
          claudeToken,
          guidance,
          force,
        });

      case "send":
        return handleSend({ sessionId, message, claudeToken });

      case "stop":
        return handleStop({ sessionId });

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("[Setup Discovery] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/**
 * Handle starting a new setup discovery session
 */
async function handleStart({
  user,
  owner,
  repo,
  repoUrl,
  repoFullName,
  claudeToken,
  guidance,
  force,
}: {
  user: { id: string };
  owner: string;
  repo: string;
  repoUrl: string;
  repoFullName: string;
  claudeToken: string;
  guidance?: string;
  force: boolean;
}) {
  // Check if setup already exists (unless force is true)
  if (!force) {
    const existingSetup = await db.query.repoSetups.findFirst({
      where: eq(repoSetups.repoUrl, repoUrl),
    });

    if (existingSetup) {
      return NextResponse.json(
        { error: "Setup already exists. Use force=true to re-run discovery." },
        { status: 409 },
      );
    }
  }

  // Check GitHub App access
  console.log("[Setup Discovery] Checking GitHub App access...");
  const accessResult = await checkRepoAccess(repoFullName, user.id);

  if (!accessResult.hasAccess) {
    console.log("[Setup Discovery] No access:", accessResult.reason);

    if (accessResult.reason === "no_installation") {
      return NextResponse.json(
        {
          error: "GitHub App not installed",
          message: "Connect your GitHub account to use Code Battles.",
          action: "Install GitHub App",
          actionUrl: "https://github.com/apps/the-thunderdome-app/installations/new",
        },
        { status: 403 },
      );
    } else {
      return NextResponse.json(
        {
          error: "Repository not connected",
          message: `Add "${repoFullName}" to your GitHub App installation.`,
          action: "Manage Repository Access",
          actionUrl: `https://github.com/settings/installations/${accessResult.installationId}`,
        },
        { status: 403 },
      );
    }
  }

  // Get token for cloning
  const tokenResult = await getInstallationToken(accessResult.installationId, [repo]);
  console.log("[Setup Discovery] GitHub token retrieved");

  // Create temp directory and clone repo
  const tempDir = join(tmpdir(), `thunderdome-setup-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });
  console.log(`[Setup Discovery] Created temp dir: ${tempDir}`);

  const workingDir = join(tempDir, repo);

  try {
    console.log(`[Setup Discovery] Cloning to ${workingDir}...`);
    const cloneUrl = `https://x-access-token:${tokenResult.token}@github.com/${repoFullName}.git`;
    await execAsync(`git clone --depth 1 "${cloneUrl}" "${workingDir}"`, {
      timeout: 60000,
    });
    console.log("[Setup Discovery] Clone successful");
  } catch (cloneError) {
    console.error("[Setup Discovery] Clone failed:", cloneError);
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    return NextResponse.json(
      { error: `Failed to clone repository: ${cloneError instanceof Error ? cloneError.message : "Unknown error"}` },
      { status: 500 },
    );
  }

  // Generate our tracking session ID
  const newSessionId = `setup_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  // Build initial prompt
  let initialPrompt = `Explore this repository and create setup documentation.

# REPOSITORY

URL: ${repoUrl}
Repository: ${owner}/${repo}

# YOUR TASK

1. Explore the repository thoroughly
2. Figure out how to build and test it
3. Create comprehensive SETUP.md documentation
4. Create an automated setup.sh script

As you explore, if you're uncertain about anything important (e.g., which test command to use, what environment setup is needed, ambiguous configuration), feel free to ask me for clarification rather than guessing.

When you're confident you understand the setup, output both files in the exact format specified in your system prompt:

\`\`\`setup.md
[content]
\`\`\`

\`\`\`setup.sh
[content]
\`\`\``;

  if (guidance) {
    initialPrompt += `\n\n# GUIDANCE FROM USER\n${guidance}`;
  }

  // Store session metadata (we'll capture SDK session ID during streaming)
  activeSessions.set(newSessionId, {
    tempDir,
    workingDir,
    repoUrl,
    owner,
    repo,
    userId: user.id,
    claudeToken,
    createdAt: new Date(),
    lastActivityAt: new Date(),
    sdkSessionId: null,
  });

  // Set OAuth token
  const originalToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  process.env.CLAUDE_CODE_OAUTH_TOKEN = claudeToken;

  // Create the query with cwd set to the cloned repo
  const queryInstance = query({
    prompt: initialPrompt,
    options: {
      systemPrompt: SETUP_DISCOVERY_SYSTEM_PROMPT,
      model: "opus",
      cwd: workingDir, // This is the key - set working directory!
      allowedTools: ["Read", "Glob", "Grep", "Bash"],
      permissionMode: "bypassPermissions",
      maxTurns: 50,
      pathToClaudeCodeExecutable: CLAUDE_CLI_PATH,
    },
  });

  // Create streaming response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send our session ID to client
        sendSSE(controller, encoder, {
          type: "session_created",
          sessionId: newSessionId,
          workingDir,
        });

        // Stream responses from the query
        for await (const message of queryInstance) {
          // Capture SDK session ID from init message
          if (message.type === "system" && message.subtype === "init") {
            const sessionData = activeSessions.get(newSessionId);
            if (sessionData && message.session_id) {
              sessionData.sdkSessionId = message.session_id;
              console.log(`[Setup Discovery] Captured SDK session ID: ${message.session_id}`);
            }
          }

          const processed = processSDKMessage(message);
          if (processed) {
            sendSSE(controller, encoder, processed);
          }

          // Update activity timestamp
          const sessionData = activeSessions.get(newSessionId);
          if (sessionData) {
            sessionData.lastActivityAt = new Date();
          }

          // When we get a result, send turn_complete
          if (message.type === "result") {
            sendSSE(controller, encoder, { type: "turn_complete" });
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        console.error("[Setup Discovery] Stream error:", error);
        sendSSE(controller, encoder, {
          type: "error",
          content: {
            message: error instanceof Error ? error.message : "Unknown error",
          },
        });
        controller.close();
      } finally {
        // Restore token
        if (originalToken) {
          process.env.CLAUDE_CODE_OAUTH_TOKEN = originalToken;
        } else {
          delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
        }
      }
    },
  });

  return createSSEResponse(stream);
}

/**
 * Handle sending a message to an existing session
 */
async function handleSend({
  sessionId,
  message,
  claudeToken,
}: {
  sessionId: string;
  message: string;
  claudeToken: string;
}) {
  const sessionData = activeSessions.get(sessionId);
  if (!sessionData) {
    return NextResponse.json({ error: "Session not found or expired" }, { status: 404 });
  }

  if (!sessionData.sdkSessionId) {
    return NextResponse.json({ error: "Session not ready - SDK session ID not captured" }, { status: 400 });
  }

  sessionData.lastActivityAt = new Date();

  // Set OAuth token
  const originalToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  process.env.CLAUDE_CODE_OAUTH_TOKEN = claudeToken;

  // Create a new query that resumes the previous session
  const queryInstance = query({
    prompt: message,
    options: {
      model: "opus",
      cwd: sessionData.workingDir,
      allowedTools: ["Read", "Glob", "Grep", "Bash"],
      permissionMode: "bypassPermissions",
      maxTurns: 50,
      pathToClaudeCodeExecutable: CLAUDE_CLI_PATH,
      resume: sessionData.sdkSessionId, // Resume the previous session!
    },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Stream responses from the resumed query
        for await (const sdkMessage of queryInstance) {
          const processed = processSDKMessage(sdkMessage);
          if (processed) {
            sendSSE(controller, encoder, processed);
          }

          sessionData.lastActivityAt = new Date();

          if (sdkMessage.type === "result") {
            sendSSE(controller, encoder, { type: "turn_complete" });
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        console.error("[Setup Discovery] Send error:", error);
        sendSSE(controller, encoder, {
          type: "error",
          content: {
            message: error instanceof Error ? error.message : "Unknown error",
          },
        });
        controller.close();
      } finally {
        // Restore token
        if (originalToken) {
          process.env.CLAUDE_CODE_OAUTH_TOKEN = originalToken;
        } else {
          delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
        }
      }
    },
  });

  return createSSEResponse(stream);
}

/**
 * Handle stopping a session
 */
async function handleStop({ sessionId }: { sessionId: string }) {
  await cleanupSession(sessionId);
  return NextResponse.json({ success: true });
}
