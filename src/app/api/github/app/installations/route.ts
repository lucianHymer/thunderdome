/**
 * GitHub App Installations API
 *
 * GET /api/github/app/installations - List user's GitHub App installations
 */

import { NextResponse } from "next/server";
import { getUserInstallations } from "@/lib/github/app";
import { requireUser } from "@/lib/session";

/**
 * GET - List all user's GitHub App installations
 */
export async function GET() {
  try {
    const user = await requireUser();

    const installations = await getUserInstallations(user.id);

    return NextResponse.json({
      installations: installations.map((inst) => ({
        id: inst.id,
        installationId: inst.installationId,
        accountLogin: inst.accountLogin,
        accountType: inst.accountType,
        repositorySelection: inst.repositorySelection,
        createdAt: inst.createdAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Error fetching installations:", error);
    return NextResponse.json({ error: "Failed to fetch installations" }, { status: 500 });
  }
}
