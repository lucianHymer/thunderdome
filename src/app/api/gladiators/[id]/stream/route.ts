/**
 * Gladiator Stream API Route
 *
 * GET /api/gladiators/[id]/stream - Server-Sent Events stream for gladiator output
 */

import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { db } from '@/db';
import { gladiators, trials } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Verify gladiator exists and user owns the trial
  const [gladiator] = await db
    .select({
      gladiator: gladiators,
      trial: trials,
    })
    .from(gladiators)
    .innerJoin(trials, eq(gladiators.trialId, trials.id))
    .where(eq(gladiators.id, id))
    .limit(1);

  if (!gladiator || gladiator.trial.userId !== user.id) {
    return new Response('Not found', { status: 404 });
  }

  // Set up SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection event
      const message = `data: ${JSON.stringify({
        type: 'connected',
        content: 'Connected to gladiator stream',
        timestamp: Date.now(),
      })}\n\n`;
      controller.enqueue(encoder.encode(message));

      let lastOutputLength = 0;

      // Poll for updates every 1 second
      const interval = setInterval(async () => {
        try {
          // Get current gladiator data
          const [currentGladiator] = await db
            .select()
            .from(gladiators)
            .where(eq(gladiators.id, id))
            .limit(1);

          if (!currentGladiator) {
            clearInterval(interval);
            controller.close();
            return;
          }

          // Parse stream log if available
          const streamLog = currentGladiator.streamLog
            ? JSON.parse(currentGladiator.streamLog)
            : [];

          // Send new events since last check
          if (streamLog.length > lastOutputLength) {
            const newEvents = streamLog.slice(lastOutputLength);
            for (const event of newEvents) {
              const eventMessage = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
              controller.enqueue(encoder.encode(eventMessage));
            }
            lastOutputLength = streamLog.length;
          }

          // Send status updates
          const statusEvent = `event: status\ndata: ${JSON.stringify({
            type: 'status',
            content: currentGladiator.status,
            timestamp: Date.now(),
          })}\n\n`;
          controller.enqueue(encoder.encode(statusEvent));

          // If gladiator is done, send complete event and close
          if (currentGladiator.status === 'COMPLETED' || currentGladiator.status === 'FAILED') {
            const completeEvent = `event: complete\ndata: ${JSON.stringify({
              type: 'complete',
              content: currentGladiator.responseContent || '',
              timestamp: Date.now(),
            })}\n\n`;
            controller.enqueue(encoder.encode(completeEvent));
            clearInterval(interval);
            setTimeout(() => controller.close(), 1000);
          }
        } catch (error) {
          console.error('Error in gladiator stream:', error);
          const errorEvent = `event: error_event\ndata: ${JSON.stringify({
            type: 'error',
            content: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
          })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
          clearInterval(interval);
          controller.close();
        }
      }, 1000);

      // Clean up on close
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
