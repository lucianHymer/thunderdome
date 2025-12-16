/**
 * GitHub App Installation Management API
 *
 * DELETE /api/github/app/installations/[installationId] - Remove an installation
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { deleteInstallation } from "@/lib/github/app";
import { db } from "@/db";
import { githubAppInstallations } from "@/db/schema";
import { eq, and } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ installationId: string }>;
}

/**
 * DELETE - Remove a GitHub App installation from our database
 * Note: This doesn't uninstall from GitHub, just removes our tracking
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { installationId } = await params;

    const installationIdNum = Number.parseInt(installationId, 10);
    if (Number.isNaN(installationIdNum)) {
      return NextResponse.json(
        { error: "Invalid installation ID" },
        { status: 400 }
      );
    }

    // Verify the installation belongs to this user
    const [installation] = await db
      .select()
      .from(githubAppInstallations)
      .where(
        and(
          eq(githubAppInstallations.installationId, installationIdNum),
          eq(githubAppInstallations.userId, user.id)
        )
      )
      .limit(1);

    if (!installation) {
      return NextResponse.json(
        { error: "Installation not found" },
        { status: 404 }
      );
    }

    await deleteInstallation(installationIdNum);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting installation:", error);
    return NextResponse.json(
      { error: "Failed to delete installation" },
      { status: 500 }
    );
  }
}
