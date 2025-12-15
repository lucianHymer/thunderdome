/**
 * FINDINGS.md Template for Code Battles
 *
 * Template for gladiator submissions
 */

export const FINDINGS_TEMPLATE = `# Thunderdome Findings

## Summary
[Brief description of what you found/built]

## Approach
[Explain your approach and reasoning]

## Changes Made
[List the files you modified and what you changed]

## Testing
[How to verify your changes work]

## Trade-offs
[Any trade-offs or concerns]

## Recommendations
[Your recommendations for next steps]
`;

export function createFindingsPromptAddition(): string {
  return `

IMPORTANT: When you're done, create a file at \`.thunderdome/FINDINGS.md\` with your findings.
Use this structure:

\`\`\`markdown
${FINDINGS_TEMPLATE}
\`\`\`

This file is REQUIRED for your submission to be considered.`;
}
