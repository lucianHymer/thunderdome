# Issue 0: Infrastructure & Validation

> Foundation issue - must complete before parallel work can begin

## Overview

Provision and harden the Hetzner server, set up core services, validate Claude Agent SDK works as expected.

**Server**: Hetzner CX22 (2 vCPU, 4GB RAM) + 4GB swap
**IP**: `37.27.86.224`
**Domain**: `enterthedome.xyz`
**OS**: Ubuntu 24.04 LTS

---

## Tasks

### 1. Server Hardening

#### 1.1 Create deploy user (run as root initially)
```bash
# Create user
adduser --disabled-password --gecos "" deploy

# Add to sudo group
usermod -aG sudo deploy

# Allow sudo without password (for initial setup, can tighten later)
echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/deploy

# IMPORTANT: Unlock the account (--disabled-password locks it, blocking SSH key auth)
usermod -p '*' deploy
```

> **⚠️ Deviation**: The `--disabled-password` flag locks the account entirely, which blocks SSH key authentication. The `usermod -p '*'` sets an invalid password hash, keeping the account unlocked for SSH keys while making password login impossible.

#### 1.2 Configure SSH key auth
```bash
# As root, set up deploy user's SSH
mkdir -p /home/deploy/.ssh
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJNiPlQhkUchuKjMq9sHryXyy2qVS4XuiVOOcRsdRnH/" > /home/deploy/.ssh/authorized_keys
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
```

#### 1.3 Harden SSH config
Edit `/etc/ssh/sshd_config`:
```bash
# Disable root login
PermitRootLogin no

# Disable password auth
PasswordAuthentication no
ChallengeResponseAuthentication no
UsePAM no

# Only allow deploy user
AllowUsers deploy
```

Then:
```bash
systemctl restart sshd
```

**TEST BEFORE CLOSING ROOT SESSION**: Open new terminal, verify `ssh deploy@37.27.86.224` works.

#### 1.4 Configure UFW firewall
```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (for Caddy ACME)
ufw allow 443/tcp   # HTTPS
ufw enable
```

---

### 2. Docker (Rootless)

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Install rootless dependencies
sudo apt-get install -y uidmap dbus-user-session

# Set up rootless for deploy user (run as deploy, not root)
sudo systemctl disable --now docker.service docker.socket
dockerd-rootless-setuptool.sh install
```

> **⚠️ Deviation**: On Ubuntu 24.04, systemd user session may not be detected. If you see "systemd not detected", use manual setup below instead of the default instructions.

#### 2.1 Manual rootless setup (if systemd not detected)

```bash
# Add environment variables to bashrc
echo 'export XDG_RUNTIME_DIR=/home/deploy/.docker/run' >> ~/.bashrc
echo 'export PATH=/usr/bin:$PATH' >> ~/.bashrc
echo 'export DOCKER_HOST=unix:///home/deploy/.docker/run/docker.sock' >> ~/.bashrc
source ~/.bashrc

# Create runtime directory
mkdir -p /home/deploy/.docker/run
```

#### 2.2 Cgroups v2 delegation (required on Ubuntu 24.04)

As root, configure systemd cgroup delegation:
```bash
sudo mkdir -p /etc/systemd/system/user@.service.d
sudo tee /etc/systemd/system/user@.service.d/delegate.conf << 'EOF'
[Service]
Delegate=cpu cpuset io memory pids
EOF

sudo systemctl daemon-reload
sudo loginctl enable-linger deploy
```

#### 2.3 Polkit rule for rootless Docker

Without this, you'll get "Interactive authentication required" errors:
```bash
sudo tee /etc/polkit-1/rules.d/50-docker-rootless.rules << 'EOF'
polkit.addRule(function(action, subject) {
    if (action.id == "org.freedesktop.systemd1.manage-units" &&
        subject.user == "deploy") {
        return polkit.Result.YES;
    }
});
EOF

sudo systemctl restart polkit
```

**After all the above**: Logout completely and SSH back in as `deploy`.

#### 2.4 Start dockerd-rootless manually

```bash
# Start rootless Docker daemon
nohup dockerd-rootless.sh > ~/.docker/dockerd.log 2>&1 &

# For persistence across reboots, add to crontab:
# @reboot PATH=/usr/bin:/sbin:/usr/sbin:$PATH XDG_RUNTIME_DIR=/home/deploy/.docker/run dockerd-rootless.sh > /home/deploy/.docker/dockerd.log 2>&1

# Verify
sleep 3
docker run hello-world
```

---

### 3. Caddy (Reverse Proxy + Auto-SSL)

```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

Create `/etc/caddy/Caddyfile`:
```
enterthedome.xyz {
    reverse_proxy localhost:3000
}
```

```bash
sudo systemctl enable caddy
sudo systemctl start caddy
```

**Before this works**: Point DNS A record for `enterthedome.xyz` → `37.27.86.224`

---

### 4. PostgreSQL (Docker)

```bash
# Create data directory
mkdir -p ~/data/postgres

# Run Postgres container
docker run -d \
  --name postgres \
  --restart unless-stopped \
  -e POSTGRES_USER=thunderdome \
  -e POSTGRES_PASSWORD=$(openssl rand -base64 32) \
  -e POSTGRES_DB=thunderdome \
  -v ~/data/postgres:/var/lib/postgresql/data \
  -p 127.0.0.1:5432:5432 \
  postgres:16

# Save the password!
docker logs postgres 2>&1 | grep POSTGRES_PASSWORD
```

Note: Binding to `127.0.0.1` only - not exposed to internet.

---

### 5. Base Trial Container Image

Create `~/trial-base/Dockerfile`:
```dockerfile
FROM node:22-bookworm

# Essential build tools
RUN apt-get update && apt-get install -y \
    git \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create workspace directory
WORKDIR /workspace

# Non-root user for running trials
RUN useradd -m -s /bin/bash gladiator
USER gladiator
```

Build it:
```bash
cd ~/trial-base
docker build -t trial-base:latest .
```

This is intentionally lean. Specialized toolchains (Foundry, Rust, Python) get installed by each repo's `.thunderdome/setup.sh`.

---

### 6. Claude Agent SDK Validation

This is critical - need to verify before building the app.

> **⚠️ Deviation**: Package renamed from `@anthropic-ai/claude-code` to `@anthropic-ai/claude-agent-sdk`. Auth uses `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`), NOT `ANTHROPIC_API_KEY`.

#### 6.1 Setup
```bash
mkdir -p ~/sdk-test && cd ~/sdk-test
npm init -y
npm pkg set type=module
npm install @anthropic-ai/claude-agent-sdk

# Generate OAuth token (requires Claude Code CLI)
claude setup-token
export CLAUDE_CODE_OAUTH_TOKEN="your-token-here"
```

#### 6.2 Test script (`test.js`)
```javascript
import { query } from "@anthropic-ai/claude-agent-sdk";

async function testBasic() {
  console.log("=== Test 1: Basic Streaming ===\n");

  for await (const message of query({
    prompt: "What is 2 + 2? Reply in one word.",
    options: {
      maxTurns: 1,
      systemPrompt: "You are a helpful assistant. Be concise."
    }
  })) {
    console.log("Message type:", message.type);

    if (message.type === "assistant") {
      console.log("Assistant:", JSON.stringify(message.message?.content, null, 2));
    }

    if (message.type === "result") {
      console.log("Result:", message.result);
      console.log("Cost: $" + message.total_cost_usd);
      console.log("Turns:", message.num_turns);
    }
  }
}

async function testParallel() {
  console.log("\n=== Test 2: Parallel Sessions ===\n");

  const runQuery = async (prompt) => {
    for await (const msg of query({
      prompt,
      options: { maxTurns: 1, disallowedTools: ["Bash", "Edit", "Write"] }
    })) {
      if (msg.type === "result") return msg;
    }
  };

  const start = Date.now();
  const results = await Promise.all([
    runQuery("What is 2+2? One word."),
    runQuery("What is 3+3? One word."),
    runQuery("What is 4+4? One word."),
  ]);

  console.log("Parallel results:");
  results.forEach((r, i) => console.log(`  Query ${i+1}: ${r?.result}`));
  console.log(`Total time: ${Date.now() - start}ms`);
  console.log(`Total cost: $${results.reduce((sum, r) => sum + (r?.total_cost_usd || 0), 0).toFixed(4)}`);
}

async function main() {
  await testBasic();
  await testParallel();
}

main().catch(console.error);
```

Run: `node test.js`

#### 6.3 Validated findings
- [x] Streaming works as expected
- [x] Message types: `assistant`, `result`, `system`, etc.
- [x] System prompts: `options.systemPrompt`
- [x] Tool control: `options.allowedTools` / `options.disallowedTools`
- [x] Parallel sessions work with single OAuth token
- [ ] Rate limits: TBD under load
- [ ] Structured output with Zod: TBD

---

### 7. DNS Configuration

In your domain registrar (wherever you bought enterthedome.xyz):

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | 37.27.86.224 | 300 |
| A | www | 37.27.86.224 | 300 |

---

### 8. Monitoring Setup

Basic monitoring for now:

```bash
# Install htop
sudo apt install -y htop

# Create a simple monitoring script
cat > ~/monitor.sh << 'EOF'
#!/bin/bash
echo "=== Memory ==="
free -h
echo ""
echo "=== Docker Containers ==="
docker stats --no-stream
echo ""
echo "=== Disk ==="
df -h /
EOF
chmod +x ~/monitor.sh
```

Can add Netdata later if we want pretty graphs:
```bash
# One-liner install (optional, do later)
# wget -O /tmp/netdata-kickstart.sh https://get.netdata.cloud/kickstart.sh && sh /tmp/netdata-kickstart.sh
```

---

## Validation Checklist

- [x] Can SSH as `deploy@37.27.86.224` with key
- [x] Cannot SSH as root
- [x] Cannot SSH with password
- [x] UFW is active, only 22/80/443 open
- [x] Docker runs rootless (`docker run hello-world`)
- [x] Caddy serves something at https://enterthedome.xyz
- [x] Postgres is running and accessible locally
- [x] Base trial container builds and runs
- [x] Claude Agent SDK streams responses
- [x] Claude Agent SDK handles parallel requests
- [ ] Structured output works with Zod schemas (deferred)

---

## Deviations from Original Plan (Ubuntu 24.04)

| Issue | Symptom | Fix |
|-------|---------|-----|
| Locked account | `Permission denied (publickey)` even with correct key | `usermod -p '*' deploy` to unlock without setting password |
| Systemd not detected | `dockerd-rootless-setuptool.sh` says "systemd not detected" | Manual env vars in `.bashrc`, manual `dockerd-rootless.sh` start |
| Cgroups v2 | `unable to apply cgroup configuration` | Create `/etc/systemd/system/user@.service.d/delegate.conf` |
| Polkit blocking | `Interactive authentication required` | Create `/etc/polkit-1/rules.d/50-docker-rootless.rules` |
| Postgres bind mount | `chown: Operation not permitted` | Use named volume (`postgres_data:`) instead of bind mount (`~/data/postgres:`) |
| SDK package renamed | `@anthropic-ai/claude-code` doesn't exist | Use `@anthropic-ai/claude-agent-sdk` |
| SDK auth | `ANTHROPIC_API_KEY` not recognized | Use `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` |

---

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Postgres | Docker | Cleaner isolation, easier backups, portable |
| Docker mode | Rootless | Security - containers can't escalate to root |
| Reverse proxy | Caddy | Auto-SSL, simple config |
| Base image | Lean (Node only) | Let setup.sh handle specialized toolchains |
| Server size | CX22 (4GB + 4GB swap) | Start small, scale if needed |

---

## Open Questions After This Issue

1. ~~What's the exact Claude Agent SDK API for system prompts and temperature?~~ → **Answered**: `options.systemPrompt`, temperature not directly exposed
2. What are the actual rate limits for parallel sessions? (3 concurrent worked fine)
3. Do we need to handle OAuth token refresh, or are tokens long-lived? (`claude setup-token`)
4. What's the best way to stream from container → host → WebSocket → browser?

---

## Next Issues (Unlocked After This)

Once Issue 0 is complete, these can proceed in parallel:
- **Issue 1**: Database schema + API scaffolding
- **Issue 2**: Auth (GitHub OAuth + Claude token storage)
- **Issue 3**: Frontend shell (Next.js setup, basic routing)
- **Issue 4**: Claude Agent SDK wrapper (streaming, parallel execution)
