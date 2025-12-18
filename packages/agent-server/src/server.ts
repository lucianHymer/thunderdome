/**
 * Agent Server
 *
 * HTTP server that manages Claude agent sessions within a Docker container.
 * Supports multiple concurrent sessions with SSE streaming.
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { runAgent } from "./claude.js";
import { createSession, endSession, getAllSessions, getSession } from "./sessions.js";
import type { CreateSessionRequest, SendMessageRequest } from "./types.js";

const app = new Hono();

// Enable CORS for container-to-host communication
app.use("/*", cors());

// Health check
app.get("/health", (c) => {
  return c.json({
    status: "healthy",
    sessions: getAllSessions().length,
    uptime: process.uptime(),
  });
});

// Create a new session
app.post("/sessions", async (c) => {
  try {
    const body = await c.req.json<CreateSessionRequest>();

    // Validate required fields
    if (!body.model || !body.tools || !body.cwd || !body.oauthToken) {
      return c.json({ error: "Missing required fields: model, tools, cwd, oauthToken" }, 400);
    }

    // Validate model
    if (!["opus", "sonnet", "haiku"].includes(body.model)) {
      return c.json({ error: "Invalid model. Must be: opus, sonnet, or haiku" }, 400);
    }

    const session = createSession({
      sessionId: body.sessionId,
      model: body.model,
      systemPrompt: body.systemPrompt,
      tools: body.tools,
      cwd: body.cwd,
      maxTurns: body.maxTurns,
    });

    return c.json({
      sessionId: session.id,
      status: session.status,
    });
  } catch (error) {
    console.error("Error creating session:", error);
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

// Get session info
app.get("/sessions/:id", (c) => {
  const sessionId = c.req.param("id");
  const session = getSession(sessionId);

  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  return c.json({
    sessionId: session.id,
    status: session.status,
    model: session.model,
    cwd: session.cwd,
    createdAt: session.createdAt.toISOString(),
    lastActivity: session.lastActivity.toISOString(),
  });
});

// Send message to session (streams response via SSE)
app.post("/sessions/:id/message", async (c) => {
  const sessionId = c.req.param("id");
  const session = getSession(sessionId);

  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  if (session.status === "streaming") {
    return c.json({ error: "Session is already processing a message" }, 409);
  }

  if (session.status === "ended") {
    return c.json({ error: "Session has ended" }, 410);
  }

  let body: SendMessageRequest;
  try {
    body = await c.req.json<SendMessageRequest>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.content || !body.oauthToken) {
    return c.json({ error: "Missing required fields: content, oauthToken" }, 400);
  }

  // Stream SSE response
  return streamSSE(c, async (stream) => {
    try {
      await runAgent({
        session,
        prompt: body.content,
        oauthToken: body.oauthToken,
        onEvent: async (event) => {
          await stream.writeSSE({
            event: event.event,
            data: JSON.stringify(event.data),
          });
        },
      });
    } catch (error) {
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      });
    }
  });
});

// End a session
app.delete("/sessions/:id", (c) => {
  const sessionId = c.req.param("id");
  const deleted = endSession(sessionId);

  if (!deleted) {
    return c.json({ error: "Session not found" }, 404);
  }

  return c.json({ success: true });
});

// List all sessions
app.get("/sessions", (c) => {
  const sessions = getAllSessions().map((s) => ({
    sessionId: s.id,
    status: s.status,
    model: s.model,
    cwd: s.cwd,
    createdAt: s.createdAt.toISOString(),
    lastActivity: s.lastActivity.toISOString(),
  }));

  return c.json({ sessions });
});

// Start server
const port = parseInt(process.env.PORT || "3000", 10);

console.log(`Agent server starting on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`Agent server running on http://0.0.0.0:${port}`);
