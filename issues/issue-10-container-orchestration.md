# Issue 10: Container Orchestration

> **Wave 4** - Depends on Issues 1-9 (MVP complete)
> **Parallel with**: Issues 11, 12

## Overview

Implement Docker container management for code battles. Each trial gets an ephemeral container that's destroyed after branches are pushed. This ensures isolation between trials and protects against malicious code.

## Why Containers?

From the spec:
> If gladiators can run bash in a repo, and that repo is malicious (or just has a sketchy `postinstall` script), you're toast without isolation.

Container boundary:
- **Outside container**: Web app, API, database, orchestration (trusted)
- **Inside container**: Repo code, gladiator execution (untrusted)

## Tasks

### 1. Docker Client Setup

Create `src/lib/docker/client.ts`:
```typescript
import Docker from "dockerode"

// Connect to rootless Docker daemon
const docker = new Docker({
  socketPath: process.env.DOCKER_SOCKET || "/home/deploy/.docker/run/docker.sock",
})

export { docker }

export async function isDockerAvailable(): Promise<boolean> {
  try {
    await docker.ping()
    return true
  } catch {
    return false
  }
}
```

### 2. Container Lifecycle Manager

Create `src/lib/docker/container.ts`:
```typescript
import { docker } from "./client"
import { Writable } from "stream"

export interface TrialContainerConfig {
  trialId: string
  repoUrl: string
  githubToken: string
  claudeToken: string
  setupScript?: string
}

export interface TrialContainer {
  id: string
  exec: (command: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>
  execStream: (command: string, onData: (data: string) => void) => Promise<number>
  copyFileIn: (localPath: string, containerPath: string) => Promise<void>
  copyFileOut: (containerPath: string) => Promise<Buffer>
  destroy: () => Promise<void>
}

const TRIAL_IMAGE = "trial-base:latest"
const CONTAINER_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes max

export async function createTrialContainer(
  config: TrialContainerConfig
): Promise<TrialContainer> {
  const containerName = `trial-${config.trialId}`

  // Create container
  const container = await docker.createContainer({
    Image: TRIAL_IMAGE,
    name: containerName,
    Env: [
      `GITHUB_TOKEN=${config.githubToken}`,
      `CLAUDE_CODE_OAUTH_TOKEN=${config.claudeToken}`,
      `TRIAL_ID=${config.trialId}`,
    ],
    HostConfig: {
      // Resource limits
      Memory: 2 * 1024 * 1024 * 1024, // 2GB
      MemorySwap: 2 * 1024 * 1024 * 1024, // No swap
      CpuPeriod: 100000,
      CpuQuota: 100000, // 1 CPU
      // Security
      NetworkMode: "bridge", // Limited network access
      CapDrop: ["ALL"],
      CapAdd: ["CHOWN", "SETUID", "SETGID"], // Minimal caps for git
      SecurityOpt: ["no-new-privileges"],
      // Cleanup
      AutoRemove: false, // We'll remove manually after extracting data
    },
    WorkingDir: "/workspace",
    Cmd: ["sleep", "infinity"], // Keep container running
  })

  await container.start()

  // Set up timeout for automatic destruction
  const timeoutId = setTimeout(async () => {
    console.warn(`Container ${containerName} timed out, destroying`)
    try {
      await container.stop({ t: 10 })
      await container.remove()
    } catch (e) {
      console.error(`Failed to cleanup timed out container: ${e}`)
    }
  }, CONTAINER_TIMEOUT_MS)

  // Clone the repository
  await execInContainer(container, [
    "git",
    "clone",
    `https://x-access-token:${config.githubToken}@${config.repoUrl.replace("https://", "")}`,
    "/workspace/repo",
  ])

  return {
    id: container.id,

    async exec(command: string) {
      return execInContainer(container, ["bash", "-c", command])
    },

    async execStream(command: string, onData: (data: string) => void) {
      return execInContainerStream(container, ["bash", "-c", command], onData)
    },

    async copyFileIn(localPath: string, containerPath: string) {
      // Implementation using container.putArchive
    },

    async copyFileOut(containerPath: string) {
      const stream = await container.getArchive({ path: containerPath })
      // Extract and return file contents
      return Buffer.from("")
    },

    async destroy() {
      clearTimeout(timeoutId)
      try {
        await container.stop({ t: 10 })
      } catch {
        // Container may already be stopped
      }
      await container.remove()
    },
  }
}

async function execInContainer(
  container: Docker.Container,
  cmd: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: "/workspace/repo",
  })

  const stream = await exec.start({})

  return new Promise((resolve, reject) => {
    let stdout = ""
    let stderr = ""

    const stdoutStream = new Writable({
      write(chunk, _, callback) {
        stdout += chunk.toString()
        callback()
      },
    })

    const stderrStream = new Writable({
      write(chunk, _, callback) {
        stderr += chunk.toString()
        callback()
      },
    })

    container.modem.demuxStream(stream, stdoutStream, stderrStream)

    stream.on("end", async () => {
      const inspect = await exec.inspect()
      resolve({
        stdout,
        stderr,
        exitCode: inspect.ExitCode || 0,
      })
    })

    stream.on("error", reject)
  })
}

async function execInContainerStream(
  container: Docker.Container,
  cmd: string[],
  onData: (data: string) => void
): Promise<number> {
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: "/workspace/repo",
  })

  const stream = await exec.start({})

  return new Promise((resolve, reject) => {
    const outputStream = new Writable({
      write(chunk, _, callback) {
        onData(chunk.toString())
        callback()
      },
    })

    container.modem.demuxStream(stream, outputStream, outputStream)

    stream.on("end", async () => {
      const inspect = await exec.inspect()
      resolve(inspect.ExitCode || 0)
    })

    stream.on("error", reject)
  })
}
```

### 3. Container Pool (Optional Optimization)

Create `src/lib/docker/pool.ts`:
```typescript
// For future optimization: pre-warm containers
// Not needed for MVP

export interface ContainerPool {
  acquire(): Promise<string>
  release(containerId: string): Promise<void>
}

// Placeholder for future implementation
```

### 4. Trial Container Service

Create `src/lib/trial/container-service.ts`:
```typescript
import { createTrialContainer, TrialContainer } from "@/lib/docker/container"
import { db } from "@/db"
import { trials } from "@/db/schema"
import { eq } from "drizzle-orm"
import { decrypt } from "@/lib/encryption"

// Track active containers
const activeContainers = new Map<string, TrialContainer>()

export async function startTrialContainer(
  trialId: string,
  userId: string
): Promise<TrialContainer> {
  // Get trial and user data
  const trial = await db.query.trials.findFirst({
    where: eq(trials.id, trialId),
  })

  if (!trial || !trial.repoUrl) {
    throw new Error("Trial not found or no repo URL")
  }

  // Get user tokens
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  })

  if (!user?.githubAccessToken || !user?.claudeOauthToken) {
    throw new Error("Missing required tokens")
  }

  const container = await createTrialContainer({
    trialId,
    repoUrl: trial.repoUrl,
    githubToken: decrypt(user.githubAccessToken),
    claudeToken: decrypt(user.claudeOauthToken),
  })

  activeContainers.set(trialId, container)

  return container
}

export async function getTrialContainer(trialId: string): Promise<TrialContainer | undefined> {
  return activeContainers.get(trialId)
}

export async function destroyTrialContainer(trialId: string): Promise<void> {
  const container = activeContainers.get(trialId)
  if (container) {
    await container.destroy()
    activeContainers.delete(trialId)
  }
}

export async function runSetupInContainer(
  container: TrialContainer,
  onOutput: (data: string) => void
): Promise<boolean> {
  // Check for .thunderdome/setup.sh
  const { exitCode: checkCode } = await container.exec(
    "test -f .thunderdome/setup.sh && echo exists"
  )

  if (checkCode !== 0) {
    onOutput("No .thunderdome/setup.sh found, skipping setup\n")
    return true
  }

  onOutput("Running .thunderdome/setup.sh...\n")

  const exitCode = await container.execStream(
    "bash .thunderdome/setup.sh",
    onOutput
  )

  return exitCode === 0
}
```

### 5. Update Base Container Image

Update `~/trial-base/Dockerfile`:
```dockerfile
FROM node:22-bookworm

# Install dependencies
RUN apt-get update && apt-get install -y \
    git \
    build-essential \
    curl \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Agent SDK globally
RUN npm install -g @anthropic-ai/claude-agent-sdk

# Create workspace
WORKDIR /workspace

# Create non-root user
RUN useradd -m -s /bin/bash gladiator && \
    chown -R gladiator:gladiator /workspace

USER gladiator

# Default command
CMD ["sleep", "infinity"]
```

### 6. Container Health Checks

Create `src/lib/docker/health.ts`:
```typescript
import { docker, isDockerAvailable } from "./client"

export interface DockerHealth {
  available: boolean
  containersRunning: number
  memoryUsage: number
  errors: string[]
}

export async function checkDockerHealth(): Promise<DockerHealth> {
  const errors: string[] = []

  const available = await isDockerAvailable()
  if (!available) {
    return {
      available: false,
      containersRunning: 0,
      memoryUsage: 0,
      errors: ["Docker daemon not available"],
    }
  }

  try {
    const containers = await docker.listContainers({
      filters: { name: ["trial-"] },
    })

    // Calculate memory usage
    let totalMemory = 0
    for (const containerInfo of containers) {
      try {
        const container = docker.getContainer(containerInfo.Id)
        const stats = await container.stats({ stream: false })
        totalMemory += (stats as any).memory_stats?.usage || 0
      } catch {
        // Container may have been removed
      }
    }

    return {
      available: true,
      containersRunning: containers.length,
      memoryUsage: totalMemory,
      errors,
    }
  } catch (error) {
    return {
      available: true,
      containersRunning: 0,
      memoryUsage: 0,
      errors: [error instanceof Error ? error.message : "Unknown error"],
    }
  }
}
```

### 7. Admin Health Endpoint

Create `src/app/api/admin/health/route.ts`:
```typescript
import { NextResponse } from "next/server"
import { checkDockerHealth } from "@/lib/docker/health"

export async function GET() {
  const dockerHealth = await checkDockerHealth()

  return NextResponse.json({
    status: dockerHealth.available ? "healthy" : "degraded",
    docker: dockerHealth,
    timestamp: new Date().toISOString(),
  })
}
```

## File Structure

```
src/lib/
├── docker/
│   ├── client.ts       # Docker connection
│   ├── container.ts    # Container lifecycle
│   ├── pool.ts         # Container pool (future)
│   └── health.ts       # Health checks
└── trial/
    └── container-service.ts  # High-level trial container ops
```

## Acceptance Criteria

- [ ] Can create container from trial-base image
- [ ] Repo cloned into container with GitHub token
- [ ] Claude token available in container env
- [ ] Can execute commands in container
- [ ] Command output streams to caller
- [ ] Container destroyed after trial
- [ ] 30-minute timeout auto-destroys container
- [ ] Resource limits enforced (2GB RAM, 1 CPU)
- [ ] Health endpoint reports container status

## Security Considerations

1. **No network access to host services** - Containers use bridge networking
2. **Minimal capabilities** - Only CHOWN, SETUID, SETGID for git
3. **No privilege escalation** - `no-new-privileges` security option
4. **Resource limits** - Memory and CPU caps
5. **Auto-cleanup** - Timeout and explicit destruction
6. **Token isolation** - Tokens passed via env, not persisted

## Testing

```bash
# Manual testing
docker run --rm -it trial-base:latest bash

# Test container creation
curl http://localhost:3000/api/admin/health

# Test with actual trial (requires full MVP)
```

---

## Dependencies

**Depends on**: Issues 1-9 (MVP complete)
**Blocks**: Issue 12 (Code battles need containers)
