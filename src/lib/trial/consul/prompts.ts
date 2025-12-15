/**
 * Consul Prompts
 *
 * System prompts and context building for the Consul AI,
 * which helps users make decree decisions after a verdict.
 */

interface Gladiator {
  id: string;
  name: string;
  persona: string;
  responseContent: string | null;
  branchName: string;
}

interface Judge {
  id: string;
  name: string;
  focus: string;
  evaluation: string | null;
}

interface Verdict {
  summary: string;
  winnerGladiatorId: string | null;
  reasoning: string;
}

interface Trial {
  id: string;
  challengePrompt: string;
  repoUrl: string | null;
  trialType: string;
}

interface ConsulContext {
  trial: Trial;
  gladiators: Gladiator[];
  judges: Judge[];
  verdict: Verdict;
}

/**
 * Build the Consul's system prompt
 */
export function buildConsulSystemPrompt(context: ConsulContext): string {
  const winnerName =
    context.gladiators.find((g) => g.id === context.verdict.winnerGladiatorId)?.name || "None";

  return `You are the Consul, a wise and measured AI advisor in the Thunderdome trial system. Your role is to help users make informed decisions about what to do after a gladiator battle has concluded.

# Your Responsibilities

1. **Explain the Verdict**: Help users understand the judges' evaluations and the final verdict
2. **Recommend Actions**: Suggest appropriate decree actions based on the trial results
3. **Execute Decrees**: Guide users through merging code, creating PRs, or other follow-up actions
4. **Synthesize Solutions**: When asked, help combine the best elements from multiple gladiators

# Context for This Trial

**Repository**: ${context.trial.repoUrl}
**Challenge**: ${context.trial.challengePrompt}
**Trial Type**: ${context.trial.trialType}

**Verdict**: ${context.verdict.summary}
**Winner**: ${winnerName}

# Available Actions

You can help users with these decree actions:

1. **Merge Winner**: Merge the winning gladiator's branch into the main branch
2. **Create PR**: Create a pull request with the winner's changes for review
3. **Synthesize**: Combine the best elements from multiple gladiators into a new solution
4. **Close Trial**: Archive the trial without taking action
5. **Custom Action**: Any other git/GitHub action the user requests

# Communication Style

- Be clear, professional, and thoughtful
- Use Roman/classical terminology when appropriate (befitting a Consul)
- Provide reasoning for your recommendations
- Ask clarifying questions when needed
- Be respectful of the judges' evaluations but help users think critically

# Important Notes

- You have access to the full trial context, including all gladiator responses and judge evaluations
- When suggesting actions, consider the specific repository and challenge context
- Always confirm before executing destructive actions
- If users want to deviate from the verdict, help them understand the implications

Begin by greeting the user and summarizing the verdict in a clear, actionable way.`;
}

/**
 * Build detailed trial context for the Consul
 */
export function buildConsulContext(context: ConsulContext): string {
  const sections = [
    "# Trial Results\n",
    `## Challenge\n${context.trial.challengePrompt}\n`,
    `## Verdict\n${context.verdict.summary}\n\n${context.verdict.reasoning}\n`,
  ];

  // Add gladiator information
  sections.push("## Gladiators\n");
  context.gladiators.forEach((gladiator) => {
    const isWinner = gladiator.id === context.verdict.winnerGladiatorId;
    sections.push(`### ${gladiator.name}${isWinner ? " 👑 WINNER" : ""}`);
    sections.push(`**Persona**: ${gladiator.persona}`);
    sections.push(`**Branch**: ${gladiator.branchName}`);
    sections.push(`**Response**:\n\`\`\`\n${gladiator.responseContent || "No response"}\n\`\`\`\n`);
  });

  // Add judge evaluations
  sections.push("## Judge Evaluations\n");
  context.judges.forEach((judge) => {
    sections.push(`### ${judge.name} - ${judge.focus}`);

    if (judge.evaluation) {
      try {
        const parsed = JSON.parse(judge.evaluation);
        sections.push(`**Summary**: ${parsed.summary || "N/A"}\n`);

        if (parsed.evaluations && Array.isArray(parsed.evaluations)) {
          parsed.evaluations.forEach((evalData: any) => {
            const gladiator = context.gladiators.find((g) => g.id === evalData.gladiatorId);
            sections.push(`#### ${gladiator?.name || "Unknown"}: ${evalData.score}/10`);

            if (evalData.strengths?.length > 0) {
              sections.push("**Strengths**:");
              evalData.strengths.forEach((s: string) => sections.push(`- ${s}`));
            }

            if (evalData.weaknesses?.length > 0) {
              sections.push("**Weaknesses**:");
              evalData.weaknesses.forEach((w: string) => sections.push(`- ${w}`));
            }

            if (evalData.comments) {
              sections.push(`**Comments**: ${evalData.comments}`);
            }
            sections.push("");
          });
        }
      } catch {
        // If not JSON, just show raw evaluation
        sections.push(judge.evaluation);
      }
    } else {
      sections.push("No evaluation available");
    }
    sections.push("");
  });

  return sections.join("\n");
}

/**
 * Build the initial greeting message from the Consul
 */
export function buildConsulGreeting(context: ConsulContext): string {
  const winnerName =
    context.gladiators.find((g) => g.id === context.verdict.winnerGladiatorId)?.name || "None";

  return `Salutations! I am the Consul, your advisor for this trial.

**Verdict Summary**: ${context.verdict.summary}

**Winner**: ${winnerName}

The judges have completed their evaluations and a verdict has been rendered. I am here to help you understand the results and decide on the appropriate decree action.

**Recommended Actions**:
${
  context.verdict.winnerGladiatorId
    ? `- Merge ${winnerName}'s changes to complete the trial
- Create a PR for team review before merging
- Synthesize elements from multiple gladiators if the contest was close`
    : `- Review the evaluations to understand why no clear winner emerged
- Consider running a new trial with adjusted parameters
- Synthesize a solution combining the best elements`
}

What would you like to do with these results?`;
}
