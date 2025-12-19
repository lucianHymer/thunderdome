/**
 * Interactive Setup Discovery API (Legacy Wrapper)
 *
 * POST /api/trials/:id/setup - Send messages to setup discovery session
 *
 * This route now delegates to the unified discovery endpoint with mode="setup"
 */

import { type NextRequest } from "next/server";
import { POST as UnifiedPOST } from "../discovery/route";

/**
 * POST - Send message to setup discovery session
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Parse body and inject mode="setup"
  const body = await request.json();
  const modifiedBody = { ...body, mode: "setup" };

  // Create new request with modified body
  const modifiedRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(modifiedBody),
  });

  // Delegate to unified discovery route
  return UnifiedPOST(modifiedRequest as NextRequest, { params });
}
