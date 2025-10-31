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
import { httpGet } from '@internal/e2e-util';
import type { InfrastructureScenarioContext } from './types';
import { E2E_PACKAGE_NAME } from './constants';

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

  // Verify registry health endpoint and package availability in parallel
  const pingUrl = `${registryUrl}/-/ping`;
  const packageUrl = `${registryUrl}/${E2E_PACKAGE_NAME}`;

  const [, response] = await Promise.all([
    httpGet(pingUrl),
    httpGet(packageUrl),
  ]);

  logger.verbose('[REG-START] Registry is responding to health checks');

  // Parse package metadata
  const parsedData = JSON.parse(response.body) as {
    name: string;
    versions?: Record<string, unknown>;
  };

  if (parsedData.name !== E2E_PACKAGE_NAME) {
    throw new Error(
      `Unexpected package name: expected '${E2E_PACKAGE_NAME}', got '${parsedData.name}'`,
    );
  }

  if (!parsedData.versions || Object.keys(parsedData.versions).length === 0) {
    throw new Error('Package has no published versions in registry');
  }

  logger.verbose(
    `[REG-START] Package '${E2E_PACKAGE_NAME}' is available with ${Object.keys(parsedData.versions).length} version(s)`,
  );
}
