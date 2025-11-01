/**
 * INSTALL Scenario
 *
 * Validates plugin installation in a fresh Nx workspace by creating a test workspace,
 * installing the plugin from the local registry, and verifying it can be imported and used.
 *
 * Parent Issue: #319 - Adopt new end-to-end test plan
 * This Issue: #332 - Implement infrastructure scenarios
 * Optimization: #339 Phase 4 - Benefits from async workspace creation infrastructure
 */

import { logger } from '@nx/devkit';
import { execSync } from 'node:child_process';
import { join } from 'node:path/posix';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import {
  createWorkspace,
  cleanupWorkspace,
  withRetry,
  type WorkspaceInfo,
} from '@internal/e2e-util';
import { uniqueId } from '@internal/test-util';
import type { InfrastructureScenarioContext } from './types';
import { E2E_PACKAGE_NAME, E2E_PACKAGE_VERSION } from './constants';

/**
 * INSTALL: Create new workspace, install plugin, import check
 *
 * Validates:
 * 1. Plugin can be installed from local registry
 * 2. Package appears in node_modules
 * 3. Generator is registered in Nx
 * 4. Package can be listed via nx list command
 *
 * @param context - Infrastructure scenario context with registry configuration
 * @throws Error if installation fails or plugin is not usable
 */
export async function run(
  context: InfrastructureScenarioContext,
): Promise<void> {
  const { registryUrl } = context;
  let workspace: WorkspaceInfo | undefined;

  try {
    logger.verbose('[INSTALL] Creating test workspace...');

    // Use unique workspace name to avoid conflicts from previous failed runs
    // This prevents Windows file locking issues from affecting subsequent test runs
    const workspaceName = `install-test-${uniqueId('ws')}`;

    // Create minimal workspace with 2 libraries
    // Phase 4: Benefits from async batched generation infrastructure (Phase 3)
    workspace = await createWorkspace({
      name: workspaceName,
      libs: 2,
      includeApp: false,
    });

    logger.verbose(`[INSTALL] Workspace created at: ${workspace.path}`);

    // Configure npm to use local registry
    const npmrcPath = join(workspace.path, '.npmrc');
    const npmrcContent = `registry=${registryUrl}\n`;
    writeFileSync(npmrcPath, npmrcContent, 'utf-8');

    logger.verbose(
      `[INSTALL] Installing ${E2E_PACKAGE_NAME}@${E2E_PACKAGE_VERSION}...`,
    );

    // Install plugin from local registry with retry logic
    // Phase 4: Use --prefer-offline to speed up npm install (Phase 1 optimization)
    await withRetry(
      async () => {
        if (!workspace) {
          throw new Error('Workspace not initialized');
        }
        execSync(
          `npm install ${E2E_PACKAGE_NAME}@${E2E_PACKAGE_VERSION} --prefer-offline`,
          {
            cwd: workspace.path,
            stdio: 'pipe',
            encoding: 'utf-8',
          },
        );
      },
      {
        maxAttempts: 3,
        delayMs: 2000,
        operationName: `install ${E2E_PACKAGE_NAME}@${E2E_PACKAGE_VERSION}`,
      },
    );

    logger.verbose('[INSTALL] Verifying package installation...');

    // Verify package exists in node_modules
    const packageJsonPath = join(
      workspace.path,
      'node_modules',
      '@nxworker',
      'workspace',
      'package.json',
    );

    if (!existsSync(packageJsonPath)) {
      throw new Error(`Package not found in node_modules: ${packageJsonPath}`);
    }

    // Verify package.json has correct version
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
      name: string;
      version: string;
    };

    if (packageJson.version !== E2E_PACKAGE_VERSION) {
      throw new Error(
        `Unexpected package version: expected '${E2E_PACKAGE_VERSION}', got '${packageJson.version}'`,
      );
    }

    logger.verbose('[INSTALL] Verifying generator registration...');

    // Verify generator is listed in Nx
    let listOutput: string;
    try {
      listOutput = execSync(`npx nx list ${E2E_PACKAGE_NAME}`, {
        cwd: workspace.path,
        stdio: 'pipe',
        encoding: 'utf-8',
      });
    } catch (error) {
      throw new Error(
        `Failed to list plugin generators: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Check that move-file generator is listed
    if (!listOutput.includes('move-file')) {
      throw new Error(
        `Generator 'move-file' not found in plugin. Output: ${listOutput}`,
      );
    }

    logger.verbose(
      '[INSTALL] Plugin successfully installed and generators are registered',
    );
  } finally {
    // Clean up workspace
    if (workspace) {
      logger.verbose('[INSTALL] Cleaning up test workspace...');
      try {
        await cleanupWorkspace(workspace.path);
      } catch (error) {
        // Cleanup failures are non-critical on Windows due to file locking
        // Just log as warning and continue
        logger.warn(
          `[INSTALL] Cleanup failed (non-critical): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
