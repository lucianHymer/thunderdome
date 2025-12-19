/**
 * Tests for Agent Session Manager
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "../docker/agent-client";
import * as containerService from "../trial/container-service";
import { createAgentSessionManager } from "./agent-session";

// Mock the container service
vi.mock("../trial/container-service");

describe("AgentSessionManager", () => {
  const mockAgentClient = {
    createSession: vi.fn(),
    sendMessage: vi.fn(),
    endSession: vi.fn(),
    isHealthy: vi.fn(),
  };

  const mockContainer = {
    getAgentClient: vi.fn(() => mockAgentClient),
    exec: vi.fn(),
    destroy: vi.fn(),
    waitForAgentServer: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(containerService.getTrialContainer).mockReturnValue(mockContainer as any);
  });

  describe("getOrCreateSession", () => {
    it("creates a new session if none exists", async () => {
      const manager = createAgentSessionManager("test");
      mockAgentClient.createSession.mockResolvedValue({
        sessionId: "session-123",
        status: "ready",
        model: "opus",
        cwd: "/workspace/repo",
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      });

      const result = await manager.getOrCreateSession("trial-1", "token-123", {
        systemPrompt: "Test prompt",
        tools: ["Read", "Bash"],
        model: "opus",
      });

      expect(result).toEqual({
        sessionId: "session-123",
        isNew: true,
      });

      expect(mockAgentClient.createSession).toHaveBeenCalledWith({
        model: "opus",
        systemPrompt: "Test prompt",
        tools: ["Read", "Bash"],
        cwd: "/workspace/repo",
        maxTurns: 50,
        oauthToken: "token-123",
      });

      expect(manager.hasSession("trial-1")).toBe(true);
    });

    it("returns existing session if already created", async () => {
      const manager = createAgentSessionManager("test");
      mockAgentClient.createSession.mockResolvedValue({
        sessionId: "session-123",
        status: "ready",
        model: "opus",
        cwd: "/workspace/repo",
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      });

      // Create first time
      await manager.getOrCreateSession("trial-1", "token-123", {
        systemPrompt: "Test prompt",
        tools: ["Read"],
      });

      // Get existing
      const result = await manager.getOrCreateSession("trial-1", "token-456", {
        systemPrompt: "Different prompt",
        tools: ["Bash"],
      });

      expect(result).toEqual({
        sessionId: "session-123",
        isNew: false,
      });

      // Should only create once
      expect(mockAgentClient.createSession).toHaveBeenCalledTimes(1);
    });

    it("uses provided configuration values", async () => {
      const manager = createAgentSessionManager("test");
      mockAgentClient.createSession.mockResolvedValue({
        sessionId: "session-123",
        status: "ready",
        model: "sonnet",
        cwd: "/custom/path",
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      });

      await manager.getOrCreateSession("trial-1", "token-123", {
        systemPrompt: "Custom prompt",
        tools: ["Read", "Grep", "Glob"],
        model: "sonnet",
        maxTurns: 25,
        cwd: "/custom/path",
      });

      expect(mockAgentClient.createSession).toHaveBeenCalledWith({
        model: "sonnet",
        systemPrompt: "Custom prompt",
        tools: ["Read", "Grep", "Glob"],
        cwd: "/custom/path",
        maxTurns: 25,
        oauthToken: "token-123",
      });
    });

    it("uses default values when not provided", async () => {
      const manager = createAgentSessionManager("test");
      mockAgentClient.createSession.mockResolvedValue({
        sessionId: "session-123",
        status: "ready",
        model: "opus",
        cwd: "/workspace/repo",
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      });

      await manager.getOrCreateSession("trial-1", "token-123", {
        systemPrompt: "Test",
        tools: ["Read"],
      });

      expect(mockAgentClient.createSession).toHaveBeenCalledWith({
        model: "opus",
        systemPrompt: "Test",
        tools: ["Read"],
        cwd: "/workspace/repo",
        maxTurns: 50,
        oauthToken: "token-123",
      });
    });

    it("throws error if container not found", async () => {
      vi.mocked(containerService.getTrialContainer).mockReturnValue(undefined);
      const manager = createAgentSessionManager("test");

      await expect(
        manager.getOrCreateSession("trial-1", "token-123", {
          systemPrompt: "Test",
          tools: ["Read"],
        }),
      ).rejects.toThrow("Trial container not found");
    });
  });

  describe("sendMessage", () => {
    it("sends message to existing session", async () => {
      const manager = createAgentSessionManager("test");
      mockAgentClient.createSession.mockResolvedValue({
        sessionId: "session-123",
        status: "ready",
        model: "opus",
        cwd: "/workspace/repo",
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      });

      mockAgentClient.sendMessage.mockResolvedValue({
        success: true,
        cost: { totalUsd: 0.1, inputTokens: 100, outputTokens: 200 },
        turns: 1,
      });

      // Create session first
      await manager.getOrCreateSession("trial-1", "token-123", {
        systemPrompt: "Test",
        tools: ["Read"],
      });

      const events: AgentEvent[] = [];
      const result = await manager.sendMessage(
        "trial-1",
        "Hello",
        "token-123",
        (event) => events.push(event),
      );

      expect(result).toEqual({
        success: true,
      });

      expect(mockAgentClient.sendMessage).toHaveBeenCalledWith(
        "session-123",
        "Hello",
        "token-123",
        expect.any(Function),
        undefined,
      );
    });

    it("supports structured output format", async () => {
      const manager = createAgentSessionManager("test");
      mockAgentClient.createSession.mockResolvedValue({
        sessionId: "session-123",
        status: "ready",
        model: "opus",
        cwd: "/workspace/repo",
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      });

      mockAgentClient.sendMessage.mockResolvedValue({
        success: true,
        cost: { totalUsd: 0.1, inputTokens: 100, outputTokens: 200 },
        turns: 1,
        structuredOutput: { result: "data" },
      });

      await manager.getOrCreateSession("trial-1", "token-123", {
        systemPrompt: "Test",
        tools: ["Read"],
      });

      const outputFormat = {
        type: "json_schema" as const,
        schema: {
          type: "object",
          properties: {
            result: { type: "string" },
          },
        },
      };

      await manager.sendMessage("trial-1", "Extract data", "token-123", () => {}, outputFormat);

      expect(mockAgentClient.sendMessage).toHaveBeenCalledWith(
        "session-123",
        "Extract data",
        "token-123",
        expect.any(Function),
        outputFormat,
      );
    });

    it("returns error if no session exists", async () => {
      const manager = createAgentSessionManager("test");

      const result = await manager.sendMessage("trial-1", "Hello", "token-123", () => {});

      expect(result).toEqual({
        success: false,
        error: "No active session for this trial",
      });

      expect(mockAgentClient.sendMessage).not.toHaveBeenCalled();
    });

    it("returns error if container not found", async () => {
      const manager = createAgentSessionManager("test");
      mockAgentClient.createSession.mockResolvedValue({
        sessionId: "session-123",
        status: "ready",
        model: "opus",
        cwd: "/workspace/repo",
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      });

      await manager.getOrCreateSession("trial-1", "token-123", {
        systemPrompt: "Test",
        tools: ["Read"],
      });

      vi.mocked(containerService.getTrialContainer).mockReturnValue(undefined);

      const result = await manager.sendMessage("trial-1", "Hello", "token-123", () => {});

      expect(result).toEqual({
        success: false,
        error: "Trial container not found",
      });
    });

    it("handles errors from agent client", async () => {
      const manager = createAgentSessionManager("test");
      mockAgentClient.createSession.mockResolvedValue({
        sessionId: "session-123",
        status: "ready",
        model: "opus",
        cwd: "/workspace/repo",
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      });

      mockAgentClient.sendMessage.mockRejectedValue(new Error("Network error"));

      await manager.getOrCreateSession("trial-1", "token-123", {
        systemPrompt: "Test",
        tools: ["Read"],
      });

      const result = await manager.sendMessage("trial-1", "Hello", "token-123", () => {});

      expect(result).toEqual({
        success: false,
        error: "Network error",
      });
    });
  });

  describe("endSession", () => {
    it("ends session and cleans up", async () => {
      const manager = createAgentSessionManager("test");
      mockAgentClient.createSession.mockResolvedValue({
        sessionId: "session-123",
        status: "ready",
        model: "opus",
        cwd: "/workspace/repo",
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      });

      await manager.getOrCreateSession("trial-1", "token-123", {
        systemPrompt: "Test",
        tools: ["Read"],
      });

      expect(manager.hasSession("trial-1")).toBe(true);

      await manager.endSession("trial-1");

      expect(mockAgentClient.endSession).toHaveBeenCalledWith("session-123");
      expect(manager.hasSession("trial-1")).toBe(false);
    });

    it("handles errors when ending session", async () => {
      const manager = createAgentSessionManager("test");
      mockAgentClient.createSession.mockResolvedValue({
        sessionId: "session-123",
        status: "ready",
        model: "opus",
        cwd: "/workspace/repo",
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      });

      mockAgentClient.endSession.mockRejectedValue(new Error("Session already ended"));

      await manager.getOrCreateSession("trial-1", "token-123", {
        systemPrompt: "Test",
        tools: ["Read"],
      });

      // Should not throw, just clean up silently
      await expect(manager.endSession("trial-1")).resolves.toBeUndefined();
      expect(manager.hasSession("trial-1")).toBe(false);
    });

    it("does nothing if session doesn't exist", async () => {
      const manager = createAgentSessionManager("test");

      await expect(manager.endSession("trial-1")).resolves.toBeUndefined();
      expect(mockAgentClient.endSession).not.toHaveBeenCalled();
    });
  });

  describe("hasSession", () => {
    it("returns true if session exists", async () => {
      const manager = createAgentSessionManager("test");
      mockAgentClient.createSession.mockResolvedValue({
        sessionId: "session-123",
        status: "ready",
        model: "opus",
        cwd: "/workspace/repo",
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      });

      expect(manager.hasSession("trial-1")).toBe(false);

      await manager.getOrCreateSession("trial-1", "token-123", {
        systemPrompt: "Test",
        tools: ["Read"],
      });

      expect(manager.hasSession("trial-1")).toBe(true);
    });

    it("returns false after session ended", async () => {
      const manager = createAgentSessionManager("test");
      mockAgentClient.createSession.mockResolvedValue({
        sessionId: "session-123",
        status: "ready",
        model: "opus",
        cwd: "/workspace/repo",
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      });

      await manager.getOrCreateSession("trial-1", "token-123", {
        systemPrompt: "Test",
        tools: ["Read"],
      });

      expect(manager.hasSession("trial-1")).toBe(true);

      await manager.endSession("trial-1");

      expect(manager.hasSession("trial-1")).toBe(false);
    });
  });

  describe("session isolation", () => {
    it("different managers have isolated session state", async () => {
      const manager1 = createAgentSessionManager("setup");
      const manager2 = createAgentSessionManager("consul");

      mockAgentClient.createSession
        .mockResolvedValueOnce({
          sessionId: "session-setup",
          status: "ready",
          model: "opus",
          cwd: "/workspace/repo",
          createdAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
        })
        .mockResolvedValueOnce({
          sessionId: "session-consul",
          status: "ready",
          model: "opus",
          cwd: "/workspace/repo",
          createdAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
        });

      // Create sessions in both managers for same trial
      const result1 = await manager1.getOrCreateSession("trial-1", "token-123", {
        systemPrompt: "Setup",
        tools: ["Read"],
      });

      const result2 = await manager2.getOrCreateSession("trial-1", "token-123", {
        systemPrompt: "Consul",
        tools: ["Bash"],
      });

      expect(result1.sessionId).toBe("session-setup");
      expect(result2.sessionId).toBe("session-consul");

      expect(manager1.hasSession("trial-1")).toBe(true);
      expect(manager2.hasSession("trial-1")).toBe(true);

      // Ending one doesn't affect the other
      await manager1.endSession("trial-1");

      expect(manager1.hasSession("trial-1")).toBe(false);
      expect(manager2.hasSession("trial-1")).toBe(true);
    });
  });

  describe("idle timeout cleanup", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("cleans up idle sessions after timeout", async () => {
      const idleTimeout = 10 * 60 * 1000; // 10 minutes
      const manager = createAgentSessionManager("test", idleTimeout);

      mockAgentClient.createSession.mockResolvedValue({
        sessionId: "session-123",
        status: "ready",
        model: "opus",
        cwd: "/workspace/repo",
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      });

      await manager.getOrCreateSession("trial-1", "token-123", {
        systemPrompt: "Test",
        tools: ["Read"],
      });

      expect(manager.hasSession("trial-1")).toBe(true);

      // Advance time past idle timeout and cleanup interval
      vi.advanceTimersByTime(idleTimeout + 60000);

      // Wait for pending promises
      await vi.runOnlyPendingTimersAsync();

      expect(manager.hasSession("trial-1")).toBe(false);
      expect(mockAgentClient.endSession).toHaveBeenCalledWith("session-123");

      // Clean up manager
      manager.destroy();
    });

    it("does not clean up active sessions", async () => {
      const idleTimeout = 10 * 60 * 1000;
      const manager = createAgentSessionManager("test", idleTimeout);

      mockAgentClient.createSession.mockResolvedValue({
        sessionId: "session-123",
        status: "ready",
        model: "opus",
        cwd: "/workspace/repo",
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      });

      mockAgentClient.sendMessage.mockResolvedValue({
        success: true,
        cost: { totalUsd: 0.1, inputTokens: 100, outputTokens: 200 },
        turns: 1,
      });

      await manager.getOrCreateSession("trial-1", "token-123", {
        systemPrompt: "Test",
        tools: ["Read"],
      });

      // Advance time to just before timeout
      vi.advanceTimersByTime(idleTimeout - 60000);

      // Send a message to update activity
      await manager.sendMessage("trial-1", "Stay active", "token-123", () => {});

      // Advance past original timeout
      vi.advanceTimersByTime(120000);

      // Run only one cleanup cycle
      await vi.runOnlyPendingTimersAsync();

      // Session should still exist
      expect(manager.hasSession("trial-1")).toBe(true);

      // Clean up manager
      manager.destroy();
    });
  });
});
