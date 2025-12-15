/**
 * Trial State Machine
 *
 * Manages state transitions for trials following the flow:
 * pending → lanista_designing → battling → arbiter_designing → judging → decree → complete
 *                                    ↓
 *                                  failed
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { trials } from "@/db/schema";
import { broadcastTrialUpdate } from "./broadcast";

// Trial status enum matching the database schema
export type TrialStatus = "PENDING" | "PLANNING" | "RUNNING" | "JUDGING" | "COMPLETED" | "FAILED";

// Map the state machine states to database statuses
export const STATE_MAPPING = {
  pending: "PENDING" as const,
  lanista_designing: "PLANNING" as const,
  battling: "RUNNING" as const,
  arbiter_designing: "JUDGING" as const,
  judging: "JUDGING" as const,
  decree: "COMPLETED" as const,
  complete: "COMPLETED" as const,
  failed: "FAILED" as const,
};

// Valid state transitions
const STATE_TRANSITIONS: Record<string, string[]> = {
  pending: ["lanista_designing", "failed"],
  lanista_designing: ["battling", "failed"],
  battling: ["arbiter_designing", "failed"],
  arbiter_designing: ["judging", "failed"],
  judging: ["decree", "failed"],
  decree: ["complete", "failed"],
  complete: [],
  failed: [],
};

export type TrialState = keyof typeof STATE_TRANSITIONS;

/**
 * Check if a state transition is valid
 */
export function isValidTransition(currentState: TrialState, nextState: TrialState): boolean {
  const validNextStates = STATE_TRANSITIONS[currentState];
  return validNextStates.includes(nextState);
}

/**
 * Get the database status for a given state
 */
export function getStatusForState(state: TrialState): TrialStatus {
  return STATE_MAPPING[state as keyof typeof STATE_MAPPING];
}

/**
 * Transition a trial to a new state
 * Updates the database and broadcasts to SSE subscribers
 */
export async function transitionTrialState(
  trialId: string,
  nextState: TrialState,
  metadata?: Record<string, any>,
): Promise<void> {
  // Get current trial
  const [trial] = await db.select().from(trials).where(eq(trials.id, trialId)).limit(1);

  if (!trial) {
    throw new Error(`Trial ${trialId} not found`);
  }

  // Map current status to state (reverse lookup)
  let currentState: TrialState | undefined;
  for (const [state, status] of Object.entries(STATE_MAPPING)) {
    if (status === trial.status) {
      currentState = state as TrialState;
      break;
    }
  }

  if (!currentState) {
    throw new Error(`Unknown current status: ${trial.status}`);
  }

  // Validate transition
  if (!isValidTransition(currentState, nextState)) {
    throw new Error(`Invalid state transition: ${currentState} → ${nextState}`);
  }

  // Get the database status for the next state
  const nextStatus = getStatusForState(nextState);

  // Update the database
  const updateData: any = {
    status: nextStatus,
  };

  // Mark as completed if we reach the complete state
  if (nextState === "complete" || nextState === "failed") {
    updateData.completedAt = new Date();
  }

  await db.update(trials).set(updateData).where(eq(trials.id, trialId));

  // Broadcast the state change to all subscribers
  await broadcastTrialUpdate(trialId, {
    type: "state_change",
    state: nextState,
    status: nextStatus,
    timestamp: new Date().toISOString(),
    ...metadata,
  });
}

/**
 * Get all possible next states for a trial
 */
export function getNextStates(currentState: TrialState): TrialState[] {
  return STATE_TRANSITIONS[currentState] as TrialState[];
}
