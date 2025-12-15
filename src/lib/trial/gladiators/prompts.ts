/**
 * Prompts for Gladiators - the AI agents that compete to solve challenges
 */

/**
 * Builds a gladiator's system prompt
 *
 * This combines the gladiator's persona (from Lanista) with battle instructions.
 *
 * @param challenge - The challenge the gladiator must solve
 * @param gladiatorName - Name of the gladiator
 * @param persona - The gladiator's unique persona/approach
 * @param focus - What this gladiator should prioritize
 * @param trialType - Type of trial (GLADIATOR or LEGION)
 * @returns The complete system prompt for the gladiator
 */
export function buildGladiatorSystemPrompt(
  challenge: string,
  gladiatorName: string,
  persona: string,
  focus: string,
  trialType: "GLADIATOR" | "LEGION",
): string {
  const competitionMode =
    trialType === "GLADIATOR"
      ? `You are competing against other AI agents with different approaches. Your solution will be judged against theirs.`
      : `You are part of a team (Legion) working together. Your contribution will be evaluated as part of the collective effort.`;

  return `# YOUR IDENTITY

You are **${gladiatorName}**.

${persona}

# YOUR MISSION

${competitionMode}

**Your focus**: ${focus}

# THE CHALLENGE

${challenge}

# GUIDELINES

1. **Stay true to your persona** - Your unique perspective is why you were chosen
2. **Focus on your priority** - ${focus}
3. **Be thorough** - Use the tools available to you to explore and implement solutions
4. **Document your approach** - Explain your reasoning and decisions
5. **Deliver a complete solution** - Judges will evaluate your final output

# IMPORTANT

- Work within your working directory
- Use the tools you've been given effectively
- Your final response should summarize what you accomplished and why your approach is valuable

Now, tackle the challenge according to your persona and focus.`;
}

/**
 * Builds a gladiator prompt for code battles
 *
 * This is used when the trial involves working with a code repository.
 *
 * @param challenge - The coding challenge
 * @param gladiatorName - Name of the gladiator
 * @param persona - The gladiator's persona
 * @param focus - What to prioritize
 * @param trialType - Type of trial
 * @param repoContext - Repository context (setup instructions, etc.)
 * @param workingDirectory - The directory where the gladiator should work
 * @returns The complete system prompt for code battle
 */
export function buildCodeBattlePrompt(
  challenge: string,
  gladiatorName: string,
  persona: string,
  focus: string,
  trialType: "GLADIATOR" | "LEGION",
  repoContext?: string,
  workingDirectory?: string,
): string {
  const basePrompt = buildGladiatorSystemPrompt(
    challenge,
    gladiatorName,
    persona,
    focus,
    trialType,
  );

  const contextSection = repoContext
    ? `

# REPOSITORY CONTEXT

${repoContext}

`
    : "";

  const directorySection = workingDirectory
    ? `

# WORKING DIRECTORY

Your work should be done in: ${workingDirectory}

All file paths should be relative to this directory or absolute.
`
    : "";

  return `${basePrompt}${contextSection}${directorySection}`;
}

/**
 * Builds a simple task prompt for non-code challenges
 *
 * @param challenge - The challenge
 * @param gladiatorName - Name of the gladiator
 * @param persona - The gladiator's persona
 * @param focus - What to prioritize
 * @param trialType - Type of trial
 * @returns System prompt for general tasks
 */
export function buildTaskPrompt(
  challenge: string,
  gladiatorName: string,
  persona: string,
  focus: string,
  trialType: "GLADIATOR" | "LEGION",
): string {
  return buildGladiatorSystemPrompt(challenge, gladiatorName, persona, focus, trialType);
}

/**
 * Builds the user prompt (initial message) for a gladiator
 *
 * This is intentionally simple - the system prompt contains the context.
 */
export function buildGladiatorUserPrompt(): string {
  return "Begin your work on the challenge described in your mission.";
}
