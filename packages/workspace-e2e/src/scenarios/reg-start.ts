/**
 * REG-START Scenario
 *
 * Verifies that Verdaccio registry is running and the plugin package
 * is available for installation.
 *
 * Parent Issue: #319 - Adopt new end-to-end test plan
 * This Issue: #332 - Implement infrastructure scenarios
 */

import { logger } from '@nx/devkit';
import { get } from 'node:http';
import type { InfrastructureScenarioContext } from './types';

/**
 * REG-START: Start Verdaccio and confirm package availability
 *
 * Validates:
 * 1. Registry responds to health check (/-/ping endpoint)
 * 2. Plugin package is discoverable in registry
 *
 * @param context - Infrastructure scenario context with registry configuration
 * @throws Error if registry is unreachable or package is not available
 */
export async function run(
  context: InfrastructureScenarioContext,
): Promise<void> {
  const { registryUrl } = context;

  logger.verbose('[REG-START] Checking registry connectivity...');

  // Verify registry health endpoint
  const pingUrl = `${registryUrl}/-/ping`;
  await httpGet(pingUrl);

  logger.verbose('[REG-START] Registry is responding to health checks');

  // Verify package availability
  const packageUrl = `${registryUrl}/@nxworker/workspace`;
  const packageData = await httpGet(packageUrl);

  // Parse package metadata
  const parsedData = JSON.parse(packageData) as {
    name: string;
    versions?: Record<string, unknown>;
  };

  if (parsedData.name !== '@nxworker/workspace') {
    throw new Error(
      `Unexpected package name: expected '@nxworker/workspace', got '${parsedData.name}'`,
    );
  }

  if (!parsedData.versions || Object.keys(parsedData.versions).length === 0) {
    throw new Error('Package has no published versions in registry');
  }

  logger.verbose(
    `[REG-START] Package '@nxworker/workspace' is available with ${Object.keys(parsedData.versions).length} version(s)`,
  );
}

/**
 * Make HTTP GET request
 */
function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(
          new Error(`HTTP request failed: ${url} returned ${res.statusCode}`),
        );
        return;
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve(data);
      });
    }).on('error', (err) => {
      reject(new Error(`HTTP request failed: ${err.message}`));
    });
  });
}
