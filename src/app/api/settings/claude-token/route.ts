/**
 * Claude Token Storage API
 *
 * POST /api/settings/claude-token - Save encrypted Claude API token
 * DELETE /api/settings/claude-token - Remove Claude API token
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { encrypt, decrypt } from "@/lib/encryption";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST - Save Claude API token (encrypted)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

    const body = await request.json();
    const { token } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    // Encrypt the token before storing
    const encryptedToken = encrypt(token);

    // Update user record with encrypted token
    await db
      .update(users)
      .set({
        claudeToken: encryptedToken,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving Claude token:", error);
    return NextResponse.json(
      { error: "Failed to save token" },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Remove Claude API token
 */
export async function DELETE() {
  try {
    const user = await requireUser();

    // Remove token from user record
    await db
      .update(users)
      .set({
        claudeToken: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting Claude token:", error);
    return NextResponse.json(
      { error: "Failed to delete token" },
      { status: 500 }
    );
  }
}

/**
 * GET - Check if user has a Claude token (doesn't return the token)
 */
export async function GET() {
  try {
    const user = await requireUser();

    // Get user record to check for token
    const [userRecord] = await db
      .select({ claudeToken: users.claudeToken })
      .from(users)
      .where(eq(users.id, user.id));

    return NextResponse.json({
      hasToken: !!userRecord?.claudeToken,
    });
  } catch (error) {
    console.error("Error checking Claude token:", error);
    return NextResponse.json(
      { error: "Failed to check token" },
      { status: 500 }
    );
  }
}
