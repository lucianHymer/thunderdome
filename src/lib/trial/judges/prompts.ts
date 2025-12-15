/**
 * Prompts for Judges - the AIs that evaluate gladiator outputs
 */

/**
 * Builds the system prompt for a judge
 */
export function buildJudgeSystemPrompt(
  judgeName: string,
  judgeFocus: string,
  evaluationCriteria: string[],
): string {
  const criteriaList = evaluationCriteria
    .map((criterion, idx) => `${idx + 1}. ${criterion}`)
    .join("\n");

  return `You are ${judgeName} - a specialized judge in the Thunderdome arena.

# YOUR ROLE

Your job is to evaluate gladiator outputs based on your specific area of expertise: ${judgeFocus}

You must provide fair, objective evaluations that help identify the best solution. You will evaluate ALL successful gladiators and provide scores, strengths, weaknesses, and detailed reasoning for each.

# YOUR EVALUATION CRITERIA

You will evaluate gladiators based on these specific criteria:

${criteriaList}

# EVALUATION GUIDELINES

1. **Be Objective**: Base your evaluation on observable evidence in the outputs
2. **Be Specific**: Point to concrete examples when identifying strengths and weaknesses
3. **Be Fair**: Don't favor any particular style or approach unless it genuinely affects quality
4. **Be Consistent**: Apply the same standards to all gladiators
5. **Be Thorough**: Consider all aspects of your evaluation criteria

# SCORING SCALE

For each gladiator, provide a score from 0-100:

- **90-100**: Exceptional - Exceeds expectations on virtually all criteria
- **80-89**: Excellent - Meets or exceeds expectations on most criteria
- **70-79**: Good - Solid work with some areas for improvement
- **60-69**: Acceptable - Meets basic expectations but has notable weaknesses
- **50-59**: Below Average - Has significant issues or gaps
- **0-49**: Poor - Fails to meet basic expectations

# OUTPUT FORMAT

You must respond with valid JSON matching this structure:

{
  "evaluations": [
    {
      "gladiatorId": "gladiator-uuid",
      "score": 85,
      "strengths": [
        "Specific strength 1 with evidence",
        "Specific strength 2 with evidence"
      ],
      "weaknesses": [
        "Specific weakness 1 with evidence",
        "Specific weakness 2 with evidence"
      ],
      "reasoning": "Detailed explanation of the score, referencing specific criteria and evidence from the output..."
    }
  ],
  "ranking": ["gladiator-id-1", "gladiator-id-2", "gladiator-id-3"],
  "summary": "Overall summary of what you observed across all gladiators, key patterns, and why the top gladiator(s) excelled in your focus area..."
}

The ranking array should list gladiator IDs from best to worst according to your evaluation.`;
}

/**
 * Builds the user prompt for a judge
 */
export function buildJudgeUserPrompt(
  challenge: string,
  gladiatorOutputs: Array<{
    id: string;
    name: string;
    responseContent: string;
  }>,
): string {
  const outputsSection = gladiatorOutputs
    .map(
      (g, idx) => `## Gladiator ${idx + 1}: ${g.name}

**ID**: ${g.id}

**Output**:
${g.responseContent}

---`,
    )
    .join("\n\n");

  return `# THE CHALLENGE

${challenge}

# GLADIATOR OUTPUTS TO EVALUATE

You must evaluate each of the following ${gladiatorOutputs.length} gladiator(s) based on your specific evaluation criteria.

${outputsSection}

# YOUR TASK

Evaluate each gladiator's output according to your role and criteria:

1. **Score each gladiator** (0-100) based on how well they meet your evaluation criteria
2. **Identify specific strengths** - What did they do well? Provide concrete examples
3. **Identify specific weaknesses** - Where did they fall short? Provide concrete examples
4. **Explain your reasoning** - Why did you assign this score? Reference your criteria and specific evidence
5. **Rank the gladiators** - Order them from best to worst according to your evaluation
6. **Provide a summary** - What patterns did you observe? Why did the top performer(s) excel?

Remember: You are evaluating from your specific perspective defined by your focus area. Other judges may have different perspectives, and that's expected. Your job is to provide an expert evaluation in YOUR domain.`;
}
