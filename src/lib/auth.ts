/**
 * NextAuth v5 Configuration
 *
 * Handles GitHub OAuth authentication and session management.
 * Stores GitHub access tokens for repo access and user info.
 */

import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    GitHub({
      // Using GitHub App for both login and repo access (installed separately)
      clientId: process.env.GITHUB_APP_CLIENT_ID!,
      clientSecret: process.env.GITHUB_APP_CLIENT_SECRET!,
      authorization: {
        params: {
          // Only need user info - repo access comes from App installation
          scope: "read:user user:email",
        },
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      // Include user.id in the session for easy access
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  pages: {
    signIn: "/", // Redirect to home page for sign in
  },
  session: {
    strategy: "database", // Use database sessions for security
  },
});

// Extend the built-in session types
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
