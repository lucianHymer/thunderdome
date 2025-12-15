/**
 * Git Worktree Management
 *
 * Manages git worktrees for isolated gladiator branches
 */

import type { TrialContainer } from "@/lib/docker/container";

export interface WorktreeConfig {
  trialId: string;
  gladiatorName: string;
}

export async function createWorktree(
  container: TrialContainer,
  config: WorktreeConfig,
): Promise<string> {
  const branchName = `thunderdome/trial-${config.trialId}/${slugify(config.gladiatorName)}`;
  const worktreePath = `/workspace/${slugify(config.gladiatorName)}`;

  // Create branch and worktree
  await container.exec(["git", "checkout", "-b", branchName]);
  await container.exec(["git", "worktree", "add", worktreePath, branchName]);

  return worktreePath;
}

export async function pushWorktree(container: TrialContainer, branchName: string): Promise<void> {
  await container.exec(["git", "push", "origin", branchName]);
}

export async function pushAllWorktrees(container: TrialContainer, _trialId: string): Promise<void> {
  // Push all trial branches
  await container.exec(["git", "push", "origin", "--all", "--force-with-lease"]);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
