/**
 * Session Helper Functions
 *
 * Utilities for accessing and requiring authentication in server components and actions.
 */

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * Get the current authenticated user
 * @returns User object or null if not authenticated
 */
export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

/**
 * Require authentication - throws/redirects if not authenticated
 * Use this in server actions and protected pages
 * @returns User object (guaranteed to exist)
 */
export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  return user;
}

/**
 * Get the full session including user info
 * @returns Session object or null
 */
export async function getSession() {
  return await auth();
}
