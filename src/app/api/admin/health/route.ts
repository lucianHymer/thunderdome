import { NextRequest, NextResponse } from 'next/server';
import { checkDockerHealth } from '@/lib/docker/health';
import { getAllTrialContainers } from '@/lib/trial/container-service';

/**
 * GET /api/admin/health
 * Health check endpoint for Docker and trial containers
 */
export async function GET(request: NextRequest) {
  try {
    const dockerHealth = await checkDockerHealth();
    const trialContainers = getAllTrialContainers();

    const trialContainerInfo = Array.from(trialContainers.entries()).map(([trialId, container]) => ({
      trialId,
      containerId: container.id,
      createdAt: container.createdAt.toISOString(),
    }));

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      docker: {
        available: dockerHealth.available,
        containerCount: dockerHealth.containerCount,
        memoryUsage: dockerHealth.memoryUsage,
        memoryUsageMB: Math.round(dockerHealth.memoryUsage / 1024 / 1024),
        error: dockerHealth.error,
      },
      trials: {
        activeCount: trialContainers.size,
        containers: trialContainerInfo,
      },
    });
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
