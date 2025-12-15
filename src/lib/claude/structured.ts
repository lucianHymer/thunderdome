/**
 * Structured output functionality with Zod schema validation
 */

import { z } from "zod";
import { runAgent } from "./agent";
import type { AgentConfig, StreamEvent, StructuredResult } from "./types";

/**
 * Converts a Zod schema to JSON Schema format for the SDK
 */
function zodToJsonSchema(schema: z.ZodType<any>): any {
  // Basic conversion - for production, consider using zod-to-json-schema library
  // This is a simplified version that handles common cases

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: any = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value as z.ZodType);
      if (!(value as z.ZodType).isOptional()) {
        required.push(key);
      }
    }

    return {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
      additionalProperties: false,
    };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: "array",
      items: zodToJsonSchema(schema.element),
    };
  }

  if (schema instanceof z.ZodString) {
    return { type: "string" };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: "number" };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean" };
  }

  if (schema instanceof z.ZodEnum) {
    return {
      type: "string",
      enum: schema.options,
    };
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap());
  }

  if (schema instanceof z.ZodNullable) {
    const innerSchema = zodToJsonSchema(schema.unwrap());
    return {
      ...innerSchema,
      nullable: true,
    };
  }

  // Fallback
  return { type: "string" };
}

/**
 * Extracts JSON from markdown code blocks or raw JSON
 */
function extractJson(text: string): string {
  // Try to find JSON in code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return text.trim();
}

/**
 * Runs an agent and returns structured output validated against a Zod schema
 *
 * @param prompt - The prompt to send to the agent
 * @param zodSchema - Zod schema to validate the output against
 * @param config - Agent configuration
 * @param oauthToken - OAuth token for authentication
 * @returns StructuredResult with parsed and validated data
 *
 * @example
 * ```typescript
 * const schema = z.object({
 *   bugs: z.array(z.object({
 *     file: z.string(),
 *     line: z.number(),
 *     severity: z.enum(['low', 'medium', 'high']),
 *   })),
 * });
 *
 * const result = await runStructuredAgent(
 *   "Find all bugs in the codebase",
 *   schema,
 *   { allowedTools: ['Read', 'Grep'] }
 * );
 *
 * if (result.success) {
 *   console.log(result.data.bugs);
 * }
 * ```
 */
export async function runStructuredAgent<T extends z.ZodType>(
  prompt: string,
  zodSchema: T,
  config: AgentConfig = {},
  oauthToken?: string,
): Promise<StructuredResult<z.infer<T>>> {
  // Convert Zod schema to JSON Schema
  const jsonSchema = zodToJsonSchema(zodSchema);

  // Add structured output instruction to the prompt
  const structuredPrompt = `${prompt}

IMPORTANT: You must respond with valid JSON matching this exact schema:
${JSON.stringify(jsonSchema, null, 2)}

Provide your response as a JSON object. You can wrap it in a markdown code block if you want, but make sure the JSON is valid and matches the schema exactly.`;

  // Configure agent to use JSON output format if SDK supports it
  const enhancedConfig: AgentConfig = {
    ...config,
    additionalOptions: {
      ...config.additionalOptions,
      // SDK supports outputFormat for structured outputs
      outputFormat: {
        type: "json_schema",
        schema: jsonSchema,
      },
    },
  };

  try {
    // Run the agent
    const events: StreamEvent[] = [];
    const generator = runAgent(structuredPrompt, enhancedConfig, oauthToken);

    // Consume all events
    for await (const event of generator) {
      events.push(event);
    }

    // Build result from events
    const finalEvent = events.find((e) => e.type === "result");
    if (!finalEvent) {
      throw new Error("Agent execution did not produce a result");
    }

    const resultContent = finalEvent.content as any;
    console.log("[Structured] Result content:", JSON.stringify(resultContent, null, 2));

    const cost = {
      totalUsd: resultContent.total_cost_usd || 0,
      inputTokens: resultContent.usage?.input_tokens || 0,
      outputTokens: resultContent.usage?.output_tokens || 0,
      cacheCreationTokens: resultContent.usage?.cache_creation_input_tokens,
      cacheReadTokens: resultContent.usage?.cache_read_input_tokens,
      modelUsage: resultContent.modelUsage,
    };

    const success = resultContent.subtype === "success" && !resultContent.is_error;
    const content = resultContent.result || "";

    if (!success) {
      return {
        success: false,
        cost,
        error: resultContent.errors?.join(", ") || resultContent.result || "Agent execution failed",
        rawContent: content,
      };
    }

    // Extract and parse JSON from the result
    const jsonText = extractJson(content);
    let parsed: any;

    try {
      parsed = JSON.parse(jsonText);
    } catch (parseError) {
      return {
        success: false,
        cost,
        error: `Failed to parse JSON: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
        rawContent: content,
      };
    }

    // Validate against Zod schema
    const validation = zodSchema.safeParse(parsed);

    if (!validation.success) {
      return {
        success: false,
        cost,
        error: `Schema validation failed: ${validation.error.message}`,
        rawContent: content,
      };
    }

    return {
      success: true,
      data: validation.data,
      cost,
      rawContent: content,
    };
  } catch (error) {
    return {
      success: false,
      cost: {
        totalUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
      },
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Runs a structured agent with retry logic for parsing/validation failures
 *
 * @param prompt - The prompt to send to the agent
 * @param zodSchema - Zod schema to validate the output against
 * @param config - Agent configuration
 * @param maxRetries - Maximum number of retry attempts (default: 2)
 * @param oauthToken - OAuth token for authentication
 * @returns StructuredResult with parsed and validated data
 */
export async function runStructuredAgentWithRetry<T extends z.ZodType>(
  prompt: string,
  zodSchema: T,
  config: AgentConfig = {},
  maxRetries: number = 2,
  oauthToken?: string,
): Promise<StructuredResult<z.infer<T>>> {
  let lastResult: StructuredResult<z.infer<T>> | undefined;
  let attempts = 0;

  while (attempts <= maxRetries) {
    const result = await runStructuredAgent(prompt, zodSchema, config, oauthToken);

    if (result.success) {
      return {
        ...result,
        retries: attempts,
      };
    }

    lastResult = result;
    attempts++;

    // If we have retries left, try again with error feedback
    if (attempts <= maxRetries) {
      const retryPrompt = `${prompt}

PREVIOUS ATTEMPT FAILED: ${result.error}

Please try again, ensuring your response is valid JSON matching the schema exactly.`;

      // Use the retry prompt for next iteration
      prompt = retryPrompt;
    }
  }

  return {
    ...lastResult!,
    retries: attempts - 1,
  };
}
