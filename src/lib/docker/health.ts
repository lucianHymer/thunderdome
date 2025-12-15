import { getDockerClient } from "./client";

export interface DockerHealthInfo {
  available: boolean;
  containerCount: number;
  memoryUsage: number;
  error?: string;
}

/**
 * Check Docker health and return container statistics
 */
export async function checkDockerHealth(): Promise<DockerHealthInfo> {
  try {
    const docker = getDockerClient();

    // Ping Docker to check availability
    await docker.ping();

    // Get all containers (running and stopped)
    const containers = await docker.listContainers({ all: true });

    // Calculate total memory usage from running containers
    let totalMemoryUsage = 0;
    const runningContainers = containers.filter((c) => c.State === "running");

    for (const containerInfo of runningContainers) {
      try {
        const container = docker.getContainer(containerInfo.Id);
        const stats = await container.stats({ stream: false });

        if (stats && typeof stats === "object" && "memory_stats" in stats) {
          const memoryStats = stats.memory_stats as { usage?: number };
          totalMemoryUsage += memoryStats.usage || 0;
        }
      } catch (_error) {}
    }

    return {
      available: true,
      containerCount: containers.length,
      memoryUsage: totalMemoryUsage,
    };
  } catch (error) {
    return {
      available: false,
      containerCount: 0,
      memoryUsage: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
