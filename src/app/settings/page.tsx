/**
 * Settings Page
 *
 * Allows users to manage their Claude API token.
 * Protected route - requires authentication.
 */

import { eq } from "drizzle-orm";
import { ClaudeTokenForm } from "@/components/auth/claude-token-form";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/session";

export default async function SettingsPage() {
  const user = await requireUser();

  // Check if user has a Claude token
  const [userRecord] = await db
    .select({ claudeToken: users.claudeToken })
    .from(users)
    .where(eq(users.id, user.id));

  const hasToken = !!userRecord?.claudeToken;

  return (
    <div className="container mx-auto max-w-2xl py-12 px-4">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>

      <div className="space-y-8">
        {/* Claude API Token Section */}
        <section className="border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Claude API Token</h2>
          <p className="text-gray-400 mb-6">
            Your Claude API token is used to run AI battles. It will be stored encrypted and never
            shared.
          </p>

          <ClaudeTokenForm hasToken={hasToken} />
        </section>

        {/* User Info Section */}
        <section className="border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Account</h2>
          <div className="space-y-2">
            <p>
              <span className="font-medium">Name:</span> {user.name}
            </p>
            <p>
              <span className="font-medium">Email:</span> {user.email}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
