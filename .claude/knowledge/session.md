# Knowledge Capture Session - 2025-12-14

### [22:43] [auth] Claude Agent SDK authentication
**Details**: The Claude Agent SDK (@anthropic-ai/claude-agent-sdk) can authenticate using CLAUDE_CODE_OAUTH_TOKEN instead of ANTHROPIC_API_KEY. Generate the token with `claude setup-token` command from Claude Code CLI. Set it as: export CLAUDE_CODE_OAUTH_TOKEN="your-token-here"
**Files**: issues/issue-0-infrastructure.md
---

### [00:02] [workflow] Use blocking sub-agents for large tasks
**Details**: When orchestrating large multi-issue tasks with the Task tool, NEVER use non-blocking sub-agents (run_in_background: true) and periodically check on them. This approach rapidly fills up context with status checks and partial results. Instead, use blocking sub-agents that complete fully before returning. For parallel work, spawn multiple blocking agents simultaneously in a single message - they will run in parallel but each will return complete results without polluting context with incremental checks.
**Files**: ORCHESTRATOR.md
---

