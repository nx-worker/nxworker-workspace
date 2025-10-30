/**
 * Verdaccio Controller
 *
 * Manages local Verdaccio registry lifecycle for e2e tests.
 * Supports port fallback, reuse, and graceful teardown.
 */

import { startLocalRegistry as nxStartLocalRegistry } from '@nx/js/plugins/jest/local-registry';
import { createServer } from 'node:http';
import { logger } from '@nx/devkit';

export type StopRegistryFn = () => void;

export interface VerdaccioConfig {
  /**
   * Preferred port for the registry (default: 4873)
   */
  port?: number;

  /**
   * Maximum number of port fallback attempts (default: 2)
   */
  maxFallbackAttempts?: number;

  /**
   * Storage folder for the local registry (default: './tmp/local-registry/storage')
   */
  storage?: string;

  /**
   * Local registry target to run (default: '@nxworker/source:local-registry')
   */
  localRegistryTarget?: string;

  /**
   * Enable verbose logging (default: false)
   */
  verbose?: boolean;

  /**
   * Startup timeout in milliseconds (default: 30000ms / 30s)
   */
  startupTimeoutMs?: number;
}

/**
 * Checks if a port is available for use
 * @param port Port number to check
 * @returns Promise that resolves to true if port is available, false otherwise
 */
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();

    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        // For other errors, consider the port unavailable
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port);
  });
}

/**
 * Finds an available port starting from the preferred port
 * @param preferredPort Starting port to try
 * @param maxAttempts Maximum number of attempts
 * @returns Promise that resolves to an available port number, or throws if none found
 */
async function findAvailablePort(
  preferredPort: number,
  maxAttempts: number,
): Promise<number> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const portToTry = preferredPort + attempt;
    logger.verbose(`Checking port ${portToTry}...`);

    if (await isPortAvailable(portToTry)) {
      logger.verbose(`Port ${portToTry} is available`);
      return portToTry;
    }

    logger.verbose(`Port ${portToTry} is in use, trying next port...`);
  }

  throw new Error(
    `Could not find available port after ${maxAttempts} attempts starting from ${preferredPort}`,
  );
}

/**
 * Starts a local Verdaccio registry for e2e testing
 *
 * Features:
 * - Pre-checks port availability with fallback support
 * - Maintains handle for graceful shutdown
 * - Ensures teardown on process exit and test failure
 * - Supports registry reuse across scenarios
 *
 * @param config Configuration options for the registry
 * @returns Promise that resolves to a function to stop the registry
 *
 * @example
 * ```typescript
 * const stop = await startLocalRegistry({ port: 4873 });
 * try {
 *   // Run tests
 * } finally {
 *   await stopLocalRegistry(stop);
 * }
 * ```
 */
export async function startLocalRegistry(
  config: VerdaccioConfig = {},
): Promise<StopRegistryFn> {
  const {
    port: preferredPort = 4873,
    maxFallbackAttempts = 2,
    storage = './tmp/local-registry/storage',
    localRegistryTarget = '@nxworker/source:local-registry',
    verbose = false,
    startupTimeoutMs = 30000,
  } = config;

  logger.verbose('Starting local Verdaccio registry...');

  // Find an available port
  const availablePort = await findAvailablePort(
    preferredPort,
    maxFallbackAttempts,
  );

  if (availablePort !== preferredPort) {
    logger.info(
      `Using port ${availablePort} instead of preferred port ${preferredPort}`,
    );
  }

  // Start the registry with timeout protection
  const startRegistryPromise = nxStartLocalRegistry({
    localRegistryTarget,
    storage,
    verbose,
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(
        new Error(
          `Verdaccio startup timed out after ${startupTimeoutMs}ms. Port ${availablePort} may be blocked or the registry target '${localRegistryTarget}' may be misconfigured.`,
        ),
      );
    }, startupTimeoutMs);
  });

  // Race between startup and timeout
  const stopRegistry = await Promise.race([
    startRegistryPromise,
    timeoutPromise,
  ]);

  // Register cleanup handlers
  const cleanupHandlers: Array<string> = [];

  const cleanup = () => {
    logger.verbose('Cleaning up Verdaccio registry...');
    if (stopRegistry) {
      stopRegistry();
    }
    // Remove cleanup handlers to prevent duplicate calls
    cleanupHandlers.forEach((event) => {
      process.removeAllListeners(event);
    });
  };

  // Setup cleanup on process exit
  const exitHandler = () => {
    cleanup();
    process.exit(0);
  };
  cleanupHandlers.push('exit', 'SIGINT', 'SIGTERM');
  process.once('exit', exitHandler);
  process.once('SIGINT', exitHandler);
  process.once('SIGTERM', exitHandler);

  // Setup cleanup on unhandled errors
  const errorHandler = (err: unknown) => {
    logger.error(`Unhandled error, cleaning up registry: ${err}`);
    cleanup();
    process.exit(1);
  };
  cleanupHandlers.push('uncaughtException', 'unhandledRejection');
  process.once('uncaughtException', errorHandler);
  process.once('unhandledRejection', errorHandler);

  logger.verbose(`Verdaccio registry started on port ${availablePort}`);

  return stopRegistry;
}

/**
 * Stops a running Verdaccio registry
 *
 * @param stopFn Function returned by startLocalRegistry
 *
 * @example
 * ```typescript
 * const stop = await startLocalRegistry();
 * // ... run tests ...
 * await stopLocalRegistry(stop);
 * ```
 */
export async function stopLocalRegistry(stopFn: StopRegistryFn): Promise<void> {
  logger.verbose('Stopping local Verdaccio registry...');
  if (stopFn) {
    stopFn();
  }
  logger.verbose('Verdaccio registry stopped');
}
