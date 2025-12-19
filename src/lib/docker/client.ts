import Docker from "dockerode";

let dockerClient: Docker | null = null;

// Podman socket on prod, Docker socket locally
const CONTAINER_SOCKET = process.env.CONTAINER_SOCKET || "/var/run/docker.sock";

/**
 * Get the Docker/Podman client singleton instance
 */
export function getDockerClient(): Docker {
  if (!dockerClient) {
    dockerClient = new Docker({ socketPath: CONTAINER_SOCKET });
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
