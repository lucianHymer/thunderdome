/**
 * Code Battle Gladiator Runner
 *
 * Runs gladiators in isolated worktrees with full tool access
 */

import { db } from '@/db';
import { gladiators } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { StreamEvent } from '@/lib/claude';
import { TrialContainer } from '@/lib/docker/container';
import { createWorktree } from '@/lib/git/worktree';
import { broadcastGladiatorUpdate, broadcastTrialUpdate } from '@/lib/trial/broadcast';
import { buildCodeBattlePrompt } from '../gladiators/prompts';
import { createFindingsPromptAddition } from './findings-template';

interface GladiatorRecord {
  id: string;
  name: string;
  persona: string;
  model: string;
  temperature: number;
  tools: unknown;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function runCodeBattleGladiator(
  trialId: string,
  gladiator: GladiatorRecord,
  challenge: string,
  container: TrialContainer,
  claudeToken: string
): Promise<void> {
  // Create worktree for this gladiator
  const worktreePath = await createWorktree(container, {
    trialId,
    gladiatorName: gladiator.name,
  });

  const branchName = `thunderdome/trial-${trialId}/${slugify(gladiator.name)}`;

  // Update gladiator with branch name
  await db
    .update(gladiators)
    .set({
      branchName,
      status: 'RUNNING',
    })
    .where(eq(gladiators.id, gladiator.id));

  await broadcastTrialUpdate(trialId, {
    type: 'gladiator_started',
    gladiatorId: gladiator.id,
    gladiatorName: gladiator.name,
    branchName,
  });

  // Build the prompt with repo context and FINDINGS requirement
  const repoContext = `Working directory: ${worktreePath}\nBranch: ${branchName}`;
  const findingsAddition = createFindingsPromptAddition();

  const prompt = buildCodeBattlePrompt(
    challenge + findingsAddition,
    gladiator.name,
    gladiator.persona,
    'Code quality and completeness',
    'GLADIATOR',
    repoContext,
    worktreePath
  );

  const streamLog: StreamEvent[] = [];

  try {
    // Run agent inside the container using Claude Agent SDK
    // This requires executing claude-agent in the container with the worktree as cwd
    const exitCode = await container.execStream(
      `cd ${worktreePath} && node -e "
        const { query } = require('@anthropic-ai/claude-agent-sdk');
        const prompt = ${JSON.stringify(prompt)};
        const options = {
          systemPrompt: ${JSON.stringify(gladiator.persona)},
          maxTurns: 20,
          allowedTools: ${JSON.stringify(gladiator.tools || ['bash', 'editor'])},
        };
        (async () => {
          try {
            for await (const msg of query({ prompt, options })) {
              console.log(JSON.stringify(msg));
            }
          } catch (error) {
            console.error(JSON.stringify({ type: 'error', error: error.message }));
          }
        })();
      "`,
      (data: string) => {
        // Parse and broadcast events
        try {
          const lines = data.split('\n').filter(Boolean);
          for (const line of lines) {
            const event = JSON.parse(line);
            const streamEvent: StreamEvent = {
              type: 'assistant',
              content: JSON.stringify(event),
              timestamp: new Date(),
            };
            streamLog.push(streamEvent);
            broadcastGladiatorUpdate(gladiator.id, {
              type: 'gladiator_event',
              gladiatorId: gladiator.id,
              event: streamEvent,
            });
          }
        } catch {
          // Not JSON, just output text
          const streamEvent: StreamEvent = {
            type: 'assistant',
            content: data,
            timestamp: new Date(),
          };
          streamLog.push(streamEvent);
        }
      }
    );

    // Check for FINDINGS.md
    const { stdout: findings } = await container.exec(
      `cat ${worktreePath}/.thunderdome/FINDINGS.md 2>/dev/null || echo ""`
    );

    // Commit changes
    await container.exec(`
      cd ${worktreePath} && \
      git add -A && \
      git commit -m "Gladiator ${gladiator.name} submission" --allow-empty
    `);

    // Update gladiator record
    await db
      .update(gladiators)
      .set({
        status: 'COMPLETED',
        responseContent: findings || 'No FINDINGS.md generated',
        streamLog: JSON.stringify(streamLog),
      })
      .where(eq(gladiators.id, gladiator.id));

    await broadcastGladiatorUpdate(gladiator.id, {
      type: 'gladiator_complete',
      gladiatorId: gladiator.id,
      success: true,
    });
  } catch (error) {
    console.error(`Code battle gladiator ${gladiator.name} error:`, error);

    await db
      .update(gladiators)
      .set({
        status: 'FAILED',
        streamLog: JSON.stringify(streamLog),
      })
      .where(eq(gladiators.id, gladiator.id));

    await broadcastGladiatorUpdate(gladiator.id, {
      type: 'gladiator_complete',
      gladiatorId: gladiator.id,
      success: false,
    });
  }
}
