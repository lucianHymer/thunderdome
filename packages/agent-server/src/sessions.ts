/**
 * Session Management
 *
 * Manages multiple concurrent agent sessions within a single container.
 * Each session corresponds to one actor (gladiator/judge) and maintains
 * its own conversation state for interactive multi-turn conversations.
 */

import type { Model, Session, SessionStatus } from "./types.js";

// In-memory session registry
const sessions = new Map<string, Session>();

// Session timeout (30 minutes of inactivity)
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Create a new session
 */
export function createSession(opts: {
  sessionId?: string;
  model: Model;
  systemPrompt?: string;
  tools: string[];
  cwd: string;
  maxTurns?: number;
}): Session {
  const id = opts.sessionId || generateSessionId();

  // Check if session already exists (for resume)
  const existing = sessions.get(id);
  if (existing) {
    // Update last activity and return existing
    existing.lastActivity = new Date();
    return existing;
  }

  const session: Session = {
    id,
    model: opts.model,
    systemPrompt: opts.systemPrompt,
    tools: opts.tools,
    cwd: opts.cwd,
    maxTurns: opts.maxTurns,
    status: "ready",
    claudeSessionId: undefined,
    createdAt: new Date(),
    lastActivity: new Date(),
  };

  sessions.set(id, session);
  return session;
}

/**
 * Get a session by ID
 */
export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

/**
 * Update session status
 */
export function updateSessionStatus(sessionId: string, status: SessionStatus): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.status = status;
    session.lastActivity = new Date();
  }
}

/**
 * Store Claude's internal session ID for resume capability
 */
export function setClaudeSessionId(sessionId: string, claudeSessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.claudeSessionId = claudeSessionId;
    session.lastActivity = new Date();
  }
}

/**
 * End a session
 */
export function endSession(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (session) {
    session.status = "ended";
    sessions.delete(sessionId);
    return true;
  }
  return false;
}

/**
 * Get all active sessions
 */
export function getAllSessions(): Session[] {
  return Array.from(sessions.values());
}

/**
 * Cleanup expired sessions
 */
export function cleanupExpiredSessions(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [id, session] of sessions) {
    const age = now - session.lastActivity.getTime();
    if (age > SESSION_TIMEOUT_MS) {
      sessions.delete(id);
      cleaned++;
    }
  }

  return cleaned;
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredSessions, 5 * 60 * 1000);
