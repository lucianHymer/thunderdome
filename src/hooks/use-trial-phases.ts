/**
 * Trial Phases Hook
 *
 * Transforms raw stream events into derived phase states for UI rendering.
 * Provides a clean interface for components to render each trial phase.
 */

"use client";

import { useMemo } from "react";
import { type TrialEvent, useTrialStream } from "./use-trial-stream";

export type PhaseState = "pending" | "active" | "complete" | "error";

export interface GladiatorDesign {
  id?: string;
  name: string;
  persona: string;
  model: string;
  temperature: number;
  tools: string[];
  branchName?: string;
}

export interface JudgeDesign {
  id?: string;
  name: string;
  focus: string;
  evaluationCriteria?: string[];
}

export interface JudgeEvaluation {
  judgeId: string;
  judgeName: string;
  status: PhaseState;
  evaluations?: Array<{
    gladiatorId: string;
    gladiatorName?: string;
    score: number;
    strengths: string[];
    weaknesses: string[];
    reasoning: string;
  }>;
  cost?: {
    totalUsd: number;
  };
}

export interface CostInfo {
  inputTokens?: number;
  outputTokens?: number;
  totalCost?: number;
  totalUsd?: number;
}

export interface LanistaPhase {
  state: PhaseState;
  reasoning?: string;
  gladiators?: GladiatorDesign[];
  cost?: CostInfo;
  error?: string;
}

export interface BattlePhase {
  state: PhaseState;
  activeGladiators: string[];
  completedGladiators: string[];
  failedGladiators: string[];
  totalCost?: CostInfo;
  error?: string;
}

export interface ArbiterPhase {
  state: PhaseState;
  reasoning?: string;
  judges?: JudgeDesign[];
  cost?: CostInfo;
  error?: string;
}

export interface JudgingPhase {
  state: PhaseState;
  judges: JudgeEvaluation[];
  totalCost?: number;
  error?: string;
}

export interface VerdictPhase {
  state: PhaseState;
  winnerId?: string | null;
  winnerName?: string;
  averageScore?: number;
  scores?: Record<string, number>;
  error?: string;
}

export interface TrialPhases {
  lanista: LanistaPhase;
  battle: BattlePhase;
  arbiter: ArbiterPhase;
  judging: JudgingPhase;
  verdict: VerdictPhase;
}

/**
 * Derives phase states from stream events and trial data
 */
function derivePhases(
  events: TrialEvent[],
  trialStatus: string,
  lanistaPlan?: string | null,
  arbiterPlan?: string | null,
): TrialPhases {
  // Initialize default phases
  const phases: TrialPhases = {
    lanista: { state: "pending" },
    battle: {
      state: "pending",
      activeGladiators: [],
      completedGladiators: [],
      failedGladiators: [],
    },
    arbiter: { state: "pending" },
    judging: { state: "pending", judges: [] },
    verdict: { state: "pending" },
  };

  // Parse stored plans if available
  if (lanistaPlan) {
    try {
      const plan = JSON.parse(lanistaPlan);
      if (plan.error) {
        phases.lanista = {
          state: "error",
          error: plan.error,
        };
      } else {
        phases.lanista = {
          state: "complete",
          reasoning: plan.reasoning,
          gladiators: plan.gladiators,
          cost: plan.cost,
        };
      }
    } catch {
      // Invalid JSON, leave as pending
    }
  }

  if (arbiterPlan) {
    try {
      const plan = JSON.parse(arbiterPlan);
      if (plan.error) {
        phases.arbiter = {
          state: "error",
          error: plan.error,
        };
      } else {
        phases.arbiter = {
          state: "complete",
          reasoning: plan.reasoning,
          judges: plan.judges,
          cost: plan.cost,
        };
      }
    } catch {
      // Invalid JSON, leave as pending
    }
  }

  // Process stream events to update phase states
  for (const event of events) {
    switch (event.type) {
      // Lanista events
      case "lanista_thinking":
        if (phases.lanista.state === "pending") {
          phases.lanista.state = "active";
        }
        break;

      case "lanista_complete":
        phases.lanista = {
          state: "complete",
          reasoning: event.data?.reasoning || event.reasoning,
          gladiators: event.data?.gladiators,
          cost: event.data?.cost || event.cost,
        };
        break;

      case "lanista_error":
        phases.lanista = {
          state: "error",
          error: event.data?.error || event.error,
        };
        break;

      case "gladiators_created":
        // Lanista is complete, battle can begin
        if (phases.lanista.state !== "error") {
          phases.lanista.state = "complete";
        }
        if (event.data?.gladiators) {
          phases.lanista.gladiators = event.data.gladiators;
        }
        break;

      // Battle events
      case "battle_started":
        phases.battle.state = "active";
        break;

      case "gladiator_started":
        phases.battle.state = "active";
        if (event.gladiatorId && !phases.battle.activeGladiators.includes(event.gladiatorId)) {
          phases.battle.activeGladiators.push(event.gladiatorId);
        }
        break;

      case "gladiator_completed":
        if (event.gladiatorId) {
          phases.battle.activeGladiators = phases.battle.activeGladiators.filter(
            (id) => id !== event.gladiatorId,
          );
          if (!phases.battle.completedGladiators.includes(event.gladiatorId)) {
            phases.battle.completedGladiators.push(event.gladiatorId);
          }
        }
        break;

      case "gladiator_failed":
        if (event.gladiatorId) {
          phases.battle.activeGladiators = phases.battle.activeGladiators.filter(
            (id) => id !== event.gladiatorId,
          );
          if (!phases.battle.failedGladiators.includes(event.gladiatorId)) {
            phases.battle.failedGladiators.push(event.gladiatorId);
          }
        }
        break;

      case "battle_completed":
        phases.battle.state = "complete";
        phases.battle.totalCost = event.totalCost;
        break;

      case "battle_failed":
        phases.battle.state = "error";
        phases.battle.error = event.error;
        break;

      // Arbiter events
      case "arbiter_thinking":
        phases.arbiter.state = "active";
        break;

      case "arbiter_complete":
        phases.arbiter = {
          state: "complete",
          reasoning: event.data?.reasoning || event.reasoning,
          judges: event.data?.judges,
          cost: event.data?.cost || event.cost,
        };
        break;

      case "arbiter_error":
        phases.arbiter = {
          state: "error",
          error: event.data?.error || event.error,
        };
        break;

      case "judges_created":
        if (phases.arbiter.state !== "error") {
          phases.arbiter.state = "complete";
        }
        if (event.data?.judges) {
          // Initialize judge tracking in judging phase
          phases.judging.judges = event.data.judges.map((j: any) => ({
            judgeId: j.id,
            judgeName: j.name,
            status: "pending" as PhaseState,
          }));
        }
        break;

      // Judging events
      case "judging_started":
        phases.judging.state = "active";
        break;

      case "judge_thinking": {
        phases.judging.state = "active";
        const thinkingJudge = phases.judging.judges.find((j) => j.judgeId === event.data?.judgeId);
        if (thinkingJudge) {
          thinkingJudge.status = "active";
        } else if (event.data?.judgeId) {
          phases.judging.judges.push({
            judgeId: event.data.judgeId,
            judgeName: event.data.judgeName || "Unknown Judge",
            status: "active",
          });
        }
        break;
      }

      case "judge_complete": {
        const completedJudge = phases.judging.judges.find((j) => j.judgeId === event.data?.judgeId);
        if (completedJudge) {
          completedJudge.status = "complete";
          completedJudge.cost = event.data?.cost;
        }
        break;
      }

      case "judge_error": {
        const errorJudge = phases.judging.judges.find((j) => j.judgeId === event.data?.judgeId);
        if (errorJudge) {
          errorJudge.status = "error";
        }
        break;
      }

      case "all_judges_complete":
        phases.judging.state = "complete";
        phases.judging.totalCost = event.data?.totalCost;
        // Mark all judges as complete
        phases.judging.judges.forEach((j) => {
          if (j.status === "active" || j.status === "pending") {
            j.status = "complete";
          }
        });
        break;

      // Verdict events
      case "verdict_synthesizing":
        phases.verdict.state = "active";
        break;

      case "verdict_complete":
        phases.verdict = {
          state: "complete",
          winnerId: event.data?.winnerGladiatorId,
          winnerName: event.data?.winnerName,
          averageScore: event.data?.averageScore,
          scores: event.data?.scores,
        };
        break;

      // State changes
      case "state_change":
        // Update phases based on state transitions
        if (event.state === "failed") {
          // Determine which phase failed based on status
          if (event.phase === "lanista" || trialStatus === "PLANNING") {
            phases.lanista.state = "error";
            phases.lanista.error = event.error;
          } else if (event.phase === "battle" || trialStatus === "RUNNING") {
            phases.battle.state = "error";
            phases.battle.error = event.error;
          } else if (event.phase === "arbiter" || event.phase === "judging") {
            if (phases.arbiter.state === "active") {
              phases.arbiter.state = "error";
              phases.arbiter.error = event.error;
            } else {
              phases.judging.state = "error";
              phases.judging.error = event.error;
            }
          }
        }
        break;
    }
  }

  // Infer phase states from trial status if events are missing
  if (trialStatus === "PLANNING" && phases.lanista.state === "pending") {
    phases.lanista.state = "active";
  }
  if (trialStatus === "RUNNING") {
    if (phases.lanista.state === "pending" || phases.lanista.state === "active") {
      phases.lanista.state = "complete";
    }
    if (phases.battle.state === "pending") {
      phases.battle.state = "active";
    }
  }
  if (trialStatus === "JUDGING") {
    if (phases.lanista.state !== "error") phases.lanista.state = "complete";
    if (phases.battle.state !== "error") phases.battle.state = "complete";
    // Arbiter could be active or complete during JUDGING
    if (phases.arbiter.state === "pending") {
      phases.arbiter.state = "active";
    }
  }
  if (trialStatus === "COMPLETED") {
    if (phases.lanista.state !== "error") phases.lanista.state = "complete";
    if (phases.battle.state !== "error") phases.battle.state = "complete";
    if (phases.arbiter.state !== "error") phases.arbiter.state = "complete";
    if (phases.judging.state !== "error") phases.judging.state = "complete";
    if (phases.verdict.state !== "error") phases.verdict.state = "complete";
  }

  return phases;
}

export interface UseTrialPhasesOptions {
  enabled?: boolean;
}

export interface UseTrialPhasesReturn {
  phases: TrialPhases;
  stream: ReturnType<typeof useTrialStream>;
  currentPhase: "lanista" | "battle" | "arbiter" | "judging" | "verdict" | null;
}

/**
 * Hook to get derived trial phases from stream events
 */
export function useTrialPhases(
  trialId: string,
  trialStatus: string,
  lanistaPlan?: string | null,
  arbiterPlan?: string | null,
  options: UseTrialPhasesOptions = {},
): UseTrialPhasesReturn {
  const { enabled = true } = options;
  const stream = useTrialStream(trialId, { enabled });

  const phases = useMemo(() => {
    return derivePhases(stream.events, trialStatus, lanistaPlan, arbiterPlan);
  }, [stream.events, trialStatus, lanistaPlan, arbiterPlan]);

  // Determine current active phase
  const currentPhase = useMemo(() => {
    if (phases.verdict.state === "active") return "verdict";
    if (phases.judging.state === "active") return "judging";
    if (phases.arbiter.state === "active") return "arbiter";
    if (phases.battle.state === "active") return "battle";
    if (phases.lanista.state === "active") return "lanista";
    return null;
  }, [phases]);

  return {
    phases,
    stream,
    currentPhase,
  };
}
