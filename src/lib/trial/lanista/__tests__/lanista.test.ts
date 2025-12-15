/**
 * Integration tests for the Lanista
 *
 * These tests verify:
 * - Schema validation works correctly
 * - Valid gladiator configurations pass
 * - Invalid configurations are rejected
 */

import { LanistaOutputSchema } from "../../../claude/schemas";

/**
 * Simple test runner
 */
function test(_name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result
        .then(() => {})
        .catch((_err) => {
          process.exit(1);
        });
    } else {
    }
  } catch (_err: any) {
    process.exit(1);
  }
}

/**
 * Assert helper
 */
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

// Test: Valid output passes schema validation
test("Valid Lanista output passes schema validation", () => {
  const validOutput = {
    reasoning:
      "This challenge requires both a security-focused and a performance-focused perspective to balance safety with efficiency.",
    gladiators: [
      {
        name: "Security Guardian",
        persona:
          "You are paranoid about security. Every decision must be validated against potential attacks.",
        model: "opus" as const,
        temperature: 0.4,
        tools: ["Read", "Grep", "Bash"],
        focus: "Identify and prevent security vulnerabilities",
      },
      {
        name: "Performance Optimizer",
        persona: "You obsess over performance. Every millisecond matters. Profile and optimize.",
        model: "sonnet" as const,
        temperature: 0.5,
        tools: ["Read", "Bash", "Grep"],
        focus: "Maximize performance and minimize resource usage",
      },
    ],
  };

  const result = LanistaOutputSchema.safeParse(validOutput);
  assert(result.success, "Valid output should pass validation");
  if (result.success) {
    assert(result.data.gladiators.length === 2, "Should have 2 gladiators");
    assert(
      result.data.gladiators[0].name === "Security Guardian",
      "First gladiator name should match",
    );
  }
});

// Test: Output with fewer than 2 gladiators is rejected
test("Fewer than 2 gladiators is rejected", () => {
  const invalidOutput = {
    reasoning: "Only one gladiator needed",
    gladiators: [
      {
        name: "Solo Fighter",
        persona: "I work alone",
        model: "sonnet" as const,
        temperature: 0.5,
        tools: ["Read"],
        focus: "Do everything",
      },
    ],
  };

  const result = LanistaOutputSchema.safeParse(invalidOutput);
  assert(!result.success, "Should reject fewer than 2 gladiators");
  if (!result.success) {
    assert(
      result.error.message.includes("at least 2"),
      "Error should mention minimum of 2 gladiators",
    );
  }
});

// Test: Output with more than 6 gladiators is rejected
test("More than 6 gladiators is rejected", () => {
  const gladiatorTemplate = {
    name: "Fighter",
    persona: "I fight",
    model: "sonnet" as const,
    temperature: 0.5,
    tools: ["Read"],
    focus: "Fighting",
  };

  const invalidOutput = {
    reasoning: "Too many gladiators",
    gladiators: Array.from({ length: 7 }, (_, i) => ({
      ...gladiatorTemplate,
      name: `Fighter ${i + 1}`,
    })),
  };

  const result = LanistaOutputSchema.safeParse(invalidOutput);
  assert(!result.success, "Should reject more than 6 gladiators");
  if (!result.success) {
    assert(
      result.error.message.includes("more than 6"),
      "Error should mention maximum of 6 gladiators",
    );
  }
});

// Test: Gladiator with invalid model is rejected
test("Invalid model is rejected", () => {
  const invalidOutput = {
    reasoning: "Testing invalid model",
    gladiators: [
      {
        name: "Fighter 1",
        persona: "I fight",
        model: "gpt-4" as any, // Invalid model
        temperature: 0.5,
        tools: ["Read"],
        focus: "Fighting",
      },
      {
        name: "Fighter 2",
        persona: "I also fight",
        model: "sonnet" as const,
        temperature: 0.5,
        tools: ["Read"],
        focus: "Also fighting",
      },
    ],
  };

  const result = LanistaOutputSchema.safeParse(invalidOutput);
  assert(!result.success, "Should reject invalid model");
});

// Test: Gladiator with temperature out of range is rejected
test("Temperature out of range is rejected", () => {
  const invalidOutput = {
    reasoning: "Testing invalid temperature",
    gladiators: [
      {
        name: "Fighter 1",
        persona: "I fight",
        model: "sonnet" as const,
        temperature: 1.5, // Out of range
        tools: ["Read"],
        focus: "Fighting",
      },
      {
        name: "Fighter 2",
        persona: "I also fight",
        model: "sonnet" as const,
        temperature: 0.5,
        tools: ["Read"],
        focus: "Also fighting",
      },
    ],
  };

  const result = LanistaOutputSchema.safeParse(invalidOutput);
  assert(!result.success, "Should reject temperature > 1.0");
});

// Test: Gladiator with no tools is rejected
test("Gladiator with no tools is rejected", () => {
  const invalidOutput = {
    reasoning: "Testing no tools",
    gladiators: [
      {
        name: "Fighter 1",
        persona: "I fight",
        model: "sonnet" as const,
        temperature: 0.5,
        tools: [], // No tools
        focus: "Fighting",
      },
      {
        name: "Fighter 2",
        persona: "I also fight",
        model: "sonnet" as const,
        temperature: 0.5,
        tools: ["Read"],
        focus: "Also fighting",
      },
    ],
  };

  const result = LanistaOutputSchema.safeParse(invalidOutput);
  assert(!result.success, "Should reject gladiator with no tools");
});

// Test: All three model types are valid
test("All model types (opus, sonnet, haiku) are valid", () => {
  const validOutput = {
    reasoning: "Testing all model types",
    gladiators: [
      {
        name: "Opus Fighter",
        persona: "I use Opus",
        model: "opus" as const,
        temperature: 0.5,
        tools: ["Read"],
        focus: "Complex reasoning",
      },
      {
        name: "Sonnet Fighter",
        persona: "I use Sonnet",
        model: "sonnet" as const,
        temperature: 0.5,
        tools: ["Read"],
        focus: "Balanced approach",
      },
      {
        name: "Haiku Fighter",
        persona: "I use Haiku",
        model: "haiku" as const,
        temperature: 0.5,
        tools: ["Read"],
        focus: "Fast execution",
      },
    ],
  };

  const result = LanistaOutputSchema.safeParse(validOutput);
  assert(result.success, "All model types should be valid");
});

// Test: Reasoning must be at least 20 characters
test("Reasoning must be at least 20 characters", () => {
  const invalidOutput = {
    reasoning: "Too short", // Less than 20 characters
    gladiators: [
      {
        name: "Fighter 1",
        persona: "I fight well",
        model: "sonnet" as const,
        temperature: 0.5,
        tools: ["Read"],
        focus: "Fighting well",
      },
      {
        name: "Fighter 2",
        persona: "I also fight well",
        model: "sonnet" as const,
        temperature: 0.5,
        tools: ["Read"],
        focus: "Also fighting well",
      },
    ],
  };

  const result = LanistaOutputSchema.safeParse(invalidOutput);
  assert(!result.success, "Should reject reasoning shorter than 20 characters");
});
