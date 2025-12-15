/**
 * Shared types for the Trial system
 */

/**
 * Status event types for all trial phases
 */
export type TrialEventType =
  // Lanista events
  | 'lanista_thinking'
  | 'lanista_complete'
  | 'lanista_error'
  | 'gladiators_created'
  // Arbiter events
  | 'arbiter_thinking'
  | 'arbiter_complete'
  | 'arbiter_error'
  | 'judges_created'
  | 'judging_started'
  // Judge events
  | 'judge_thinking'
  | 'judge_complete'
  | 'judge_error'
  | 'all_judges_complete'
  // Verdict events
  | 'verdict_synthesizing'
  | 'verdict_complete';

/**
 * Unified status update callback for SSE broadcasting
 */
export type StatusCallback = (event: {
  type: TrialEventType;
  data: any;
}) => void;
