/**
 * Process Pending GitHub App Installation
 *
 * POST /api/github/app/process-pending
 *
 * Called by client after redirect to process any pending installation
 * from the cookie set during OAuth callback
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { processInstallation } from "@/lib/github/installation";
import { requireUser } from "@/lib/session";

export async function POST() {
  try {
    const user = await requireUser();
    const cookieStore = await cookies();
    const pendingInstallation = cookieStore.get("pending_installation");

    if (!pendingInstallation?.value) {
      return NextResponse.json({ processed: false, reason: "no_pending" });
    }

    const [installationId, setupAction] = pendingInstallation.value.split(":");
    if (!installationId || !setupAction) {
      return NextResponse.json({ processed: false, reason: "invalid_cookie" });
    }

    console.log(`[ProcessPending] Processing installation ${installationId} for user ${user.id}`);
    const result = await processInstallation(user.id, parseInt(installationId, 10), setupAction);

    // Clear the cookie
    cookieStore.delete("pending_installation");

    if (result.success) {
      return NextResponse.json({ processed: true, action: setupAction });
    } else {
      return NextResponse.json({ processed: false, error: result.error }, { status: 500 });
    }
  } catch (error) {
    console.error("[ProcessPending] Error:", error);
    return NextResponse.json({ error: "Failed to process installation" }, { status: 500 });
  }
}
