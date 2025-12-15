/**
 * Code Battle Trial Orchestrator
 *
 * Orchestrates the full code battle lifecycle
 */

import { db } from '@/db';
import { trials, gladiators } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  startTrialContainer,
  destroyTrialContainer,
  runSetupInContainer,
} from '@/lib/trial/container-service';
import { pushAllWorktrees } from '@/lib/git/worktree';
import { runCodeBattleGladiator } from './gladiators';
import { transitionTrialState } from '@/lib/trial/state';
import { broadcastTrialUpdate } from '@/lib/trial/broadcast';

export async function runCodeBattle(
  trialId: string,
  userId: string,
  claudeToken: string
): Promise<void> {
  let container;

  try {
    // Start container
    await broadcastTrialUpdate(trialId, {
      type: 'container_status',
      status: 'starting',
      message: 'Spinning up battle container...',
    });

    container = await startTrialContainer(trialId, userId);

    // Run setup
    await broadcastTrialUpdate(trialId, {
      type: 'container_status',
      status: 'setup',
      message: 'Running setup script...',
    });

    const setupSuccess = await runSetupInContainer(container, (data) => {
      broadcastTrialUpdate(trialId, {
        type: 'setup_output',
        content: data,
      });
    });

    if (!setupSuccess) {
      throw new Error('Setup failed');
    }

    // Get trial and gladiators
    const trial = await db.query.trials.findFirst({
      where: eq(trials.id, trialId),
    });

    const trialGladiators = await db.query.gladiators.findMany({
      where: eq(gladiators.trialId, trialId),
    });

    // Run gladiators in parallel (inside container)
    await broadcastTrialUpdate(trialId, {
      type: 'battle_start',
      message: 'Gladiators entering the arena...',
      gladiatorCount: trialGladiators.length,
    });

    await Promise.all(
      trialGladiators.map((g) =>
        runCodeBattleGladiator(
          trialId,
          g as any,
          trial!.challengePrompt,
          container!,
          claudeToken
        )
      )
    );

    // Push all branches
    await broadcastTrialUpdate(trialId, {
      type: 'container_status',
      status: 'pushing',
      message: 'Pushing branches to repository...',
    });

    await pushAllWorktrees(container, trialId);

    await broadcastTrialUpdate(trialId, {
      type: 'battle_complete',
      message: 'All gladiators have submitted their work',
    });

    // Proceed to Arbiter
    await transitionTrialState(trialId, 'arbiter_designing');

    // Import and run arbiter
    const { runArbiter } = await import('../arbiter');
    await runArbiter(trialId, claudeToken);
  } catch (error) {
    console.error('Code battle error:', error);

    await broadcastTrialUpdate(trialId, {
      type: 'error',
      phase: 'code_battle',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    // Always destroy container
    if (container) {
      await broadcastTrialUpdate(trialId, {
        type: 'container_status',
        status: 'cleanup',
        message: 'Cleaning up container...',
      });

      await destroyTrialContainer(trialId);
    }
  }
}
