/**
 * Trial Container Service
 *
 * Manages Docker containers for trials.
 */

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
  const dockerAvailable = await isDockerAvailable();
  if (!dockerAvailable) {
    throw new Error("Docker is not available");
  }

  const existing = trialContainers.get(trialId);
  if (existing) {
    return existing;
  }

  const container = await createTrialContainer({
    trialId,
    ...config,
  });

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
 * Get all active trial containers (for health monitoring)
 */
export function getAllTrialContainers(): Map<string, TrialContainer> {
  return new Map(trialContainers);
}
