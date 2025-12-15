# Thunderdome

AI agent orchestration platform powered by the Claude Agent SDK.

## Overview

Thunderdome provides a competitive multi-agent system where different AI "gladiators" compete to solve tasks, with specialized judges evaluating their work. This implementation wraps the Claude Agent SDK to provide:

- **Streaming agent execution** with real-time event handling
- **Parallel agent coordination** for running multiple agents concurrently
- **Structured output validation** using Zod schemas
- **Cost tracking and token management** across all agent operations

## Architecture

### Core Components

#### 1. Agent Execution (`src/lib/claude/agent.ts`)
- `runAgent()`: Streaming execution with typed events
- `runAgentSimple()`: Non-streaming execution for simple use cases
- OAuth token management and injection
- Event processing and cost aggregation

#### 2. Parallel Execution (`src/lib/claude/parallel.ts`)
- `runAgentsParallel()`: Real-time streaming from multiple agents
- `runAgentsParallelBatch()`: Simplified parallel execution
- Promise.race-based coordination for concurrent agents

#### 3. Structured Output (`src/lib/claude/structured.ts`)
- `runStructuredAgent()`: Zod schema-validated responses
- `runStructuredAgentWithRetry()`: Automatic retry on validation failures
- JSON extraction from markdown code blocks

#### 4. Schemas (`src/lib/claude/schemas.ts`)
Complete Zod schemas for the Thunderdome system:
- **LanistaOutputSchema**: Gladiator selection and configuration
- **ArbiterOutputSchema**: Judge selection and configuration
- **JudgeOutputSchema**: Evaluation results with scores and rankings
- **ThunderdomeSessionSchema**: Complete session tracking

#### 5. Type System (`src/lib/claude/types.ts`)
Comprehensive TypeScript types:
- `AgentConfig`: Agent configuration options
- `StreamEvent`: Event emitted during execution
- `AgentResult`: Final execution results
- `CostInfo`: Token usage and cost tracking

## Installation

```bash
npm install
```

## Authentication

Set either of these environment variables:

```bash
# Anthropic API key (recommended)
export ANTHROPIC_API_KEY=your-api-key

# Or Claude Code OAuth token
export CLAUDE_CODE_OAUTH_TOKEN=your-oauth-token
```

## Usage Examples

### Basic Agent Execution

```typescript
import { runAgent, TOOL_SETS } from './src/lib/claude/index.js';

// Streaming execution
for await (const event of runAgent("Find all TODO comments", {
  allowedTools: TOOL_SETS.READ_ONLY,
  maxTurns: 5
})) {
  console.log(event.type, event.content);
}
```

### Non-Streaming Execution

```typescript
import { runAgentSimple } from './src/lib/claude/index.js';

const result = await runAgentSimple("Analyze this code", {
  allowedTools: ['Read', 'Grep'],
  model: 'claude-sonnet-4',
});

console.log(result.content);
console.log(`Cost: $${result.cost.totalUsd.toFixed(4)}`);
```

### Parallel Agent Execution

```typescript
import { runAgentsParallelBatch } from './src/lib/claude/index.js';

const results = await runAgentsParallelBatch([
  {
    id: 'finder',
    prompt: 'Find all security issues',
    allowedTools: ['Read', 'Grep'],
  },
  {
    id: 'analyzer',
    prompt: 'Analyze code complexity',
    allowedTools: ['Read', 'Glob'],
  },
]);

console.log(results.get('finder')?.content);
console.log(results.get('analyzer')?.content);
```

### Structured Output with Zod

```typescript
import { z } from 'zod';
import { runStructuredAgent } from './src/lib/claude/index.js';

const BugSchema = z.object({
  bugs: z.array(z.object({
    file: z.string(),
    line: z.number(),
    severity: z.enum(['low', 'medium', 'high']),
    description: z.string(),
  })),
});

const result = await runStructuredAgent(
  "Find all bugs in the codebase and report them as JSON",
  BugSchema,
  { allowedTools: ['Read', 'Grep'] }
);

if (result.success) {
  result.data.bugs.forEach(bug => {
    console.log(`${bug.file}:${bug.line} - ${bug.severity}: ${bug.description}`);
  });
}
```

### Lanista (Gladiator Selection)

```typescript
import { runStructuredAgent, LanistaOutputSchema } from './src/lib/claude/index.js';

const result = await runStructuredAgent(
  "Create 3 gladiators to solve: 'Build a REST API for a todo app'",
  LanistaOutputSchema,
  {
    allowedTools: ['Read'],
    model: 'claude-opus-4',
  }
);

if (result.success) {
  result.data.gladiators.forEach(g => {
    console.log(`${g.name} (${g.model}): ${g.focus}`);
  });
}
```

## Utility Functions

### Cost Formatting

```typescript
import { formatCost, aggregateCosts } from './src/lib/claude/index.js';

// Format a single cost
console.log(formatCost(result.cost));
// Output: $0.0123 (1,234 in 5,678 out 2,000 cached)

// Aggregate multiple costs
const totalCost = aggregateCosts([result1.cost, result2.cost, result3.cost]);
console.log(formatCost(totalCost));
```

### Authentication Helpers

```typescript
import { isAuthConfigured, getAuthToken } from './src/lib/claude/index.js';

if (!isAuthConfigured()) {
  console.error('No authentication token found!');
  process.exit(1);
}

const token = getAuthToken();
```

### Predefined Configurations

```typescript
import { createAgentConfig, MODELS, TOOL_SETS, PERMISSION_MODES } from './src/lib/claude/index.js';

// Create a development agent config
const devConfig = createAgentConfig('development');

// Create a research agent config with overrides
const researchConfig = createAgentConfig('research', {
  model: MODELS.OPUS,
  maxTurns: 20,
});

// Use constants for consistency
const config = {
  model: MODELS.SONNET,
  allowedTools: TOOL_SETS.DEVELOPMENT,
  permissionMode: PERMISSION_MODES.BYPASS,
};
```

## Available Tool Sets

```typescript
TOOL_SETS.READ_ONLY       // ['Read', 'Glob', 'Grep']
TOOL_SETS.DEVELOPMENT     // ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep']
TOOL_SETS.CODE_REVIEW     // ['Read', 'Glob', 'Grep']
TOOL_SETS.RESEARCH        // ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch']
TOOL_SETS.TESTING         // ['Read', 'Bash', 'Glob', 'Grep']
TOOL_SETS.ALL             // All available tools
```

## Stream Events

Events emitted during agent execution:

- `init`: Session initialized with configuration
- `assistant`: Assistant message/response
- `user`: User message
- `thinking`: Partial streaming content (when `includePartialMessages: true`)
- `result`: Final execution result
- `error`: Error occurred

## Cost Tracking

Every result includes detailed cost information:

```typescript
interface CostInfo {
  totalUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  modelUsage?: Record<string, ModelUsage>;
}
```

## Building

```bash
npm run build
```

Outputs compiled JavaScript and type declarations to `dist/`.

## Development

```bash
npm run dev  # Watch mode with auto-rebuild
```

## License

See LICENSE file in repository root.

## Next Steps

This SDK integration layer provides the foundation for:
1. **Lanista**: Gladiator selection and configuration
2. **Arbiter**: Judge selection and configuration
3. **Arena**: Coordinating gladiator execution
4. **Judges**: Evaluating gladiator outputs
5. **Orchestrator**: Managing the complete Thunderdome workflow

## API Reference

See the TypeScript type definitions in `src/lib/claude/types.ts` and inline documentation for detailed API information.
