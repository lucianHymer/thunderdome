import { isDockerAvailable } from "../docker/client";
import {
  createTrialContainer,
  type TrialContainer,
  type TrialContainerConfig,
} from "../docker/container";

// In-memory store of active trial containers
const trialContainers = new Map<string, TrialContainer>();

/**
 * Start a container for a trial
 */
export async function startTrialContainer(
  trialId: string,
  config?: Partial<TrialContainerConfig>,
): Promise<TrialContainer> {
  // Check if Docker is available
  const dockerAvailable = await isDockerAvailable();
  if (!dockerAvailable) {
    throw new Error("Docker is not available");
  }

  // Check if container already exists for this trial
  const existing = trialContainers.get(trialId);
  if (existing) {
    return existing;
  }

  // Create new container
  const container = await createTrialContainer({
    trialId,
    ...config,
  });

  // Store in registry
  trialContainers.set(trialId, container);

  return container;
}

/**
 * Get an existing trial container
 */
export function getTrialContainer(trialId: string): TrialContainer | undefined {
  return trialContainers.get(trialId);
}

/**
 * Destroy a trial container
 */
export async function destroyTrialContainer(trialId: string): Promise<void> {
  const container = trialContainers.get(trialId);
  if (!container) {
    return;
  }

  await container.destroy();
  trialContainers.delete(trialId);
}

/**
 * Run setup commands in a trial container
 */
export async function runSetupInContainer(trialId: string, commands: string[]): Promise<void> {
  const container = getTrialContainer(trialId);
  if (!container) {
    throw new Error(`No container found for trial ${trialId}`);
  }

  for (const command of commands) {
    const result = await container.exec(["sh", "-c", command]);

    if (result.exitCode !== 0) {
      throw new Error(`Setup command failed with exit code ${result.exitCode}: ${result.stderr}`);
    }

    if (result.stdout) {
    }
  }
}

/**
 * Get all active trial containers
 */
export function getAllTrialContainers(): Map<string, TrialContainer> {
  return new Map(trialContainers);
}

/**
 * Cleanup all trial containers (useful for graceful shutdown)
 */
export async function cleanupAllContainers(): Promise<void> {
  const cleanupPromises = Array.from(trialContainers.keys()).map((trialId) =>
    destroyTrialContainer(trialId),
  );

  await Promise.allSettled(cleanupPromises);
}
