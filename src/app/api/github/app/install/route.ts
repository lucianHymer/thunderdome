/**
 * GitHub App Installation Redirect
 *
 * GET /api/github/app/install - Redirect user to GitHub App installation page
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";

const GITHUB_APP_SLUG = "the-thunderdome-app"; // Update this to your app's slug

export async function GET() {
  try {
    // Ensure user is authenticated
    await requireUser();

    // Redirect to GitHub App installation page
    const installUrl = `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`;

    return NextResponse.redirect(installUrl);
  } catch {
    return NextResponse.redirect("/");
  }
}
