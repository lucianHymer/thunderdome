/**
 * Zod schemas for Thunderdome agents (Lanista, Arbiter, Judges)
 */

import { z } from "zod";

/**
 * Schema for a single gladiator configuration
 */
export const GladiatorSchema = z.object({
  /** Name/identifier for this gladiator */
  name: z.string().min(1).max(100),

  /** Persona description defining the gladiator's approach */
  persona: z.string().min(10),

  /** Claude model to use for this gladiator */
  model: z.enum(["opus", "sonnet", "haiku"]),

  /** Temperature setting (0-1) */
  temperature: z.number().min(0).max(1),

  /** Tools this gladiator has access to */
  tools: z.array(z.string()).min(1),

  /** Primary focus area for this gladiator */
  focus: z.string().min(10),
});

export type Gladiator = z.infer<typeof GladiatorSchema>;

/**
 * Schema for Lanista output (gladiator selection and configuration)
 */
export const LanistaOutputSchema = z.object({
  /** Reasoning for gladiator selection */
  reasoning: z.string().min(20),

  /** Array of configured gladiators to compete */
  gladiators: z
    .array(GladiatorSchema)
    .min(2, "Must have at least 2 gladiators")
    .max(6, "Cannot have more than 6 gladiators"),
});

export type LanistaOutput = z.infer<typeof LanistaOutputSchema>;

/**
 * Schema for a single judge configuration
 */
export const JudgeSchema = z.object({
  /** Name/identifier for this judge */
  name: z.string().min(1).max(100),

  /** Primary focus area for evaluation */
  focus: z.string().min(10),

  /** Specific criteria this judge will evaluate */
  evaluationCriteria: z.array(z.string()).min(1).max(10),
});

export type Judge = z.infer<typeof JudgeSchema>;

/**
 * Schema for Arbiter output (judge selection and configuration)
 */
export const ArbiterOutputSchema = z.object({
  /** Reasoning for judge selection */
  reasoning: z.string().min(20),

  /** Array of configured judges for evaluation */
  judges: z
    .array(JudgeSchema)
    .min(1, "Must have at least 1 judge")
    .max(5, "Cannot have more than 5 judges"),
});

export type ArbiterOutput = z.infer<typeof ArbiterOutputSchema>;

/**
 * Schema for a single gladiator evaluation by a judge
 */
export const GladiatorEvaluationSchema = z.object({
  /** ID of the gladiator being evaluated */
  gladiatorId: z.string(),

  /** Score from 0-100 */
  score: z.number().min(0).max(100),

  /** List of strengths identified */
  strengths: z.array(z.string()).min(0),

  /** List of weaknesses identified */
  weaknesses: z.array(z.string()).min(0),

  /** Detailed reasoning for the score */
  reasoning: z.string().min(20),
});

export type GladiatorEvaluation = z.infer<typeof GladiatorEvaluationSchema>;

/**
 * Schema for Judge output (evaluation results)
 */
export const JudgeOutputSchema = z.object({
  /** Array of evaluations for each gladiator */
  evaluations: z.array(GladiatorEvaluationSchema).min(1),

  /** Ranked list of gladiator IDs (best to worst) */
  ranking: z.array(z.string()).min(1),

  /** Overall summary of the evaluation */
  summary: z.string().min(50),
});

export type JudgeOutput = z.infer<typeof JudgeOutputSchema>;

/**
 * Schema for aggregated results from all judges
 */
export const AggregatedResultsSchema = z.object({
  /** Individual judge outputs */
  judgeOutputs: z.array(
    z.object({
      judgeName: z.string(),
      output: JudgeOutputSchema,
    }),
  ),

  /** Consensus ranking (aggregated from all judges) */
  consensusRanking: z.array(z.string()).min(1),

  /** Average scores for each gladiator */
  averageScores: z.record(z.string(), z.number()),

  /** Overall winner */
  winner: z.string(),

  /** Final summary combining all judge perspectives */
  finalSummary: z.string().min(50),
});

export type AggregatedResults = z.infer<typeof AggregatedResultsSchema>;

/**
 * Schema for the complete Thunderdome session
 */
export const ThunderdomeSessionSchema = z.object({
  /** Unique session ID */
  sessionId: z.string(),

  /** User's task/prompt */
  task: z.string(),

  /** Lanista output (gladiator configuration) */
  lanistaOutput: LanistaOutputSchema,

  /** Arbiter output (judge configuration) */
  arbiterOutput: ArbiterOutputSchema,

  /** Gladiator work results */
  gladiatorResults: z.array(
    z.object({
      gladiatorId: z.string(),
      result: z.string(),
      cost: z.number(),
      duration: z.number(),
    }),
  ),

  /** Aggregated evaluation results */
  evaluationResults: AggregatedResultsSchema,

  /** Total session cost in USD */
  totalCost: z.number(),

  /** Total session duration in milliseconds */
  totalDuration: z.number(),

  /** Timestamp when session started */
  startedAt: z.string().datetime(),

  /** Timestamp when session completed */
  completedAt: z.string().datetime(),
});

export type ThunderdomeSession = z.infer<typeof ThunderdomeSessionSchema>;

/**
 * Utility schemas for common patterns
 */

/**
 * Schema for cost information
 */
export const CostInfoSchema = z.object({
  totalUsd: z.number().min(0),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  cacheCreationTokens: z.number().int().min(0).optional(),
  cacheReadTokens: z.number().int().min(0).optional(),
});

export type CostInfo = z.infer<typeof CostInfoSchema>;

/**
 * Schema for error responses
 */
export const ErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.record(z.any()).optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
