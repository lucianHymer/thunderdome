/**
 * Consul Runner
 *
 * Runs the Consul AI inside a Docker container for post-verdict actions.
 * The Consul has access to git tools for merging, creating PRs, etc.
 */

import type { AgentEvent } from "@/lib/docker/agent-client";
import type { TrialContainer } from "@/lib/docker/container";
import { checkRepoAccess, getInstallationToken } from "@/lib/github/app";
import {
  destroyTrialContainer,
  getTrialContainer,
  startTrialContainer,
} from "../container-service";
import { buildConsulContext, buildConsulSystemPrompt } from "./prompts";

interface Gladiator {
  id: string;
  name: string;
  persona: string;
  responseContent: string | null;
  branchName: string;
}

interface Judge {
  id: string;
  name: string;
  focus: string;
  evaluation: string | null;
}

interface Verdict {
  summary: string;
  winnerGladiatorId: string | null;
  reasoning: string;
}

interface Trial {
  id: string;
  challengePrompt: string;
  repoUrl: string | null;
  trialType: string;
}

interface ConsulContext {
  trial: Trial;
  gladiators: Gladiator[];
  judges: Judge[];
  verdict: Verdict;
}

// In-memory session management for Consul containers
// Key: trialId, Value: { sessionId, container, lastActivity }
const consulSessions = new Map<
  string,
  {
    sessionId: string;
    container: TrialContainer;
    lastActivity: Date;
  }
>();

// Cleanup idle sessions after 10 minutes
const SESSION_IDLE_TIMEOUT = 10 * 60 * 1000;

/**
 * Parse owner/repo from GitHub URL
 */
function parseRepoFullName(repoUrl: string): string {
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
function buildAuthenticatedUrl(repoUrl: string, token: string): string {
  const url = new URL(repoUrl.endsWith(".git") ? repoUrl : `${repoUrl}.git`);
  url.username = "x-access-token";
  url.password = token;
  return url.toString();
}

/**
 * Get or create a Consul container session for a trial
 */
async function getOrCreateConsulSession(
  trialId: string,
  context: ConsulContext,
  userId: string,
  claudeToken: string,
): Promise<{ sessionId: string; container: TrialContainer }> {
  // Check for existing Consul session
  const existing = consulSessions.get(trialId);
  if (existing) {
    // Update last activity
    existing.lastActivity = new Date();
    return { sessionId: existing.sessionId, container: existing.container };
  }

  // Need to create session - check if trial container still exists
  if (!context.trial.repoUrl) {
    throw new Error("Trial has no repository URL - cannot start Consul with git access");
  }

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
    const repoFullName = parseRepoFullName(context.trial.repoUrl);
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
    const authUrl = buildAuthenticatedUrl(context.trial.repoUrl, gitToken);
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

  // Build system prompt with git tools context
  const systemPrompt = buildConsulSystemPromptWithTools(context);
  const trialContext = buildConsulContext(context);

  // Create session on agent server
  const agentClient = container.getAgentClient();
  const session = await agentClient.createSession({
    model: "opus",
    systemPrompt: `${systemPrompt}\n\n# Trial Context\n${trialContext}`,
    tools: ["Read", "Bash", "Glob", "Grep"], // Git tools via Bash
    cwd: "/workspace/repo",
    maxTurns: 25,
    oauthToken: claudeToken,
  });

  // Store session
  consulSessions.set(trialId, {
    sessionId: session.sessionId,
    container,
    lastActivity: new Date(),
  });

  return { sessionId: session.sessionId, container };
}

/**
 * Build Consul system prompt with git tools context
 */
function buildConsulSystemPromptWithTools(context: ConsulContext): string {
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

/**
 * Send a message to the Consul and stream the response
 */
export async function sendConsulMessage(
  trialId: string,
  message: string,
  context: ConsulContext,
  userId: string,
  claudeToken: string,
  onEvent: (event: AgentEvent) => void | Promise<void>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { sessionId, container } = await getOrCreateConsulSession(
      trialId,
      context,
      userId,
      claudeToken,
    );

    const agentClient = container.getAgentClient();

    // Update last activity
    const session = consulSessions.get(trialId);
    if (session) {
      session.lastActivity = new Date();
    }

    // Send message and stream response
    const result = await agentClient.sendMessage(sessionId, message, claudeToken, onEvent);

    return {
      success: result.success,
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * End a Consul session and destroy the container
 */
export async function endConsulSession(trialId: string): Promise<void> {
  const session = consulSessions.get(trialId);
  if (session) {
    try {
      await session.container.getAgentClient().endSession(session.sessionId);
    } catch {
      // Ignore session end errors
    }
    await destroyTrialContainer(trialId);
    consulSessions.delete(trialId);
  }
}

/**
 * Check if a Consul session exists for a trial
 */
export function hasConsulSession(trialId: string): boolean {
  return consulSessions.has(trialId);
}

/**
 * Cleanup idle Consul sessions (call periodically)
 */
export async function cleanupIdleConsulSessions(): Promise<void> {
  const now = Date.now();
  const toCleanup: string[] = [];

  for (const [trialId, session] of consulSessions.entries()) {
    if (now - session.lastActivity.getTime() > SESSION_IDLE_TIMEOUT) {
      toCleanup.push(trialId);
    }
  }

  for (const trialId of toCleanup) {
    await endConsulSession(trialId);
  }
}

// Start cleanup interval
setInterval(cleanupIdleConsulSessions, 60000); // Check every minute
