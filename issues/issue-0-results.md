# Issue 0: Infrastructure & Validation - COMPLETE

## Server Details
- **Host**: Hetzner CX22 (2 vCPU, 4GB RAM + 4GB swap)
- **IP**: `37.27.86.224`
- **Domain**: `https://enterthedome.xyz` (HTTPS live)
- **OS**: Ubuntu 24.04 LTS
- **User**: `deploy` (SSH key auth only, sudo access)

---

## What's Running

| Service | Status | Notes |
|---------|--------|-------|
| SSH | ✅ | Key-only auth, root disabled, port 22 |
| UFW | ✅ | Ports 22, 80, 443 only |
| Docker | ✅ | Rootless mode |
| PostgreSQL | ✅ | Docker container, port 5432 (localhost only) |
| Caddy | ✅ | Auto-SSL, reverse proxy to :3000 |

---

## Claude Agent SDK Validation

**Package**: `@anthropic-ai/claude-agent-sdk` (NOT `@anthropic-ai/claude-code`)

**Auth**: `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`

**Tested & Working**:
- ✅ Streaming responses
- ✅ Parallel sessions (3 concurrent)
- ✅ System prompts (`options.systemPrompt`)
- ✅ Tool control (`options.allowedTools` / `options.disallowedTools`)

**Example**:
```javascript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Your task here",
  options: {
    maxTurns: 10,
    systemPrompt: "You are a helpful assistant",
    disallowedTools: ["Bash", "Edit", "Write"]
  }
})) {
  if (message.type === "result") {
    console.log(message.result);
    console.log(`Cost: $${message.total_cost_usd}`);
  }
}
```

---

## Key Deviations from Plan (Ubuntu 24.04 Gotchas)

| Issue | Fix |
|-------|-----|
| `--disabled-password` locks account | `usermod -p '*' deploy` |
| Rootless Docker systemd not detected | Manual env vars + `nohup dockerd-rootless.sh` |
| Cgroups v2 permission denied | `/etc/systemd/system/user@.service.d/delegate.conf` |
| Polkit blocking Docker | `/etc/polkit-1/rules.d/50-docker-rootless.rules` |
| Postgres bind mount fails | Use named volume instead |
| SDK package renamed | `@anthropic-ai/claude-agent-sdk` |
| SDK auth | `CLAUDE_CODE_OAUTH_TOKEN`, not `ANTHROPIC_API_KEY` |

---

## Credentials Location

- **PostgreSQL password**: `~deploy/.pgpass`
- **Claude OAuth token**: Generate with `claude setup-token`

---

## Ready for Next Issues

These can now proceed in parallel:
- **Issue 1**: Database schema + API scaffolding
- **Issue 2**: Auth (GitHub OAuth + Claude token storage)
- **Issue 3**: Frontend shell (Next.js setup)
- **Issue 4**: Claude Agent SDK wrapper

---

## Quick Access

```bash
# SSH to server
ssh deploy@37.27.86.224

# Check services
./monitor.sh

# Start Docker daemon (if rebooted)
nohup dockerd-rootless.sh > ~/.docker/dockerd.log 2>&1 &

# Postgres logs
docker logs postgres
```
