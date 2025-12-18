import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentServerClient, createAgentClient } from "./agent-client";

describe("AgentServerClient", () => {
  let client: AgentServerClient;

  beforeEach(() => {
    client = new AgentServerClient("127.0.0.1", 3000);
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("builds correct base URL", () => {
      const client1 = new AgentServerClient("localhost", 3000);
      expect(client1["baseUrl"]).toBe("http://localhost:3000");

      const client2 = new AgentServerClient("192.168.1.1", 8080);
      expect(client2["baseUrl"]).toBe("http://192.168.1.1:8080");
    });
  });

  describe("createAgentClient", () => {
    it("creates a client instance", () => {
      const client = createAgentClient("host", 4000);
      expect(client).toBeInstanceOf(AgentServerClient);
      expect(client["baseUrl"]).toBe("http://host:4000");
    });

    it("uses default port 3000", () => {
      const client = createAgentClient("myhost");
      expect(client["baseUrl"]).toBe("http://myhost:3000");
    });
  });

  describe("isHealthy", () => {
    it("returns true when server responds 200", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: "healthy" }),
      });

      const result = await client.isHealthy();
      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        "http://127.0.0.1:3000/health",
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it("returns false when server responds non-200", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await client.isHealthy();
      expect(result).toBe(false);
    });

    it("returns false when fetch throws", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

      const result = await client.isHealthy();
      expect(result).toBe(false);
    });
  });

  describe("createSession", () => {
    it("sends correct request and returns session info", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            sessionId: "sess_123",
            status: "ready",
          }),
      });

      const result = await client.createSession({
        model: "sonnet",
        tools: ["Bash", "Read"],
        cwd: "/workspace",
        oauthToken: "token123",
      });

      expect(fetch).toHaveBeenCalledWith(
        "http://127.0.0.1:3000/sessions",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "sonnet",
            tools: ["Bash", "Read"],
            cwd: "/workspace",
            oauthToken: "token123",
          }),
        })
      );

      expect(result.sessionId).toBe("sess_123");
      expect(result.status).toBe("ready");
    });

    it("throws on error response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: "Invalid model" }),
      });

      await expect(
        client.createSession({
          model: "sonnet",
          tools: [],
          cwd: "/test",
          oauthToken: "token",
        })
      ).rejects.toThrow("Invalid model");
    });
  });

  describe("getSession", () => {
    it("returns session info", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            sessionId: "sess_abc",
            status: "streaming",
            model: "opus",
            cwd: "/workspace",
          }),
      });

      const result = await client.getSession("sess_abc");

      expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:3000/sessions/sess_abc");
      expect(result.sessionId).toBe("sess_abc");
      expect(result.status).toBe("streaming");
    });

    it("throws on 404", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: "Session not found" }),
      });

      await expect(client.getSession("nonexistent")).rejects.toThrow(
        "Session not found"
      );
    });
  });

  describe("endSession", () => {
    it("sends DELETE request", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await client.endSession("sess_to_end");

      expect(fetch).toHaveBeenCalledWith(
        "http://127.0.0.1:3000/sessions/sess_to_end",
        { method: "DELETE" }
      );
    });

    it("does not throw on 404", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: "Session not found" }),
      });

      // Should not throw
      await client.endSession("nonexistent");
    });
  });

  describe("listSessions", () => {
    it("returns list of sessions", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            sessions: [
              { sessionId: "s1", status: "ready", model: "sonnet", cwd: "/a" },
              { sessionId: "s2", status: "streaming", model: "opus", cwd: "/b" },
            ],
          }),
      });

      const result = await client.listSessions();

      expect(result.length).toBe(2);
      expect(result[0].sessionId).toBe("s1");
      expect(result[1].sessionId).toBe("s2");
    });
  });
});
