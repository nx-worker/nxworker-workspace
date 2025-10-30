import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { logger } from '@nx/devkit';

/**
 * Options for cleaning up a workspace
 */
export interface CleanupWorkspaceOptions {
  /**
   * Absolute path to the workspace directory
   */
  workspacePath: string;
  /**
   * Maximum retry attempts for removing directories (default: 5)
   * Useful on Windows where file locks can cause EBUSY errors
   */
  maxRetries?: number;
  /**
   * Delay in milliseconds between retry attempts (default: 200)
   */
  retryDelay?: number;
}

/**
 * Options for clearing Nx cache
 */
export interface ClearNxCacheOptions {
  /**
   * Absolute path to the workspace directory
   */
  workspacePath: string;
  /**
   * Whether to stop the Nx daemon (default: true)
   */
  stopDaemon?: boolean;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Clean up a temporary workspace directory
 *
 * This function removes the workspace directory with retry logic to handle
 * Windows file locking issues (EBUSY errors).
 *
 * @param options - Configuration options
 *
 * @example
 * ```ts
 * await cleanupWorkspace({
 *   workspacePath: '/tmp/test-workspace-abc123'
 * });
 * ```
 */
export async function cleanupWorkspace(
  options: CleanupWorkspaceOptions,
): Promise<void> {
  const { workspacePath, maxRetries = 5, retryDelay = 200 } = options;

  logger.verbose(`Cleaning up workspace: ${workspacePath}`);

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      rmSync(workspacePath, { recursive: true, force: true });
      logger.verbose(`Workspace cleaned up successfully`);
      return;
    } catch (err) {
      lastError = err as Error;
      const isRetriableError =
        err &&
        typeof err === 'object' &&
        'code' in err &&
        ((err.code as string) === 'EBUSY' ||
          (err.code as string) === 'ENOTEMPTY');

      if (isRetriableError && attempt < maxRetries) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.verbose(
          `Failed to remove workspace (attempt ${attempt}/${maxRetries}), retrying after ${retryDelay}ms: ${errorMessage}`,
        );
        await sleep(retryDelay);
      } else if (!isRetriableError) {
        throw err;
      }
    }
  }

  // If we exhausted all retries, throw the last error
  if (lastError) {
    throw new Error(
      `Failed to clean up workspace after ${maxRetries} attempts: ${lastError.message}`,
    );
  }
}

/**
 * Clear the Nx cache for a workspace
 *
 * This function clears the .nx/cache directory and optionally stops the Nx daemon.
 * Useful when you need to force Nx to rebuild the project graph.
 *
 * @param options - Configuration options
 *
 * @example
 * ```ts
 * await clearNxCache({
 *   workspacePath: '/tmp/test-workspace-abc123',
 *   stopDaemon: true
 * });
 * ```
 */
export async function clearNxCache(
  options: ClearNxCacheOptions,
): Promise<void> {
  const { workspacePath, stopDaemon = true } = options;

  logger.verbose(`Clearing Nx cache for workspace: ${workspacePath}`);

  if (stopDaemon) {
    try {
      logger.verbose('Stopping Nx daemon');
      execSync('npx nx reset', {
        cwd: workspacePath,
        stdio: 'pipe',
      });
      logger.verbose('Nx daemon stopped and cache cleared');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.verbose(`Warning: Failed to stop Nx daemon: ${errorMessage}`);
      // Continue to manual cache cleanup even if daemon stop fails
    }
  }

  // Manually remove .nx/cache directory as fallback
  const nxCachePath = join(workspacePath, '.nx', 'cache');
  try {
    rmSync(nxCachePath, { recursive: true, force: true });
    logger.verbose(`Nx cache directory removed: ${nxCachePath}`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.verbose(
      `Warning: Failed to remove cache directory: ${errorMessage}`,
    );
  }
}

/**
 * Clean up multiple workspaces in parallel
 *
 * @param workspacePaths - Array of workspace paths to clean up
 * @param options - Cleanup options to apply to all workspaces
 *
 * @example
 * ```ts
 * await cleanupWorkspaces([
 *   '/tmp/workspace1',
 *   '/tmp/workspace2',
 *   '/tmp/workspace3'
 * ]);
 * ```
 */
export async function cleanupWorkspaces(
  workspacePaths: string[],
  options: Omit<CleanupWorkspaceOptions, 'workspacePath'> = {},
): Promise<void> {
  logger.verbose(`Cleaning up ${workspacePaths.length} workspaces`);

  await Promise.all(
    workspacePaths.map((workspacePath) =>
      cleanupWorkspace({ workspacePath, ...options }),
    ),
  );

  logger.verbose('All workspaces cleaned up successfully');
}
