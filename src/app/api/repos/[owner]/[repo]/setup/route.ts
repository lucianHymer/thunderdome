/**
 * Setup Discovery API
 *
 * GET /api/repos/:owner/:repo/setup - Check if setup exists
 * POST /api/repos/:owner/:repo/setup - Run setup discovery (streaming)
 */

import { exec } from "child_process";
import { mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { repoSetups, users } from "@/db/schema";
import type { StreamEvent } from "@/lib/claude/types";
import { decrypt } from "@/lib/encryption";
import { checkRepoAccess, getInstallationToken } from "@/lib/github/app";
import { requireUser } from "@/lib/session";
import { runSetupDiscovery } from "@/lib/setup/discovery";

const execAsync = promisify(exec);

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

    // Look up setup in database
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
 * POST - Run setup discovery for a repository
 *
 * Request body:
 * {
 *   force?: boolean;  // Force re-discovery even if setup exists
 * }
 *
 * Returns: Server-Sent Events stream with discovery progress
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  let tempDir: string | null = null;

  try {
    console.log("[Setup Discovery] Starting...");
    const user = await requireUser();
    const { owner, repo } = await params;
    const repoUrl = `https://github.com/${owner}/${repo}`;
    const repoFullName = `${owner}/${repo}`;
    console.log(`[Setup Discovery] Repo: ${repoFullName}, User: ${user.id}`);

    // Get user's Claude token
    const [dbUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

    if (!dbUser?.claudeToken) {
      console.log("[Setup Discovery] No Claude token configured");
      return NextResponse.json(
        { error: "Claude API token not configured. Please set it in settings." },
        { status: 401 },
      );
    }

    const claudeToken = decrypt(dbUser.claudeToken);
    console.log("[Setup Discovery] Claude token retrieved");

    const body = await request.json().catch(() => ({}));
    const { force = false, guidance } = body;

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
        // repo_not_included
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
    tempDir = join(tmpdir(), `thunderdome-setup-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    console.log(`[Setup Discovery] Created temp dir: ${tempDir}`);

    const workingDir = join(tempDir, repo);

    try {
      console.log(`[Setup Discovery] Cloning to ${workingDir}...`);
      const cloneUrl = `https://x-access-token:${tokenResult.token}@github.com/${repoFullName}.git`;
      await execAsync(`git clone --depth 1 "${cloneUrl}" "${workingDir}"`, {
        timeout: 60000, // 60 second timeout for clone
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

    // Capture tempDir in closure for cleanup
    const tempDirToCleanup = tempDir;

    // Helper to clean up temp directory
    const cleanup = async () => {
      if (tempDirToCleanup) {
        await rm(tempDirToCleanup, { recursive: true, force: true }).catch(() => {});
      }
    };

    console.log("[Setup Discovery] Creating SSE stream...");

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          console.log("[Setup Discovery] Stream started, sending initial event");
          // Send initial event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "start",
                data: { repoUrl, workingDir },
              })}\n\n`,
            ),
          );

          // Run setup discovery with streaming
          const result = await runSetupDiscovery(
            repoUrl,
            workingDir,
            claudeToken,
            (event: StreamEvent) => {
              // Stream each event to the client
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "stream",
                    data: event,
                  })}\n\n`,
                ),
              );
            },
            guidance, // Pass user guidance if provided
          );

          if (!result.success || !result.files) {
            // Send error event
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  data: { error: result.error || "Setup discovery failed" },
                })}\n\n`,
              ),
            );
            await cleanup();
            controller.close();
            return;
          }

          // Save setup to database
          const existingSetup = await db.query.repoSetups.findFirst({
            where: eq(repoSetups.repoUrl, repoUrl),
          });

          if (existingSetup) {
            // Update existing
            await db
              .update(repoSetups)
              .set({
                setupMd: result.files.setupMd,
                setupSh: result.files.setupSh,
                updatedAt: new Date(),
              })
              .where(eq(repoSetups.id, existingSetup.id));
          } else {
            // Create new
            await db.insert(repoSetups).values({
              userId: user.id,
              repoUrl,
              setupMd: result.files.setupMd,
              setupSh: result.files.setupSh,
            });
          }

          // Send success event with files
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "complete",
                data: {
                  files: result.files,
                  cost: result.cost,
                },
              })}\n\n`,
            ),
          );

          await cleanup();
          controller.close();
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                data: {
                  error: error instanceof Error ? error.message : "Unknown error",
                },
              })}\n\n`,
            ),
          );
          await cleanup();
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
    console.error("Setup discovery error:", error);
    // Clean up temp dir if it exists
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start setup discovery" },
      { status: 500 }
    );
  }
}
