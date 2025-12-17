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

import { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";

const { GET: nextAuthGet, POST } = handlers;

/**
 * Wrapped GET handler that processes GitHub App installation params
 * GitHub sends installation_id and setup_action when app is installed/updated
 */
async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const installationId = url.searchParams.get("installation_id");
  const setupAction = url.searchParams.get("setup_action");

  // Process the normal auth flow first
  const response = await nextAuthGet(request);

  // If this is a GitHub callback with installation params, process them
  // We do this after auth so we have a session
  if (
    url.pathname.includes("/callback/github") &&
    installationId &&
    setupAction
  ) {
    // Store installation params in a cookie for processing after redirect
    // The actual processing happens in middleware or the redirect target
    response.headers.set(
      "Set-Cookie",
      `pending_installation=${installationId}:${setupAction}; Path=/; HttpOnly; SameSite=Lax; Max-Age=60`
    );
  }

  return response;
}

export { GET, POST };
