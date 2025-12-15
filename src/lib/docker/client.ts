import Docker from "dockerode";

let dockerClient: Docker | null = null;

/**
 * Get the Docker client singleton instance
 */
export function getDockerClient(): Docker {
  if (!dockerClient) {
    dockerClient = new Docker();
  }
  return dockerClient;
}

/**
 * Check if Docker daemon is available
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    const docker = getDockerClient();
    await docker.ping();
    return true;
  } catch (_error) {
    return false;
  }
}
