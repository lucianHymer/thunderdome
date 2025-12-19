import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { createSession, endSession, getAllSessions, getSession } from "./sessions.js";

// Create a minimal test app (without the actual Claude integration)
function createTestApp() {
  const app = new Hono();

  app.get("/health", (c) => {
    return c.json({
      status: "healthy",
      sessions: getAllSessions().length,
      uptime: process.uptime(),
    });
  });

  app.post("/sessions", async (c) => {
    const body = await c.req.json();

    if (!body.model || !body.tools || !body.cwd || !body.oauthToken) {
      return c.json({ error: "Missing required fields: model, tools, cwd, oauthToken" }, 400);
    }

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
  });

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
    });
  });

  app.delete("/sessions/:id", (c) => {
    const sessionId = c.req.param("id");
    const deleted = endSession(sessionId);

    if (!deleted) {
      return c.json({ error: "Session not found" }, 404);
    }

    return c.json({ success: true });
  });

  app.get("/sessions", (c) => {
    const sessions = getAllSessions().map((s) => ({
      sessionId: s.id,
      status: s.status,
      model: s.model,
      cwd: s.cwd,
    }));

    return c.json({ sessions });
  });

  return app;
}

describe("server API", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    // Clean up all sessions
    for (const session of getAllSessions()) {
      endSession(session.id);
    }
    app = createTestApp();
  });

  describe("GET /health", () => {
    it("returns healthy status", async () => {
      const res = await app.request("/health");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe("healthy");
      expect(body.sessions).toBe(0);
      expect(typeof body.uptime).toBe("number");
    });

    it("includes session count", async () => {
      createSession({ model: "sonnet", tools: [], cwd: "/test" });
      createSession({ model: "opus", tools: [], cwd: "/test2" });

      const res = await app.request("/health");
      const body = await res.json();
      expect(body.sessions).toBe(2);
    });
  });

  describe("POST /sessions", () => {
    it("creates a session with valid config", async () => {
      const res = await app.request("/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "sonnet",
          tools: ["Bash", "Read"],
          cwd: "/workspace",
          oauthToken: "test-token",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sessionId).toBeDefined();
      expect(body.status).toBe("ready");
    });

    it("accepts custom sessionId", async () => {
      const res = await app.request("/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "my-custom-id",
          model: "opus",
          tools: [],
          cwd: "/test",
          oauthToken: "test-token",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sessionId).toBe("my-custom-id");
    });

    it("rejects missing model", async () => {
      const res = await app.request("/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tools: [],
          cwd: "/test",
          oauthToken: "test-token",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Missing required fields");
    });

    it("rejects invalid model", async () => {
      const res = await app.request("/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4",
          tools: [],
          cwd: "/test",
          oauthToken: "test-token",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid model");
    });

    it("rejects missing oauthToken", async () => {
      const res = await app.request("/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "sonnet",
          tools: [],
          cwd: "/test",
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /sessions/:id", () => {
    it("returns session info", async () => {
      createSession({
        sessionId: "get-info-test",
        model: "haiku",
        tools: ["Edit"],
        cwd: "/myworkspace",
      });

      const res = await app.request("/sessions/get-info-test");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.sessionId).toBe("get-info-test");
      expect(body.status).toBe("ready");
      expect(body.model).toBe("haiku");
      expect(body.cwd).toBe("/myworkspace");
    });

    it("returns 404 for nonexistent session", async () => {
      const res = await app.request("/sessions/nonexistent");
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBe("Session not found");
    });
  });

  describe("DELETE /sessions/:id", () => {
    it("deletes existing session", async () => {
      createSession({
        sessionId: "to-delete",
        model: "sonnet",
        tools: [],
        cwd: "/test",
      });

      const res = await app.request("/sessions/to-delete", {
        method: "DELETE",
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Verify it's gone
      expect(getSession("to-delete")).toBeUndefined();
    });

    it("returns 404 for nonexistent session", async () => {
      const res = await app.request("/sessions/nonexistent", {
        method: "DELETE",
      });

      expect(res.status).toBe(404);
    });
  });

  describe("GET /sessions", () => {
    it("lists all sessions", async () => {
      createSession({ sessionId: "list-1", model: "sonnet", tools: [], cwd: "/a" });
      createSession({ sessionId: "list-2", model: "opus", tools: [], cwd: "/b" });

      const res = await app.request("/sessions");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.sessions.length).toBe(2);
      expect(body.sessions.map((s: any) => s.sessionId).sort()).toEqual(["list-1", "list-2"]);
    });

    it("returns empty array when no sessions", async () => {
      const res = await app.request("/sessions");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.sessions).toEqual([]);
    });
  });
});
