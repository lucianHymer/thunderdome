/**
 * Tests for Lanista schema validation
 */

import { describe, expect, it } from "vitest";
import { LanistaOutputSchema } from "../../../claude/schemas";

describe("LanistaOutputSchema", () => {
  it("accepts valid output with 2+ gladiators", () => {
    const validOutput = {
      reasoning: "This challenge requires both security and performance perspectives.",
      gladiators: [
        {
          name: "Security Guardian",
          persona: "You are paranoid about security.",
          model: "opus" as const,
          temperature: 0.4,
          tools: ["Read", "Grep", "Bash"],
          focus: "Identify and prevent security vulnerabilities",
        },
        {
          name: "Performance Optimizer",
          persona: "You obsess over performance.",
          model: "sonnet" as const,
          temperature: 0.5,
          tools: ["Read", "Bash", "Grep"],
          focus: "Maximize performance",
        },
      ],
    };

    const result = LanistaOutputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gladiators.length).toBe(2);
      expect(result.data.gladiators[0].name).toBe("Security Guardian");
    }
  });

  it("rejects fewer than 2 gladiators", () => {
    const invalidOutput = {
      reasoning: "Only one gladiator needed for this",
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
    expect(result.success).toBe(false);
  });

  it("rejects more than 6 gladiators", () => {
    const gladiatorTemplate = {
      name: "Fighter",
      persona: "I fight hard",
      model: "sonnet" as const,
      temperature: 0.5,
      tools: ["Read"],
      focus: "Fighting",
    };

    const invalidOutput = {
      reasoning: "Too many gladiators for this challenge",
      gladiators: Array.from({ length: 7 }, (_, i) => ({
        ...gladiatorTemplate,
        name: `Fighter ${i + 1}`,
      })),
    };

    const result = LanistaOutputSchema.safeParse(invalidOutput);
    expect(result.success).toBe(false);
  });

  it("rejects invalid model name", () => {
    const invalidOutput = {
      reasoning: "Testing invalid model configuration",
      gladiators: [
        {
          name: "Fighter 1",
          persona: "I fight well",
          model: "gpt-4" as any,
          temperature: 0.5,
          tools: ["Read"],
          focus: "Fighting",
        },
        {
          name: "Fighter 2",
          persona: "I also fight well",
          model: "sonnet" as const,
          temperature: 0.5,
          tools: ["Read"],
          focus: "Also fighting",
        },
      ],
    };

    const result = LanistaOutputSchema.safeParse(invalidOutput);
    expect(result.success).toBe(false);
  });

  it("rejects temperature > 1.0", () => {
    const invalidOutput = {
      reasoning: "Testing temperature out of valid range",
      gladiators: [
        {
          name: "Fighter 1",
          persona: "I fight well",
          model: "sonnet" as const,
          temperature: 1.5,
          tools: ["Read"],
          focus: "Fighting",
        },
        {
          name: "Fighter 2",
          persona: "I also fight well",
          model: "sonnet" as const,
          temperature: 0.5,
          tools: ["Read"],
          focus: "Also fighting",
        },
      ],
    };

    const result = LanistaOutputSchema.safeParse(invalidOutput);
    expect(result.success).toBe(false);
  });

  it("rejects gladiator with no tools", () => {
    const invalidOutput = {
      reasoning: "Testing gladiator with empty tools array",
      gladiators: [
        {
          name: "Fighter 1",
          persona: "I fight well",
          model: "sonnet" as const,
          temperature: 0.5,
          tools: [],
          focus: "Fighting",
        },
        {
          name: "Fighter 2",
          persona: "I also fight well",
          model: "sonnet" as const,
          temperature: 0.5,
          tools: ["Read"],
          focus: "Also fighting",
        },
      ],
    };

    const result = LanistaOutputSchema.safeParse(invalidOutput);
    expect(result.success).toBe(false);
  });

  it("accepts all three model types (opus, sonnet, haiku)", () => {
    const validOutput = {
      reasoning: "Testing all model types are accepted",
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
    expect(result.success).toBe(true);
  });

  it("rejects reasoning shorter than 20 characters", () => {
    const invalidOutput = {
      reasoning: "Too short",
      gladiators: [
        {
          name: "Fighter 1",
          persona: "I fight well in battle",
          model: "sonnet" as const,
          temperature: 0.5,
          tools: ["Read"],
          focus: "Fighting well",
        },
        {
          name: "Fighter 2",
          persona: "I also fight well in battle",
          model: "sonnet" as const,
          temperature: 0.5,
          tools: ["Read"],
          focus: "Also fighting well",
        },
      ],
    };

    const result = LanistaOutputSchema.safeParse(invalidOutput);
    expect(result.success).toBe(false);
  });
});
