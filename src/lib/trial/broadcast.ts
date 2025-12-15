/**
 * SSE Broadcasting System
 *
 * Manages Server-Sent Events subscriptions and broadcasts trial updates
 * to all connected clients in real-time.
 */

export type TrialUpdateEvent = {
  type: string;
  [key: string]: any;
};

type Subscriber = {
  controller: ReadableStreamDefaultController;
  userId: string;
};

// In-memory store of subscribers per trial
// Map<trialId, Map<subscriberId, Subscriber>>
const subscribers = new Map<string, Map<string, Subscriber>>();

/**
 * Subscribe to trial updates
 * Returns a ReadableStream for SSE
 */
export function subscribeToTrial(
  trialId: string,
  userId: string
): ReadableStream {
  const subscriberId = crypto.randomUUID();

  const stream = new ReadableStream({
    start(controller) {
      // Add subscriber to the map
      if (!subscribers.has(trialId)) {
        subscribers.set(trialId, new Map());
      }

      subscribers.get(trialId)!.set(subscriberId, {
        controller,
        userId,
      });

      // Send initial connection event
      const data = JSON.stringify({
        type: "connected",
        trialId,
        timestamp: new Date().toISOString(),
      });
      controller.enqueue(`data: ${data}\n\n`);
    },

    cancel() {
      // Remove subscriber when connection is closed
      unsubscribeFromTrial(trialId, subscriberId);
    },
  });

  return stream;
}

/**
 * Unsubscribe from trial updates
 */
export function unsubscribeFromTrial(
  trialId: string,
  subscriberId: string
): void {
  const trialSubscribers = subscribers.get(trialId);
  if (trialSubscribers) {
    trialSubscribers.delete(subscriberId);

    // Clean up empty trial maps
    if (trialSubscribers.size === 0) {
      subscribers.delete(trialId);
    }
  }
}

/**
 * Broadcast an update to all subscribers of a trial
 * Only sends to subscribers who own the trial (userId match)
 */
export async function broadcastTrialUpdate(
  trialId: string,
  event: TrialUpdateEvent
): Promise<void> {
  const trialSubscribers = subscribers.get(trialId);

  if (!trialSubscribers || trialSubscribers.size === 0) {
    // No subscribers, nothing to broadcast
    return;
  }

  const data = JSON.stringify({
    trialId,
    ...event,
  });

  const message = `data: ${data}\n\n`;

  // Send to all subscribers
  const deadSubscribers: string[] = [];

  for (const [subscriberId, subscriber] of trialSubscribers.entries()) {
    try {
      subscriber.controller.enqueue(message);
    } catch (error) {
      // Subscriber connection is dead, mark for removal
      console.error(
        `Failed to send to subscriber ${subscriberId}:`,
        error
      );
      deadSubscribers.push(subscriberId);
    }
  }

  // Clean up dead subscribers
  for (const subscriberId of deadSubscribers) {
    unsubscribeFromTrial(trialId, subscriberId);
  }
}

/**
 * Get the number of active subscribers for a trial
 */
export function getSubscriberCount(trialId: string): number {
  return subscribers.get(trialId)?.size ?? 0;
}

/**
 * Close all subscriptions for a trial
 */
export function closeTrialSubscriptions(trialId: string): void {
  const trialSubscribers = subscribers.get(trialId);

  if (!trialSubscribers) {
    return;
  }

  // Send close event and close all controllers
  for (const [subscriberId, subscriber] of trialSubscribers.entries()) {
    try {
      const data = JSON.stringify({
        type: "trial_closed",
        trialId,
        timestamp: new Date().toISOString(),
      });
      subscriber.controller.enqueue(`data: ${data}\n\n`);
      subscriber.controller.close();
    } catch (error) {
      console.error(
        `Failed to close subscriber ${subscriberId}:`,
        error
      );
    }
  }

  // Clear all subscribers
  subscribers.delete(trialId);
}
