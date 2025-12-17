/**
 * GitHub App Installation Processing
 *
 * Handles saving installation data when users install/update the GitHub App
 */

import {
  getInstallationOctokit,
  saveInstallation,
  syncInstallationRepos,
  deleteInstallation,
} from "./app";

/**
 * Process a GitHub App installation callback
 * Called after OAuth when installation_id and setup_action are present
 */
export async function processInstallation(
  userId: string,
  installationId: number,
  setupAction: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Handle deletion
    if (setupAction === "delete") {
      await deleteInstallation(installationId);
      return { success: true };
    }

    // For install or update, fetch installation details from GitHub
    const octokit = await getInstallationOctokit(installationId);

    // Get installation details
    const { data: installation } = await octokit.rest.apps.getInstallation({
      installation_id: installationId,
    });

    // Extract account info
    const account = installation.account;
    let accountLogin = "unknown";
    let accountType: "User" | "Organization" = "User";

    if (account) {
      if ("login" in account && account.login) {
        accountLogin = account.login;
        accountType =
          "type" in account && account.type === "Organization"
            ? "Organization"
            : "User";
      } else if ("slug" in account && account.slug) {
        accountLogin = account.slug;
        accountType = "Organization";
      } else if ("name" in account && account.name) {
        accountLogin = account.name;
        accountType = "Organization";
      }
    }

    // Save installation to database
    await saveInstallation(userId, {
      installationId,
      accountLogin,
      accountType,
      repositorySelection: installation.repository_selection as "all" | "selected",
    });

    // Sync accessible repositories
    await syncInstallationRepos(installationId);

    return { success: true };
  } catch (error) {
    console.error("Failed to process installation:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
