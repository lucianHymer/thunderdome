import {
  createTrialContainer,
  TrialContainer,
  TrialContainerConfig,
} from '../docker/container';
import { isDockerAvailable } from '../docker/client';

// In-memory store of active trial containers
const trialContainers = new Map<string, TrialContainer>();

/**
 * Start a container for a trial
 */
export async function startTrialContainer(
  trialId: string,
  config?: Partial<TrialContainerConfig>
): Promise<TrialContainer> {
  // Check if Docker is available
  const dockerAvailable = await isDockerAvailable();
  if (!dockerAvailable) {
    throw new Error('Docker is not available');
  }

  // Check if container already exists for this trial
  const existing = trialContainers.get(trialId);
  if (existing) {
    console.log(`Container already exists for trial ${trialId}`);
    return existing;
  }

  // Create new container
  const container = await createTrialContainer({
    trialId,
    ...config,
  });

  // Store in registry
  trialContainers.set(trialId, container);

  console.log(`Started container ${container.id} for trial ${trialId}`);

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
    console.log(`No container found for trial ${trialId}`);
    return;
  }

  await container.destroy();
  trialContainers.delete(trialId);

  console.log(`Destroyed container for trial ${trialId}`);
}

/**
 * Run setup commands in a trial container
 */
export async function runSetupInContainer(
  trialId: string,
  commands: string[]
): Promise<void> {
  const container = getTrialContainer(trialId);
  if (!container) {
    throw new Error(`No container found for trial ${trialId}`);
  }

  for (const command of commands) {
    console.log(`Running setup command in trial ${trialId}: ${command}`);

    const result = await container.exec(['sh', '-c', command]);

    if (result.exitCode !== 0) {
      throw new Error(
        `Setup command failed with exit code ${result.exitCode}: ${result.stderr}`
      );
    }

    if (result.stdout) {
      console.log(`Setup output: ${result.stdout}`);
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
  console.log(`Cleaning up ${trialContainers.size} trial containers...`);

  const cleanupPromises = Array.from(trialContainers.keys()).map((trialId) =>
    destroyTrialContainer(trialId)
  );

  await Promise.allSettled(cleanupPromises);

  console.log('All trial containers cleaned up');
}
