/**
 * GitHub App Installation Callback
 *
 * GET /api/github/app/callback - Handle GitHub App installation callback
 *
 * GitHub redirects here after user installs or modifies the app installation.
 * Query params:
 * - installation_id: The installation ID
 * - setup_action: "install" | "update" | "delete"
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import {
  getInstallationOctokit,
  saveInstallation,
  syncInstallationRepos,
  deleteInstallation,
} from "@/lib/github/app";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();

    const searchParams = request.nextUrl.searchParams;
    const installationId = searchParams.get("installation_id");
    const setupAction = searchParams.get("setup_action");

    if (!installationId) {
      return NextResponse.redirect(
        `/?error=${encodeURIComponent("Missing installation_id from GitHub")}`
      );
    }

    const installationIdNum = Number.parseInt(installationId, 10);

    // Handle deletion
    if (setupAction === "delete") {
      await deleteInstallation(installationIdNum);
      return NextResponse.redirect("/?message=GitHub+App+installation+removed");
    }

    // For install or update, fetch installation details from GitHub
    const octokit = await getInstallationOctokit(installationIdNum);

    // Get installation details
    const { data: installation } =
      await octokit.rest.apps.getInstallation({
        installation_id: installationIdNum,
      });

    // Extract account info - handle different account types
    const account = installation.account;
    let accountLogin = "unknown";
    let accountType: "User" | "Organization" = "User";

    if (account) {
      // User accounts have 'login', Organization accounts have 'slug' or 'name'
      if ("login" in account && account.login) {
        accountLogin = account.login;
        accountType = "type" in account && account.type === "Organization"
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
    await saveInstallation(user.id, {
      installationId: installationIdNum,
      accountLogin,
      accountType,
      repositorySelection: installation.repository_selection as "all" | "selected",
    });

    // Sync accessible repositories
    await syncInstallationRepos(installationIdNum);

    const action = setupAction === "update" ? "updated" : "installed";
    return NextResponse.redirect(
      `/?message=GitHub+App+${action}+successfully`
    );
  } catch (error) {
    console.error("GitHub App callback error:", error);
    return NextResponse.redirect(
      `/?error=${encodeURIComponent("Failed to complete GitHub App setup")}`
    );
  }
}
