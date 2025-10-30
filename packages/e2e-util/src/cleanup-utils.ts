/**
 * Cleanup Utilities
 *
 * Manages temporary workspace directories and Nx cache cleanup.
 */

import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path/posix';
import { logger } from '@nx/devkit';

/**
 * Helper function to sleep for a specified duration
 * @param ms Milliseconds to sleep
 * @returns Promise that resolves after the specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Removes a temporary workspace directory with retry logic for Windows EBUSY errors
 *
 * @param workspacePath Full path to the workspace directory
 * @param maxAttempts Maximum number of retry attempts (default: 5)
 * @param delayMs Delay between retries in milliseconds (default: 200)
 *
 * @example
 * ```typescript
 * const workspace = await createWorkspace({ libs: 2 });
 * // ... run tests ...
 * await cleanupWorkspace(workspace.path);
 * ```
 */
export async function cleanupWorkspace(
  workspacePath: string,
  maxAttempts = 5,
  delayMs = 200,
): Promise<void> {
  logger.verbose(`Cleaning up workspace: ${workspacePath}`);

  if (!existsSync(workspacePath)) {
    logger.verbose(`Workspace directory does not exist, skipping cleanup`);
    return;
  }

  let attempts = 0;
  let lastError: Error | null = null;

  while (attempts < maxAttempts) {
    try {
      rmSync(workspacePath, { recursive: true, force: true });
      logger.verbose(`Workspace cleaned up successfully`);
      return;
    } catch (err) {
      lastError = err as Error;

      // On Windows, files can be temporarily locked (EBUSY, ENOTEMPTY)
      // Retry with exponential backoff
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err.code === 'EBUSY' || err.code === 'ENOTEMPTY')
      ) {
        attempts++;
        logger.verbose(
          `Failed to cleanup (${err.code}), attempt ${attempts}/${maxAttempts}, retrying after ${delayMs}ms...`,
        );
        await sleep(delayMs);
        // Exponential backoff
        delayMs *= 2;
      } else {
        // For other errors, throw immediately
        throw err;
      }
    }
  }

  // If we've exhausted all attempts, throw the last error
  throw new Error(
    `Failed to cleanup workspace after ${maxAttempts} attempts: ${lastError?.message}`,
  );
}

/**
 * Clears the Nx cache to force a graph rebuild
 *
 * This is useful between scenarios when you need to ensure that Nx
 * recomputes the project graph without any cached state.
 *
 * Note: This clears the global Nx cache, not just the workspace cache.
 * Use sparingly, as it impacts all Nx operations system-wide.
 *
 * @example
 * ```typescript
 * await clearNxCache();
 * // Run tests that need a fresh project graph
 * ```
 */
export async function clearNxCache(): Promise<void> {
  logger.verbose('Clearing Nx cache...');

  const nxCacheDir = join(process.cwd(), '.nx', 'cache');

  if (!existsSync(nxCacheDir)) {
    logger.verbose('Nx cache directory does not exist, skipping');
    return;
  }

  try {
    rmSync(nxCacheDir, { recursive: true, force: true });
    logger.verbose('Nx cache cleared successfully');
  } catch (err) {
    logger.error(`Failed to clear Nx cache: ${err}`);
    throw err;
  }
}
