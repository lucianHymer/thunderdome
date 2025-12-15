/**
 * Setup Discovery API
 *
 * GET /api/repos/:owner/:repo/setup - Check if setup exists
 * POST /api/repos/:owner/:repo/setup - Run setup discovery (streaming)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { db } from '@/db';
import { repoSetups, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { runSetupDiscovery } from '@/lib/setup/discovery';
import { decrypt } from '@/lib/encryption';
import type { StreamEvent } from '@/lib/claude/types';

/**
 * GET - Check if setup exists for a repository
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  try {
    const user = await requireUser();
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
  } catch (error) {
    console.error('Error checking setup:', error);
    return NextResponse.json(
      { error: 'Failed to check setup' },
      { status: 500 }
    );
  }
}

/**
 * POST - Run setup discovery for a repository
 *
 * Request body:
 * {
 *   workingDir: string; // Path to cloned repository
 *   force?: boolean;    // Force re-discovery even if setup exists
 * }
 *
 * Returns: Server-Sent Events stream with discovery progress
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  try {
    const user = await requireUser();
    const { owner, repo } = await params;
    const repoUrl = `https://github.com/${owner}/${repo}`;

    // Get user's Claude token
    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!dbUser?.claudeToken) {
      return NextResponse.json(
        { error: 'Claude API token not configured. Please set it in settings.' },
        { status: 401 }
      );
    }

    const claudeToken = decrypt(dbUser.claudeToken);

    const body = await request.json();
    const { workingDir, force = false } = body;

    if (!workingDir || typeof workingDir !== 'string') {
      return NextResponse.json(
        { error: 'workingDir is required' },
        { status: 400 }
      );
    }

    // Check if setup already exists (unless force is true)
    if (!force) {
      const existingSetup = await db.query.repoSetups.findFirst({
        where: eq(repoSetups.repoUrl, repoUrl),
      });

      if (existingSetup) {
        return NextResponse.json(
          { error: 'Setup already exists. Use force=true to re-run discovery.' },
          { status: 409 }
        );
      }
    }

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'start',
                data: { repoUrl, workingDir },
              })}\n\n`
            )
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
                    type: 'stream',
                    data: event,
                  })}\n\n`
                )
              );
            }
          );

          if (!result.success || !result.files) {
            // Send error event
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'error',
                  data: { error: result.error || 'Setup discovery failed' },
                })}\n\n`
              )
            );
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
                type: 'complete',
                data: {
                  files: result.files,
                  cost: result.cost,
                },
              })}\n\n`
            )
          );

          controller.close();
        } catch (error) {
          console.error('Setup discovery error:', error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                data: {
                  error: error instanceof Error ? error.message : 'Unknown error',
                },
              })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error in setup discovery API:', error);
    return NextResponse.json(
      { error: 'Failed to start setup discovery' },
      { status: 500 }
    );
  }
}
