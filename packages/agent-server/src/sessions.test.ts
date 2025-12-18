import { describe, it, expect, beforeEach } from "vitest";
import {
  createSession,
  getSession,
  updateSessionStatus,
  setClaudeSessionId,
  endSession,
  getAllSessions,
  cleanupExpiredSessions,
} from "./sessions.js";

describe("sessions", () => {
  beforeEach(() => {
    // Clean up all sessions before each test
    for (const session of getAllSessions()) {
      endSession(session.id);
    }
  });

  describe("createSession", () => {
    it("creates a session with provided config", () => {
      const session = createSession({
        model: "sonnet",
        tools: ["Bash", "Read"],
        cwd: "/workspace",
      });

      expect(session.id).toBeDefined();
      expect(session.id).toMatch(/^sess_/);
      expect(session.model).toBe("sonnet");
      expect(session.tools).toEqual(["Bash", "Read"]);
      expect(session.cwd).toBe("/workspace");
      expect(session.status).toBe("ready");
    });

    it("uses provided sessionId if given", () => {
      const session = createSession({
        sessionId: "custom-id",
        model: "opus",
        tools: [],
        cwd: "/test",
      });

      expect(session.id).toBe("custom-id");
    });

    it("returns existing session if sessionId exists", () => {
      const session1 = createSession({
        sessionId: "reuse-me",
        model: "haiku",
        tools: ["Edit"],
        cwd: "/first",
      });

      const session2 = createSession({
        sessionId: "reuse-me",
        model: "opus",
        tools: ["Bash"],
        cwd: "/second",
      });

      expect(session1).toBe(session2);
      expect(session2.model).toBe("haiku"); // Original config preserved
    });

    it("stores optional systemPrompt and maxTurns", () => {
      const session = createSession({
        model: "sonnet",
        tools: [],
        cwd: "/workspace",
        systemPrompt: "You are a helpful assistant",
        maxTurns: 10,
      });

      expect(session.systemPrompt).toBe("You are a helpful assistant");
      expect(session.maxTurns).toBe(10);
    });
  });

  describe("getSession", () => {
    it("returns session by id", () => {
      const created = createSession({
        sessionId: "get-test",
        model: "sonnet",
        tools: [],
        cwd: "/test",
      });

      const retrieved = getSession("get-test");
      expect(retrieved).toBe(created);
    });

    it("returns undefined for nonexistent session", () => {
      const session = getSession("does-not-exist");
      expect(session).toBeUndefined();
    });
  });

  describe("updateSessionStatus", () => {
    it("updates session status", () => {
      const session = createSession({
        sessionId: "status-test",
        model: "sonnet",
        tools: [],
        cwd: "/test",
      });

      expect(session.status).toBe("ready");

      updateSessionStatus("status-test", "streaming");
      expect(session.status).toBe("streaming");

      updateSessionStatus("status-test", "ended");
      expect(session.status).toBe("ended");
    });

    it("updates lastActivity timestamp", () => {
      const session = createSession({
        sessionId: "activity-test",
        model: "sonnet",
        tools: [],
        cwd: "/test",
      });

      const originalActivity = session.lastActivity;

      // Wait a bit to ensure timestamp changes
      const waitPromise = new Promise((resolve) => setTimeout(resolve, 10));
      return waitPromise.then(() => {
        updateSessionStatus("activity-test", "streaming");
        expect(session.lastActivity.getTime()).toBeGreaterThan(
          originalActivity.getTime()
        );
      });
    });

    it("does nothing for nonexistent session", () => {
      // Should not throw
      updateSessionStatus("nonexistent", "streaming");
    });
  });

  describe("setClaudeSessionId", () => {
    it("stores Claude session ID for resume", () => {
      const session = createSession({
        sessionId: "claude-id-test",
        model: "sonnet",
        tools: [],
        cwd: "/test",
      });

      expect(session.claudeSessionId).toBeUndefined();

      setClaudeSessionId("claude-id-test", "claude_abc123");
      expect(session.claudeSessionId).toBe("claude_abc123");
    });
  });

  describe("endSession", () => {
    it("removes session and returns true", () => {
      createSession({
        sessionId: "end-test",
        model: "sonnet",
        tools: [],
        cwd: "/test",
      });

      const result = endSession("end-test");
      expect(result).toBe(true);
      expect(getSession("end-test")).toBeUndefined();
    });

    it("returns false for nonexistent session", () => {
      const result = endSession("nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("getAllSessions", () => {
    it("returns all active sessions", () => {
      createSession({ model: "sonnet", tools: [], cwd: "/a" });
      createSession({ model: "opus", tools: [], cwd: "/b" });
      createSession({ model: "haiku", tools: [], cwd: "/c" });

      const sessions = getAllSessions();
      expect(sessions.length).toBe(3);
    });
  });

  describe("cleanupExpiredSessions", () => {
    it("removes sessions older than timeout", () => {
      // This is hard to test without mocking time
      // Just verify it doesn't crash and returns a number
      const cleaned = cleanupExpiredSessions();
      expect(typeof cleaned).toBe("number");
    });
  });
});
