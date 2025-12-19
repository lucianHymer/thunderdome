/**
 * Trial Container Management
 *
 * Creates and manages Docker containers for code battle trials.
 * Each container runs an agent server that handles Claude sessions.
 */

import type Docker from "dockerode";
import { type AgentServerClient, createAgentClient } from "./agent-client";
import { getDockerClient } from "./client";

export interface TrialContainerConfig {
  trialId: string;
  image?: string;
  memoryLimit?: number;
  cpuLimit?: number;
  timeout?: number;
}

export interface TrialContainer {
  id: string;
  trialId: string;
  container: Docker.Container;
  createdAt: Date;
  timeoutHandle: NodeJS.Timeout;

  getAgentClient(): AgentServerClient;
  getAgentServerUrl(): string;
  waitForAgentServer(maxWaitMs?: number): Promise<boolean>;
  exec(cmd: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  destroy(): Promise<void>;
}

const CONTAINER_TIMEOUT = 30 * 60 * 1000;
const DEFAULT_MEMORY_LIMIT = 2 * 1024 * 1024 * 1024;
const DEFAULT_CPU_LIMIT = 1;
const DEFAULT_IMAGE = "thunderdome/agent-server:latest";
const AGENT_SERVER_PORT = 3000;

export async function createTrialContainer(config: TrialContainerConfig): Promise<TrialContainer> {
  const docker = getDockerClient();

  const {
    trialId,
    image = DEFAULT_IMAGE,
    memoryLimit = DEFAULT_MEMORY_LIMIT,
    cpuLimit = DEFAULT_CPU_LIMIT,
    timeout = CONTAINER_TIMEOUT,
  } = config;

  try {
    await docker.pull(image);
  } catch (_error) {}

  const container = await docker.createContainer({
    Image: image,
    name: `trial-${trialId}`,
    Tty: false,
    AttachStdin: false,
    AttachStdout: true,
    AttachStderr: true,
    OpenStdin: false,
    WorkingDir: "/workspace",
    ExposedPorts: {
      [`${AGENT_SERVER_PORT}/tcp`]: {},
    },
    HostConfig: {
      // Resource limits disabled - cgroup controllers not available on Hetzner VPS
      // Memory: memoryLimit,
      // MemorySwap: -1,
      // NanoCpus: cpuLimit * 1e9,
      SecurityOpt: ["no-new-privileges"],
      CapDrop: ["ALL"],
      CapAdd: ["CHOWN", "DAC_OVERRIDE", "FOWNER", "SETGID", "SETUID"],
      ReadonlyRootfs: false,
      AutoRemove: false,
      PublishAllPorts: true,
    },
    Labels: {
      "thunderdome.trial-id": trialId,
      "thunderdome.created-at": new Date().toISOString(),
    },
  });

  await container.start();

  const containerInfo = await container.inspect();
  const portBindings = containerInfo.NetworkSettings.Ports;
  const portMapping = portBindings[`${AGENT_SERVER_PORT}/tcp`];

  if (!portMapping || portMapping.length === 0) {
    throw new Error("Agent server port not mapped");
  }

  const hostPort = parseInt(portMapping[0].HostPort, 10);
  const hostIp = portMapping[0].HostIp || "127.0.0.1";
  const agentServerUrl = `http://${hostIp === "0.0.0.0" ? "127.0.0.1" : hostIp}:${hostPort}`;

  const agentClient = createAgentClient(hostIp === "0.0.0.0" ? "127.0.0.1" : hostIp, hostPort);

  let isDestroyed = false;

  const timeoutHandle = setTimeout(async () => {
    if (!isDestroyed) {
      await destroyContainer(container);
      isDestroyed = true;
    }
  }, timeout);

  const destroyContainer = async (cont: Docker.Container) => {
    try {
      clearTimeout(timeoutHandle);
      await cont.stop({ t: 10 });
    } catch (_error) {}
    try {
      await cont.remove({ force: true });
    } catch (_error) {}
  };

  return {
    id: container.id as string,
    trialId,
    container,
    createdAt: new Date(),
    timeoutHandle,

    getAgentClient(): AgentServerClient {
      return agentClient;
    },

    getAgentServerUrl(): string {
      return agentServerUrl;
    },

    async waitForAgentServer(maxWaitMs: number = 30000): Promise<boolean> {
      return agentClient.waitForHealthy(maxWaitMs);
    },

    async exec(cmd: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
      const exec = await container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ hijack: true, stdin: false });

      let stdout = "";
      let stderr = "";

      return new Promise((resolve, reject) => {
        container.modem.demuxStream(
          stream,
          {
            write: (chunk: Buffer) => {
              stdout += chunk.toString();
            },
          } as NodeJS.WritableStream,
          {
            write: (chunk: Buffer) => {
              stderr += chunk.toString();
            },
          } as NodeJS.WritableStream,
        );

        stream.on("end", async () => {
          try {
            const inspectResult = await exec.inspect();
            resolve({
              stdout,
              stderr,
              exitCode: inspectResult.ExitCode || 0,
            });
          } catch (error) {
            reject(error);
          }
        });

        stream.on("error", reject);
      });
    },

    async destroy(): Promise<void> {
      if (!isDestroyed) {
        isDestroyed = true;
        await destroyContainer(container);
      }
    },
  };
}
