/**
 * NextAuth API Route Handler
 *
 * Handles all authentication requests:
 * - /api/auth/signin
 * - /api/auth/signout
 * - /api/auth/callback
 * - /api/auth/session
 */

import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
