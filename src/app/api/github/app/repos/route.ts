/**
 * GitHub App Repositories API
 *
 * GET /api/github/app/repos - List repos accessible via GitHub App installations
 * POST /api/github/app/repos - Refresh/sync repos from GitHub
 */

import { NextResponse } from "next/server";
import { getUserAppRepos, getUserInstallations, syncInstallationRepos } from "@/lib/github/app";
import { requireUser } from "@/lib/session";

/**
 * GET - List all repos accessible via user's GitHub App installations
 */
export async function GET() {
  try {
    const user = await requireUser();

    // Get installations to check if user has any
    const installations = await getUserInstallations(user.id);

    if (installations.length === 0) {
      return NextResponse.json({
        repos: [],
        hasInstallation: false,
        message: "No GitHub App installation found. Install the app to access repositories.",
      });
    }

    // Get all accessible repos
    const repos = await getUserAppRepos(user.id);

    return NextResponse.json({
      repos: repos.map((repo) => ({
        id: repo.repoId,
        fullName: repo.repoFullName,
        name: repo.repoFullName.split("/")[1],
        private: repo.private,
        installationId: repo.installationId,
        account: repo.accountLogin,
      })),
      hasInstallation: true,
      installationCount: installations.length,
    });
  } catch (error) {
    console.error("Error fetching GitHub App repos:", error);
    return NextResponse.json({ error: "Failed to fetch repositories" }, { status: 500 });
  }
}

/**
 * POST - Sync repos from GitHub for all user's installations
 */
export async function POST() {
  try {
    const user = await requireUser();

    const installations = await getUserInstallations(user.id);

    if (installations.length === 0) {
      return NextResponse.json({ error: "No GitHub App installation found" }, { status: 400 });
    }

    // Sync repos for each installation
    await Promise.all(installations.map((inst) => syncInstallationRepos(inst.installationId)));

    // Return updated repos
    const repos = await getUserAppRepos(user.id);

    return NextResponse.json({
      repos: repos.map((repo) => ({
        id: repo.repoId,
        fullName: repo.repoFullName,
        name: repo.repoFullName.split("/")[1],
        private: repo.private,
        installationId: repo.installationId,
        account: repo.accountLogin,
      })),
      synced: true,
    });
  } catch (error) {
    console.error("Error syncing GitHub App repos:", error);
    return NextResponse.json({ error: "Failed to sync repositories" }, { status: 500 });
  }
}
