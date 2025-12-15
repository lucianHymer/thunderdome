/**
 * NextAuth Middleware
 *
 * Protects routes that require authentication.
 * - /trials/* - All trial/battle related pages
 * - /settings - User settings page
 */

export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: ["/trials/:path*", "/settings"],
};
