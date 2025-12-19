# Agent Discovery Session Manager

Shared utility for managing agent-based discovery sessions across different flows (setup discovery, consul, etc.).

## Overview

The Agent Session Manager provides a unified interface for managing interactive agent sessions in trial containers. Each manager maintains its own isolated session state, preventing conflicts between different discovery flows.

## Features

- **Session Management**: Create, maintain, and end agent sessions
- **Session Isolation**: Each manager has its own session Map to prevent conflicts
- **Automatic Cleanup**: Optional idle timeout with automatic session cleanup
- **Streaming Events**: Stream agent events via callbacks
- **Structured Output**: Support for JSON schema structured output
- **Error Handling**: Graceful error handling with detailed error messages

## Usage

### Basic Example

```typescript
import { createAgentSessionManager } from "@/lib/discovery/agent-session";

// Create a manager for setup discovery
const setupManager = createAgentSessionManager("setup", 10 * 60 * 1000);

// Create a session
const { sessionId, isNew } = await setupManager.getOrCreateSession(
  trialId,
  oauthToken,
  {
    systemPrompt: "You are a setup discovery agent...",
    tools: ["Read", "Glob", "Grep", "Bash"],
    model: "opus",
    maxTurns: 50,
    cwd: "/workspace/repo",
  }
);

// Send messages and stream events
await setupManager.sendMessage(
  trialId,
  "Analyze this repository",
  oauthToken,
  (event) => {
    if (event.event === "text") {
      console.log(event.data);
    }
  }
);

// Clean up
await setupManager.endSession(trialId);
```

### With Structured Output

```typescript
const outputFormat = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    properties: {
      setup_md: { type: "string" },
      setup_sh: { type: "string" },
    },
    required: ["setup_md", "setup_sh"],
  },
};

let structuredOutput;

await setupManager.sendMessage(
  trialId,
  "Generate setup files",
  oauthToken,
  (event) => {
    if (event.event === "done") {
      structuredOutput = event.data.structuredOutput;
    }
  },
  outputFormat
);
```

### Multiple Isolated Managers

```typescript
// Setup discovery manager
const setupManager = createAgentSessionManager("setup");

// Consul manager
const consulManager = createAgentSessionManager("consul", 10 * 60 * 1000);

// Both can have sessions for the same trial without conflicts
await setupManager.getOrCreateSession(trialId, token, setupConfig);
await consulManager.getOrCreateSession(trialId, token, consulConfig);
```

## API Reference

### `createAgentSessionManager(name, idleTimeoutMs?)`

Factory function to create a new agent session manager.

**Parameters:**
- `name` (string): Descriptive name for the manager (e.g., "setup", "consul")
- `idleTimeoutMs` (number, optional): Idle timeout in milliseconds for automatic cleanup

**Returns:** `AgentSessionManager`

### `AgentSessionManager.getOrCreateSession(trialId, oauthToken, config)`

Get existing session or create a new one for a trial.

**Parameters:**
- `trialId` (string): Trial identifier
- `oauthToken` (string): OAuth token for authentication
- `config` (AgentSessionConfig): Session configuration

**Returns:** `Promise<{ sessionId: string, isNew: boolean }>`

### `AgentSessionManager.sendMessage(trialId, message, oauthToken, onEvent, outputFormat?)`

Send a message to the agent session and stream events.

**Parameters:**
- `trialId` (string): Trial identifier
- `message` (string): Message to send
- `oauthToken` (string): OAuth token for authentication
- `onEvent` (function): Callback for streamed events
- `outputFormat` (OutputFormat, optional): Structured output format

**Returns:** `Promise<{ success: boolean, error?: string }>`

### `AgentSessionManager.endSession(trialId)`

End the session and clean up resources.

**Parameters:**
- `trialId` (string): Trial identifier

**Returns:** `Promise<void>`

### `AgentSessionManager.hasSession(trialId)`

Check if a session exists for a trial.

**Parameters:**
- `trialId` (string): Trial identifier

**Returns:** `boolean`

## Configuration

### `AgentSessionConfig`

```typescript
interface AgentSessionConfig {
  systemPrompt: string;      // System prompt for the agent
  tools: string[];           // Available tools (e.g., ["Read", "Bash"])
  model?: Model;             // Model to use (default: "opus")
  maxTurns?: number;         // Max conversation turns (default: 50)
  cwd?: string;              // Working directory (default: "/workspace/repo")
  idleTimeoutMs?: number;    // Idle timeout for cleanup (optional)
}
```

## Migration Guide

### From Manual Session Management

**Before:**
```typescript
const sessions = new Map();

async function getOrCreateSession(trialId, token) {
  const existing = sessions.get(trialId);
  if (existing) {
    return existing.sessionId;
  }

  const container = getTrialContainer(trialId);
  const agentClient = container.getAgentClient();
  const session = await agentClient.createSession({
    model: "opus",
    systemPrompt: "...",
    tools: ["Read", "Bash"],
    cwd: "/workspace/repo",
    maxTurns: 50,
    oauthToken: token,
  });

  sessions.set(trialId, { sessionId: session.sessionId });
  return session.sessionId;
}
```

**After:**
```typescript
const manager = createAgentSessionManager("myflow");

const { sessionId } = await manager.getOrCreateSession(trialId, token, {
  systemPrompt: "...",
  tools: ["Read", "Bash"],
});
```

## Best Practices

1. **Use descriptive manager names**: This helps with debugging and monitoring
2. **Set appropriate idle timeouts**: Balance between resource usage and user experience
3. **Handle errors gracefully**: The manager returns error objects instead of throwing
4. **Clean up sessions**: Always call `endSession()` when done to free resources
5. **One manager per flow**: Create separate managers for different discovery flows

## Testing

The manager is fully tested with vitest. See `agent-session.test.ts` for examples.

```bash
npm test -- src/lib/discovery/agent-session.test.ts
```
