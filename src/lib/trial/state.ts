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

// Trial phase enum - matches the database schema phase column
export type TrialPhase =
  | "pending"
  | "lanista_designing"
  | "battling"
  | "arbiter_designing"
  | "judging"
  | "decree"
  | "complete"
  | "failed";

// Map the state machine states to database statuses
export const STATE_MAPPING: Record<TrialPhase, TrialStatus> = {
  pending: "PENDING",
  lanista_designing: "PLANNING",
  battling: "RUNNING",
  arbiter_designing: "JUDGING",
  judging: "JUDGING",
  decree: "COMPLETED",
  complete: "COMPLETED",
  failed: "FAILED",
};

// Valid state transitions
// Note: Each state can transition to itself (no-op for resume scenarios)
// Failed state can recover to any earlier state for resume functionality
const STATE_TRANSITIONS: Record<TrialPhase, TrialPhase[]> = {
  pending: ["pending", "lanista_designing", "failed"],
  lanista_designing: ["lanista_designing", "battling", "failed"],
  battling: ["battling", "arbiter_designing", "failed"],
  arbiter_designing: ["arbiter_designing", "judging", "failed"],
  judging: ["judging", "decree", "failed"],
  decree: ["decree", "complete", "failed"],
  complete: [],
  failed: ["failed", "lanista_designing", "battling", "arbiter_designing", "judging"],
};

// For backwards compatibility
export type TrialState = TrialPhase;

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

  // Use the phase column directly for current state (with fallback for legacy data)
  let currentState: TrialState;
  if (trial.phase) {
    currentState = trial.phase as TrialState;
  } else {
    // Fallback for legacy data without phase column - use status reverse lookup
    // This will be removed once all data is migrated
    for (const [state, status] of Object.entries(STATE_MAPPING)) {
      if (status === trial.status) {
        currentState = state as TrialState;
        break;
      }
    }
    if (!currentState!) {
      throw new Error(`Unknown current status: ${trial.status}`);
    }
  }

  // Validate transition
  if (!isValidTransition(currentState, nextState)) {
    throw new Error(`Invalid state transition: ${currentState} → ${nextState}`);
  }

  // Same-state transition is a no-op (for resume scenarios)
  if (currentState === nextState) {
    return;
  }

  // Get the database status for the next state
  const nextStatus = getStatusForState(nextState);

  // Update both status (for display) and phase (for state machine)
  const updateData: { status: TrialStatus; phase: TrialPhase; completedAt?: Date } = {
    status: nextStatus,
    phase: nextState,
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
