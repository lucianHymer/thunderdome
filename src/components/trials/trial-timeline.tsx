/**
 * Trial Timeline Component
 *
 * Vertical timeline showing all trial phases with visual progression.
 * Composes individual phase components into a cohesive timeline view.
 */

"use client";

import type { JudgeDesign, TrialPhases } from "@/hooks/use-trial-phases";
import { PhaseArbiter } from "./phases/phase-arbiter";
import { PhaseBattle } from "./phases/phase-battle";
import { PhaseJudging } from "./phases/phase-judging";
import { PhaseLanista } from "./phases/phase-lanista";
import { PhaseSetupDiscovery } from "./phases/phase-setup-discovery";
import { PhaseVerdict } from "./phases/phase-verdict";
import { TimelinePhase } from "./timeline-phase";

interface Gladiator {
  id: string;
  name: string;
  persona: string;
  model: string;
  status: string;
  branchName?: string;
}

interface Judge {
  id: string;
  name: string;
  focus: string;
  model: string;
  evaluation?: string | null;
}

interface Verdict {
  summary: string;
  winnerGladiatorId: string | null;
  reasoning: string;
}

interface TrialTimelineProps {
  trialId: string;
  repoUrl?: string | null;
  phases: TrialPhases;
  gladiators: Gladiator[];
  judges?: Judge[];
  verdict?: Verdict | null;
}

export function TrialTimeline({
  trialId,
  repoUrl,
  phases,
  gladiators,
  judges = [],
  verdict,
}: TrialTimelineProps) {
  // Combine phase judge designs with actual judge records
  const judgesWithEvaluations = judges.map((judge) => {
    const phaseJudge = phases.judging.judges?.find((j) => j.judgeId === judge.id);
    let evaluation = null;
    if (judge.evaluation) {
      try {
        evaluation = JSON.parse(judge.evaluation);
      } catch {
        // Invalid JSON
      }
    }
    return {
      ...judge,
      status: phaseJudge?.status || "pending",
      evaluationData: evaluation,
    };
  });

  return (
    <div className="space-y-2">
      {/* Setup Discovery Phase - only for repo trials */}
      {repoUrl && (
        <TimelinePhase
          title="Setup Discovery"
          subtitle="Configuring repository environment"
          state={phases.setupDiscovery.state}
          icon="🔧"
          colorScheme="cyan"
          defaultOpen={phases.setupDiscovery.state === "active"}
        >
          <PhaseSetupDiscovery trialId={trialId} state={phases.setupDiscovery.state} />
        </TimelinePhase>
      )}

      {/* Lanista Phase */}
      <TimelinePhase
        title="Lanista Planning"
        subtitle="Designing gladiator strategies"
        state={phases.lanista.state}
        icon="🧠"
        colorScheme="yellow"
        defaultOpen={phases.lanista.state !== "pending"}
      >
        <PhaseLanista
          state={phases.lanista.state}
          reasoning={phases.lanista.reasoning}
          gladiatorDesigns={phases.lanista.gladiators}
          cost={phases.lanista.cost}
          error={phases.lanista.error}
        />
      </TimelinePhase>

      {/* Battle Phase */}
      <TimelinePhase
        title="Battle"
        subtitle={`${gladiators.length} gladiators competing`}
        state={phases.battle.state}
        icon="⚔️"
        colorScheme="orange"
        defaultOpen={phases.battle.state === "active"}
      >
        <PhaseBattle
          state={phases.battle.state}
          gladiators={gladiators}
          activeGladiators={phases.battle.activeGladiators}
          completedGladiators={phases.battle.completedGladiators}
          failedGladiators={phases.battle.failedGladiators}
          winnerId={verdict?.winnerGladiatorId}
          error={phases.battle.error}
        />
      </TimelinePhase>

      {/* Arbiter Phase */}
      <TimelinePhase
        title="Arbiter Analysis"
        subtitle="Designing evaluation criteria"
        state={phases.arbiter.state}
        icon="⚖️"
        colorScheme="purple"
        defaultOpen={phases.arbiter.state === "active"}
      >
        <PhaseArbiter
          state={phases.arbiter.state}
          reasoning={phases.arbiter.reasoning}
          judgeDesigns={phases.arbiter.judges}
          cost={phases.arbiter.cost}
          error={phases.arbiter.error}
        />
      </TimelinePhase>

      {/* Judging Phase */}
      <TimelinePhase
        title="Judging"
        subtitle={judges.length > 0 ? `${judges.length} judges evaluating` : "Awaiting judges"}
        state={phases.judging.state}
        icon="📊"
        colorScheme="blue"
        defaultOpen={phases.judging.state === "active"}
      >
        <PhaseJudging
          state={phases.judging.state}
          judges={judgesWithEvaluations}
          gladiators={gladiators}
          totalCost={phases.judging.totalCost}
          error={phases.judging.error}
        />
      </TimelinePhase>

      {/* Verdict Phase */}
      <TimelinePhase
        title="Verdict"
        subtitle={verdict ? "Decision reached" : "Awaiting judgment"}
        state={phases.verdict.state}
        icon="👑"
        colorScheme="green"
        isLast
        defaultOpen={phases.verdict.state !== "pending"}
      >
        <PhaseVerdict
          state={phases.verdict.state}
          verdict={verdict}
          gladiators={gladiators}
          scores={phases.verdict.scores}
          error={phases.verdict.error}
        />
      </TimelinePhase>
    </div>
  );
}
