/**
 * Git Worktree Management
 *
 * Manages git worktrees for isolated gladiator branches.
 *
 * Structure inside container:
 *   /workspace/repo/              <- Main clone (shared .git)
 *   /workspace/the-pragmatist/    <- Worktree for gladiator 1
 *   /workspace/the-paranoid/      <- Worktree for gladiator 2
 *   /workspace/the-minimalist/    <- Worktree for gladiator 3
 *
 * Each worktree has its own branch: thunderdome/trial-{id}/{gladiator-slug}
 */

import type { TrialContainer } from "@/lib/docker/container";

const REPO_PATH = "/workspace/repo";

export interface WorktreeConfig {
  trialId: string;
  gladiatorName: string;
}

/**
 * Clone a repository into the container
 */
export async function cloneRepo(
  container: TrialContainer,
  repoUrl: string,
  token: string,
): Promise<void> {
  // Construct authenticated URL: https://x-access-token:TOKEN@github.com/owner/repo.git
  const url = new URL(repoUrl.endsWith(".git") ? repoUrl : `${repoUrl}.git`);
  url.username = "x-access-token";
  url.password = token;

  await container.exec(["git", "clone", url.toString(), REPO_PATH]);

  // Configure git identity for commits
  await container.exec([
    "git",
    "-C",
    REPO_PATH,
    "config",
    "user.email",
    "gladiator@thunderdome.app",
  ]);
  await container.exec(["git", "-C", REPO_PATH, "config", "user.name", "Thunderdome Gladiator"]);
}

/**
 * Create a worktree for a gladiator with its own isolated branch
 */
export async function createWorktree(
  container: TrialContainer,
  config: WorktreeConfig,
): Promise<string> {
  const branchName = `thunderdome/trial-${config.trialId}/${slugify(config.gladiatorName)}`;
  const worktreePath = `/workspace/${slugify(config.gladiatorName)}`;

  // Create worktree with new branch from main repo
  // -b creates the branch, worktree path, starting from HEAD
  await container.exec(["git", "-C", REPO_PATH, "worktree", "add", "-b", branchName, worktreePath]);

  return worktreePath;
}

/**
 * Get the branch name for a gladiator
 */
export function getBranchName(trialId: string, gladiatorName: string): string {
  return `thunderdome/trial-${trialId}/${slugify(gladiatorName)}`;
}

/**
 * Commit all changes in a gladiator's worktree
 */
export async function commitWorktreeChanges(
  container: TrialContainer,
  worktreePath: string,
  message: string,
): Promise<void> {
  await container.exec(["git", "-C", worktreePath, "add", "-A"]);

  // Check if there are changes to commit
  const { exitCode } = await container.exec([
    "git",
    "-C",
    worktreePath,
    "diff",
    "--cached",
    "--quiet",
  ]);

  // exitCode 0 = no changes, 1 = has changes
  if (exitCode !== 0) {
    await container.exec(["git", "-C", worktreePath, "commit", "-m", message]);
  }
}

/**
 * Push a single gladiator's branch
 */
export async function pushWorktree(
  container: TrialContainer,
  branchName: string,
  token: string,
  repoUrl: string,
): Promise<void> {
  // Set up credentials for push
  const url = new URL(repoUrl.endsWith(".git") ? repoUrl : `${repoUrl}.git`);
  url.username = "x-access-token";
  url.password = token;

  await container.exec(["git", "-C", REPO_PATH, "push", url.toString(), branchName]);
}

/**
 * Push all trial branches at once
 */
export async function pushAllWorktrees(
  container: TrialContainer,
  trialId: string,
  token: string,
  repoUrl: string,
): Promise<void> {
  // Set up credentials for push
  const url = new URL(repoUrl.endsWith(".git") ? repoUrl : `${repoUrl}.git`);
  url.username = "x-access-token";
  url.password = token;

  // Push all branches matching our trial pattern
  // Using refspec to push all thunderdome branches
  await container.exec([
    "git",
    "-C",
    REPO_PATH,
    "push",
    url.toString(),
    "--force-with-lease",
    `refs/heads/thunderdome/trial-${trialId}/*:refs/heads/thunderdome/trial-${trialId}/*`,
  ]);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
