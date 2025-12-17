/**
 * NextAuth API Route Handler
 *
 * Handles all authentication requests:
 * - /api/auth/signin
 * - /api/auth/signout
 * - /api/auth/callback
 * - /api/auth/session
 *
 * Also handles GitHub App installation params that come with OAuth callback
 */

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { handlers } from "@/lib/auth";
import { auth } from "@/lib/auth";
import { processInstallation } from "@/lib/github/installation";

const { GET: nextAuthGet, POST } = handlers;

/**
 * Wrapped GET handler that processes GitHub App installation params
 * GitHub sends installation_id and setup_action when app is installed/updated
 */
async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const installationId = url.searchParams.get("installation_id");
  const setupAction = url.searchParams.get("setup_action");
  const isGitHubCallback = url.pathname.includes("/callback/github");

  // If this is an installation update and user is already logged in,
  // process it directly without going through OAuth (which would fail PKCE)
  if (isGitHubCallback && installationId && setupAction) {
    const session = await auth();

    if (session?.user?.id) {
      // User is already logged in - process installation directly
      console.log(`[Auth] Processing installation ${installationId} for logged-in user ${session.user.id}`);
      await processInstallation(session.user.id, parseInt(installationId, 10), setupAction);

      // Redirect to home with success message
      // Use headers to get the real host, not the internal one
      const host = request.headers.get("host") || "localhost:3000";
      const protocol = request.headers.get("x-forwarded-proto") || "https";
      const redirectUrl = new URL(`${protocol}://${host}/`);
      redirectUrl.searchParams.set("message", `GitHub App ${setupAction}d successfully`);
      return NextResponse.redirect(redirectUrl);
    }

    // User not logged in - store installation for after OAuth completes
    const cookieStore = await cookies();
    cookieStore.set("pending_installation", `${installationId}:${setupAction}`, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60,
    });
  }

  // Process the normal auth flow
  return nextAuthGet(request);
}

export { GET, POST };
