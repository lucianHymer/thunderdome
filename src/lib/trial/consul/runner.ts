/**
 * Consul Runner
 *
 * Domain-specific helper functions for Consul AI operations.
 * The Consul has access to git tools for merging, creating PRs, etc.
 */

import type { TrialContainer } from "@/lib/docker/container";
import { checkRepoAccess, getInstallationToken } from "@/lib/github/app";
import {
  destroyTrialContainer,
  getTrialContainer,
  startTrialContainer,
} from "../container-service";
import { buildConsulSystemPrompt } from "./prompts";

export interface Gladiator {
  id: string;
  name: string;
  persona: string;
  responseContent: string | null;
  branchName: string;
}

export interface Judge {
  id: string;
  name: string;
  focus: string;
  evaluation: string | null;
}

export interface Verdict {
  summary: string;
  winnerGladiatorId: string | null;
  reasoning: string;
}

export interface Trial {
  id: string;
  challengePrompt: string;
  repoUrl: string | null;
  trialType: string;
}

export interface ConsulContext {
  trial: Trial;
  gladiators: Gladiator[];
  judges: Judge[];
  verdict: Verdict;
}

/**
 * Parse owner/repo from GitHub URL
 */
export function parseRepoFullName(repoUrl: string): string {
  const httpsMatch = repoUrl.match(/github\.com\/([^/]+\/[^/.]+)/);
  if (httpsMatch) {
    return httpsMatch[1];
  }
  const sshMatch = repoUrl.match(/github\.com:([^/]+\/[^/.]+)/);
  if (sshMatch) {
    return sshMatch[1];
  }
  throw new Error(`Unable to parse repository from URL: ${repoUrl}`);
}

/**
 * Build authenticated git URL
 */
export function buildAuthenticatedUrl(repoUrl: string, token: string): string {
  const url = new URL(repoUrl.endsWith(".git") ? repoUrl : `${repoUrl}.git`);
  url.username = "x-access-token";
  url.password = token;
  return url.toString();
}

/**
 * Ensure a Consul container exists and is set up with git credentials
 * Reuses existing container if healthy, otherwise creates a new one
 */
export async function ensureConsulContainer(
  trialId: string,
  repoUrl: string,
  userId: string,
): Promise<void> {
  // Try to reuse existing trial container (from gladiator/arbiter phase)
  let container: TrialContainer | undefined = getTrialContainer(trialId);

  if (container) {
    // Container exists - check if agent server is still healthy
    const agentClient = container.getAgentClient();
    const isHealthy = await agentClient.isHealthy();
    if (!isHealthy) {
      // Container exists but agent server died - destroy and recreate
      await destroyTrialContainer(trialId);
      container = undefined;
    }
  }

  if (!container) {
    // No existing container - spin up fresh one
    // Get GitHub App token
    const repoFullName = parseRepoFullName(repoUrl);
    const accessResult = await checkRepoAccess(repoFullName, userId);
    if (!accessResult.hasAccess) {
      throw new Error("GitHub App not installed or repo not accessible");
    }

    const repoName = repoFullName.split("/")[1];
    const tokenResult = await getInstallationToken(accessResult.installationId, [repoName]);
    const gitToken = tokenResult.token;

    // Start container
    container = await startTrialContainer(trialId);

    // Wait for agent server
    const isHealthy = await container.waitForAgentServer(60000);
    if (!isHealthy) {
      await destroyTrialContainer(trialId);
      throw new Error("Agent server failed to start");
    }

    // Clone repository with all branches (not shallow - need branch history)
    const authUrl = buildAuthenticatedUrl(repoUrl, gitToken);
    const { exitCode: cloneCode } = await container.exec([
      "sh",
      "-c",
      `git clone "${authUrl}" /workspace/repo 2>&1`,
    ]);

    if (cloneCode !== 0) {
      await destroyTrialContainer(trialId);
      throw new Error("Failed to clone repository");
    }

    // Configure git identity
    await container.exec([
      "sh",
      "-c",
      'cd /workspace/repo && git config user.email "consul@thunderdome.app" && git config user.name "Thunderdome Consul"',
    ]);

    // Store credentials for push
    await container.exec([
      "sh",
      "-c",
      `git config --global credential.helper store && echo "https://x-access-token:${gitToken}@github.com" > ~/.git-credentials`,
    ]);

    // Fetch all remote branches
    await container.exec(["sh", "-c", "cd /workspace/repo && git fetch origin --prune"]);
  }
}

/**
 * Build Consul system prompt with git tools context
 */
export function buildConsulSystemPromptWithTools(context: ConsulContext): string {
  const basePrompt = buildConsulSystemPrompt(context);

  const toolsAddendum = `

# Tools Available

You have access to git and GitHub CLI tools to execute decree actions:

## Git Commands (via Bash)
- \`git branch -a\` - List all branches including remote
- \`git log <branch> --oneline -10\` - View recent commits on a branch
- \`git diff main...<branch>\` - Compare branch to main
- \`git merge <branch>\` - Merge a branch into current branch
- \`git cherry-pick <commit>\` - Pick specific commits
- \`git push origin main\` - Push changes to remote

## GitHub CLI (via Bash)
- \`gh pr create --title "..." --body "..."\` - Create a pull request
- \`gh pr list\` - List open pull requests
- \`gh pr merge <number>\` - Merge a pull request

## Important Notes
- Always confirm with the user before executing destructive actions
- Use \`git log\` and \`git diff\` to review changes before merging
- When creating PRs, include a clear title and description
- The repository is cloned at /workspace/repo

## Gladiator Branches
${context.gladiators.map((g) => `- ${g.name}: \`${g.branchName}\``).join("\n")}
`;

  return basePrompt + toolsAddendum;
}
