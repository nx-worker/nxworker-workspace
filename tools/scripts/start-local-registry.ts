/**
 * This script starts a local registry for e2e testing purposes.
 * It is meant to be called in jest's globalSetup.
 */
import { startLocalRegistry } from '@nx/js/plugins/jest/local-registry';
import { execFileSync } from 'node:child_process';
import { releasePublish, releaseVersion } from 'nx/release';

/**
 * Wraps a promise with a timeout to prevent indefinite hangs
 *
 * @param promise Promise to execute
 * @param timeoutMs Timeout in milliseconds
 * @param operationName Name of operation for error message
 * @returns Promise that rejects if timeout is exceeded
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `Operation "${operationName}" timed out after ${timeoutMs}ms`,
            ),
          ),
        timeoutMs,
      ),
    ),
  ]);
}

export default async () => {
  // local registry target to run
  const localRegistryTarget = '@nxworker/source:local-registry';
  // storage folder for the local registry
  const storage = './tmp/local-registry/storage';

  global.stopLocalRegistry = await withTimeout(
    startLocalRegistry({
      localRegistryTarget,
      storage,
      verbose: false,
    }),
    120000, // 2 minute timeout
    'start local registry',
  );

  await withTimeout(
    releaseVersion({
      specifier: '0.0.0-e2e',
      stageChanges: false,
      gitCommit: false,
      gitTag: false,
      firstRelease: true,
      generatorOptionsOverrides: {
        skipLockFileUpdate: true,
      },
    }),
    120000, // 2 minute timeout
    'release version',
  );

  await withTimeout(
    releasePublish({
      tag: 'e2e',
      firstRelease: true,
    }),
    120000, // 2 minute timeout
    'release publish',
  );
};
