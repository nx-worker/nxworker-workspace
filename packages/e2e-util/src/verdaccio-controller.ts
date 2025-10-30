import { startLocalRegistry } from '@nx/js/plugins/jest/local-registry';
import { releasePublish, releaseVersion } from 'nx/release';
import { logger } from '@nx/devkit';
import * as net from 'node:net';

/**
 * Global handle for stopping the local Verdaccio registry
 */
let registryStopFn: (() => void) | undefined;

/**
 * Port on which the registry is running
 */
let registryPort: number | undefined;

/**
 * Options for starting the local Verdaccio registry
 */
export interface StartLocalRegistryOptions {
  /**
   * Preferred port for the registry (default: 4873)
   */
  portPreferred?: number;
  /**
   * Maximum number of port fallback attempts if preferred port is unavailable (default: 2)
   */
  maxFallbackAttempts?: number;
  /**
   * Local registry target to run
   */
  localRegistryTarget?: string;
  /**
   * Storage folder for the local registry
   */
  storage?: string;
  /**
   * Whether to enable verbose logging
   */
  verbose?: boolean;
}

/**
 * Result of starting the local registry
 */
export interface RegistryInfo {
  /**
   * Port on which the registry is running
   */
  port: number;
  /**
   * URL of the registry
   */
  url: string;
  /**
   * Function to stop the registry
   */
  stop: () => void;
}

/**
 * Check if a port is available
 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err: NodeJS.ErrnoException) => {
      // EADDRINUSE means port is already in use
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        // For other errors, also consider port unavailable
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
 * Find an available port starting from the preferred port
 */
async function findAvailablePort(
  preferredPort: number,
  maxAttempts: number,
): Promise<number> {
  for (let i = 0; i <= maxAttempts; i++) {
    const port = preferredPort + i;
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }
    logger.verbose(
      `Port ${port} is unavailable, trying next port (attempt ${i + 1}/${maxAttempts + 1})`,
    );
  }
  throw new Error(
    `Could not find available port after ${maxAttempts + 1} attempts starting from ${preferredPort}`,
  );
}

/**
 * Start the local Verdaccio registry with port fallback logic
 *
 * This function:
 * - Checks if the preferred port is available
 * - Falls back to alternative ports if necessary
 * - Publishes the workspace package to the registry
 * - Registers cleanup handlers for graceful shutdown
 *
 * @param options - Configuration options
 * @returns Registry information including port and stop function
 *
 * @example
 * ```ts
 * const registry = await startRegistry({ portPreferred: 4873 });
 * console.log(`Registry running on ${registry.url}`);
 * // ... use registry ...
 * registry.stop();
 * ```
 */
export async function startRegistry(
  options: StartLocalRegistryOptions = {},
): Promise<RegistryInfo> {
  const {
    portPreferred = 4873,
    maxFallbackAttempts = 2,
    localRegistryTarget = '@nxworker/source:local-registry',
    storage = './tmp/local-registry/storage',
    verbose = false,
  } = options;

  // Check if registry is already running
  if (registryStopFn) {
    logger.verbose(
      'Local registry is already running, reusing existing instance',
    );
    if (!registryPort) {
      throw new Error('Registry is running but port is unknown');
    }
    return {
      port: registryPort,
      url: `http://localhost:${registryPort}`,
      stop: registryStopFn,
    };
  }

  // Find an available port
  const port = await findAvailablePort(portPreferred, maxFallbackAttempts);
  logger.verbose(`Starting local registry on port ${port}`);

  // Start the registry
  registryStopFn = await startLocalRegistry({
    localRegistryTarget,
    storage,
    verbose,
  });

  registryPort = port;

  // Register cleanup handlers
  const cleanup = () => {
    if (registryStopFn) {
      logger.verbose('Stopping local registry');
      registryStopFn();
      registryStopFn = undefined;
      registryPort = undefined;
    }
  };

  // Ensure cleanup on process exit
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('uncaughtException', (err) => {
    logger.verbose(`Uncaught exception: ${err.message}`);
    cleanup();
    process.exit(1);
  });

  // Publish the workspace package to the registry
  logger.verbose('Publishing workspace package to local registry');

  await releaseVersion({
    specifier: '0.0.0-e2e',
    stageChanges: false,
    gitCommit: false,
    gitTag: false,
    firstRelease: true,
    generatorOptionsOverrides: {
      skipLockFileUpdate: true,
    },
  });

  await releasePublish({
    tag: 'e2e',
    firstRelease: true,
  });

  logger.verbose('Local registry started and package published successfully');

  return {
    port,
    url: `http://localhost:${port}`,
    stop: cleanup,
  };
}

/**
 * Stop the local Verdaccio registry
 *
 * This function performs a graceful shutdown of the registry if it is running.
 *
 * @example
 * ```ts
 * await startRegistry();
 * // ... use registry ...
 * stopRegistry();
 * ```
 */
export function stopRegistry(): void {
  if (registryStopFn) {
    logger.verbose('Stopping local registry');
    registryStopFn();
    registryStopFn = undefined;
    registryPort = undefined;
  } else {
    logger.verbose('Local registry is not running, nothing to stop');
  }
}

/**
 * Check if the registry is currently running
 *
 * @returns True if the registry is running, false otherwise
 */
export function isRegistryRunning(): boolean {
  return !!registryStopFn;
}

/**
 * Get the current registry port
 *
 * @returns The port number if the registry is running, undefined otherwise
 */
export function getRegistryPort(): number | undefined {
  return registryPort;
}

/**
 * Get the current registry URL
 *
 * @returns The registry URL if running, undefined otherwise
 */
export function getRegistryUrl(): string | undefined {
  return registryPort ? `http://localhost:${registryPort}` : undefined;
}
