/**
 * GitHub App Integration
 *
 * Handles GitHub App authentication for code battles.
 * Provides scoped, short-lived tokens for repository access.
 */

import { and, eq } from "drizzle-orm";
import { App, type Octokit } from "octokit";
import { db } from "@/db";
import { githubAppInstallations, githubAppRepos } from "@/db/schema";

// Environment validation
function getAppConfig() {
  // GitHub recommends using Client ID for JWT generation (not App ID)
  // https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const privateKeyBase64 = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!clientId || !privateKeyBase64) {
    throw new Error(
      "GitHub App not configured. Set GITHUB_APP_CLIENT_ID and GITHUB_APP_PRIVATE_KEY environment variables.",
    );
  }

  // Decode base64 private key
  const privateKey = Buffer.from(privateKeyBase64, "base64").toString("utf-8");

  return { appId: clientId, privateKey };
}

// Singleton GitHub App instance
let appInstance: App | null = null;

/**
 * Get the GitHub App instance (singleton)
 */
export function getGitHubApp(): App {
  if (!appInstance) {
    const { appId, privateKey } = getAppConfig();
    appInstance = new App({
      appId,
      privateKey,
    });
  }
  return appInstance;
}

/**
 * Get an authenticated Octokit instance for a specific installation
 */
export async function getInstallationOctokit(installationId: number): Promise<Octokit> {
  const app = getGitHubApp();
  return app.getInstallationOctokit(installationId);
}

/**
 * Generate a short-lived installation access token for git operations
 * Token expires in 1 hour and is scoped to specific repositories
 */
export async function getInstallationToken(
  installationId: number,
  repositories?: string[], // Optional: scope to specific repos by name
): Promise<{
  token: string;
  expiresAt: Date;
  repositories?: string[];
}> {
  const octokit = await getInstallationOctokit(installationId);

  // Create installation access token
  const response = await octokit.rest.apps.createInstallationAccessToken({
    installation_id: installationId,
    ...(repositories && { repositories }),
  });

  return {
    token: response.data.token,
    expiresAt: new Date(response.data.expires_at),
    repositories: response.data.repositories?.map((r) => r.full_name),
  };
}

/**
 * Find the installation that has access to a specific repository
 */
export async function findInstallationForRepo(
  repoFullName: string,
  userId: string,
): Promise<{ installationId: number; accountLogin: string } | null> {
  // First check our cached repos
  const cachedRepo = await db
    .select({
      installationId: githubAppRepos.installationId,
      accountLogin: githubAppInstallations.accountLogin,
    })
    .from(githubAppRepos)
    .innerJoin(
      githubAppInstallations,
      eq(githubAppRepos.installationId, githubAppInstallations.installationId),
    )
    .where(
      and(eq(githubAppRepos.repoFullName, repoFullName), eq(githubAppInstallations.userId, userId)),
    )
    .limit(1);

  if (cachedRepo.length > 0) {
    return cachedRepo[0];
  }

  // If not cached, try to find via installation with "all" repos
  const allReposInstallation = await db
    .select()
    .from(githubAppInstallations)
    .where(
      and(
        eq(githubAppInstallations.userId, userId),
        eq(githubAppInstallations.repositorySelection, "all"),
      ),
    )
    .limit(1);

  if (allReposInstallation.length > 0) {
    // Verify the repo is accessible via this installation
    const octokit = await getInstallationOctokit(allReposInstallation[0].installationId);
    try {
      const [owner, repo] = repoFullName.split("/");
      await octokit.rest.repos.get({ owner, repo });
      return {
        installationId: allReposInstallation[0].installationId,
        accountLogin: allReposInstallation[0].accountLogin,
      };
    } catch {
      // Repo not accessible
      return null;
    }
  }

  return null;
}

/**
 * Result of checking repo access - includes reason for failure
 */
export type RepoAccessResult =
  | { hasAccess: true; installationId: number; accountLogin: string }
  | { hasAccess: false; reason: "no_installation" }
  | { hasAccess: false; reason: "repo_not_included"; installationId: number };

/**
 * Check if user has access to a repo and why not if they don't
 */
export async function checkRepoAccess(
  repoFullName: string,
  userId: string,
): Promise<RepoAccessResult> {
  // First check our cached repos
  const cachedRepo = await db
    .select({
      installationId: githubAppRepos.installationId,
      accountLogin: githubAppInstallations.accountLogin,
    })
    .from(githubAppRepos)
    .innerJoin(
      githubAppInstallations,
      eq(githubAppRepos.installationId, githubAppInstallations.installationId),
    )
    .where(
      and(eq(githubAppRepos.repoFullName, repoFullName), eq(githubAppInstallations.userId, userId)),
    )
    .limit(1);

  if (cachedRepo.length > 0) {
    return {
      hasAccess: true,
      installationId: cachedRepo[0].installationId,
      accountLogin: cachedRepo[0].accountLogin,
    };
  }

  // Check if user has any installation at all
  const anyInstallation = await db
    .select()
    .from(githubAppInstallations)
    .where(eq(githubAppInstallations.userId, userId))
    .limit(1);

  if (anyInstallation.length === 0) {
    return { hasAccess: false, reason: "no_installation" };
  }

  // User has installation but repo isn't included
  // Check if it's an "all repos" installation that might have access
  const allReposInstallation = anyInstallation.find((i) => i.repositorySelection === "all");

  if (allReposInstallation) {
    try {
      const octokit = await getInstallationOctokit(allReposInstallation.installationId);
      const [owner, repo] = repoFullName.split("/");
      await octokit.rest.repos.get({ owner, repo });
      return {
        hasAccess: true,
        installationId: allReposInstallation.installationId,
        accountLogin: allReposInstallation.accountLogin,
      };
    } catch {
      // Repo not accessible even with "all" selection
    }
  }

  // Has installation but repo not included
  return {
    hasAccess: false,
    reason: "repo_not_included",
    installationId: anyInstallation[0].installationId,
  };
}

/**
 * Get a token for git operations on a specific repository
 * Returns null if no installation has access to the repo
 */
export async function getRepoToken(
  repoFullName: string,
  userId: string,
): Promise<{ token: string; expiresAt: Date } | null> {
  const installation = await findInstallationForRepo(repoFullName, userId);
  if (!installation) {
    return null;
  }

  const repoName = repoFullName.split("/")[1];
  return getInstallationToken(installation.installationId, [repoName]);
}

/**
 * Sync repositories for an installation from GitHub API
 */
export async function syncInstallationRepos(installationId: number): Promise<void> {
  const octokit = await getInstallationOctokit(installationId);

  // Get all repos accessible by this installation
  const repos = await octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, {
    per_page: 100,
  });

  // Delete existing cached repos for this installation
  await db.delete(githubAppRepos).where(eq(githubAppRepos.installationId, installationId));

  // Insert new repos
  if (repos.length > 0) {
    await db.insert(githubAppRepos).values(
      repos.map((repo) => ({
        installationId,
        repoFullName: repo.full_name,
        repoId: repo.id,
        private: repo.private,
      })),
    );
  }
}

/**
 * Get the GitHub App installation URL for user authorization
 */
export function getInstallationUrl(): string {
  const { appId } = getAppConfig();
  // GitHub uses the app slug (name in URL format) but we can use installation endpoint
  return `https://github.com/apps/the-thunderdome-app/installations/new`;
}

/**
 * List all installations for a user
 */
export async function getUserInstallations(userId: string) {
  return db.select().from(githubAppInstallations).where(eq(githubAppInstallations.userId, userId));
}

/**
 * List all repos accessible to a user via their GitHub App installations
 */
export async function getUserAppRepos(userId: string) {
  return db
    .select({
      repoFullName: githubAppRepos.repoFullName,
      repoId: githubAppRepos.repoId,
      private: githubAppRepos.private,
      installationId: githubAppRepos.installationId,
      accountLogin: githubAppInstallations.accountLogin,
    })
    .from(githubAppRepos)
    .innerJoin(
      githubAppInstallations,
      eq(githubAppRepos.installationId, githubAppInstallations.installationId),
    )
    .where(eq(githubAppInstallations.userId, userId));
}

/**
 * Store a new installation in the database
 */
export async function saveInstallation(
  userId: string,
  installation: {
    installationId: number;
    accountLogin: string;
    accountType: "User" | "Organization";
    repositorySelection: "all" | "selected";
  },
): Promise<void> {
  await db
    .insert(githubAppInstallations)
    .values({
      userId,
      ...installation,
    })
    .onConflictDoUpdate({
      target: githubAppInstallations.installationId,
      set: {
        repositorySelection: installation.repositorySelection,
        updatedAt: new Date(),
      },
    });
}

/**
 * Remove an installation from the database
 */
export async function deleteInstallation(installationId: number): Promise<void> {
  await db
    .delete(githubAppInstallations)
    .where(eq(githubAppInstallations.installationId, installationId));
  // Repos are cascade deleted via foreign key
}
