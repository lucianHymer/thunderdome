/**
 * Consul API Endpoint (Legacy Wrapper)
 *
 * POST /api/trials/:id/consul - Stream Consul conversation responses
 *
 * This route now delegates to the unified discovery endpoint with mode="consul"
 */

import { type NextRequest } from "next/server";
import { POST as UnifiedPOST } from "../discovery/route";

/**
 * POST - Send message to Consul and stream response
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Parse body and inject mode="consul"
  const body = await request.json();
  const modifiedBody = { ...body, mode: "consul" };

  // Create new request with modified body
  const modifiedRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(modifiedBody),
  });

  // Delegate to unified discovery route
  return UnifiedPOST(modifiedRequest as NextRequest, { params });
}
