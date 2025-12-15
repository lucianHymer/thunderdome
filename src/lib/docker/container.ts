import type { Readable } from "node:stream";
import type Docker from "dockerode";
import { getDockerClient } from "./client";

/**
 * Configuration for a trial container
 */
export interface TrialContainerConfig {
  trialId: string;
  image?: string;
  memoryLimit?: number; // in bytes
  cpuLimit?: number; // CPU count
  timeout?: number; // in milliseconds
}

/**
 * Trial container instance
 */
export interface TrialContainer {
  id: string;
  trialId: string;
  container: Docker.Container;
  createdAt: Date;
  timeoutHandle: NodeJS.Timeout;

  /**
   * Execute a command in the container
   */
  exec(cmd: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }>;

  /**
   * Execute a command and stream the output
   */
  execStream(cmd: string[]): Promise<Readable>;

  /**
   * Copy a file into the container
   */
  copyFileIn(localPath: string, containerPath: string): Promise<void>;

  /**
   * Copy a file from the container
   */
  copyFileOut(containerPath: string, localPath: string): Promise<void>;

  /**
   * Destroy the container
   */
  destroy(): Promise<void>;
}

const CONTAINER_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const DEFAULT_MEMORY_LIMIT = 2 * 1024 * 1024 * 1024; // 2GB
const DEFAULT_CPU_LIMIT = 1;
const DEFAULT_IMAGE = "node:20-alpine";

/**
 * Create a trial container with resource limits and security settings
 */
export async function createTrialContainer(config: TrialContainerConfig): Promise<TrialContainer> {
  const docker = getDockerClient();

  const {
    trialId,
    image = DEFAULT_IMAGE,
    memoryLimit = DEFAULT_MEMORY_LIMIT,
    cpuLimit = DEFAULT_CPU_LIMIT,
    timeout = CONTAINER_TIMEOUT,
  } = config;

  // Pull image if not present
  try {
    await docker.pull(image);
  } catch (_error) {}

  // Create container with security and resource constraints
  const container = await docker.createContainer({
    Image: image,
    name: `trial-${trialId}`,
    Tty: false,
    AttachStdin: false,
    AttachStdout: true,
    AttachStderr: true,
    OpenStdin: false,
    WorkingDir: "/workspace",
    HostConfig: {
      Memory: memoryLimit,
      MemorySwap: memoryLimit, // Prevent swap
      NanoCpus: cpuLimit * 1e9,
      SecurityOpt: ["no-new-privileges"],
      CapDrop: ["ALL"],
      CapAdd: ["CHOWN", "DAC_OVERRIDE", "FOWNER", "SETGID", "SETUID"], // Minimal capabilities
      ReadonlyRootfs: false, // Need to write to workspace
      AutoRemove: false, // We'll handle removal manually
    },
    Labels: {
      "thunderdome.trial-id": trialId,
      "thunderdome.created-at": new Date().toISOString(),
    },
  });

  await container.start();

  let isDestroyed = false;

  // Auto-destroy after timeout
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
        // Demux the stream (Docker multiplexes stdout and stderr)
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

    async execStream(cmd: string[]): Promise<Readable> {
      const exec = await container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ hijack: true, stdin: false });
      return stream as unknown as Readable;
    },

    async copyFileIn(localPath: string, containerPath: string): Promise<void> {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const tar = await import("tar-stream");

      const pack = tar.pack();
      const fileName = path.basename(containerPath);
      const fileContent = fs.readFileSync(localPath);

      pack.entry({ name: fileName }, fileContent, (err) => {
        if (err) throw err;
        pack.finalize();
      });

      const containerDir = path.dirname(containerPath);
      await container.putArchive(pack, { path: containerDir });
    },

    async copyFileOut(containerPath: string, localPath: string): Promise<void> {
      const fs = await import("node:fs");
      const _path = await import("node:path");
      const tar = await import("tar-stream");

      const stream = await container.getArchive({ path: containerPath });
      const extract = tar.extract();

      return new Promise((resolve, reject) => {
        extract.on("entry", (_header, entryStream, next) => {
          const chunks: Buffer[] = [];

          entryStream.on("data", (chunk: Buffer) => {
            chunks.push(chunk);
          });

          entryStream.on("end", () => {
            fs.writeFileSync(localPath, Buffer.concat(chunks));
            next();
          });

          entryStream.on("error", reject);
          entryStream.resume();
        });

        extract.on("finish", resolve);
        extract.on("error", reject);

        stream.pipe(extract);
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
