/**
 * INSTALL Scenario
 *
 * Validates plugin installation in a fresh Nx workspace by creating a test workspace,
 * installing the plugin from the local registry, and verifying it can be imported and used.
 *
 * Parent Issue: #319 - Adopt new end-to-end test plan
 * This Issue: #332 - Implement infrastructure scenarios
 */

import { logger } from '@nx/devkit';
import { execSync } from 'node:child_process';
import { join } from 'node:path/posix';
import { writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import {
  createWorkspace,
  cleanupWorkspace,
  type WorkspaceInfo,
} from '@internal/e2e-util';
import type { InfrastructureScenarioContext } from './types';

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

    // Clean up any existing workspace from previous failed runs
    const workspacePath = join(process.cwd(), 'tmp', 'install-test');
    if (existsSync(workspacePath)) {
      logger.verbose(
        '[INSTALL] Cleaning up existing workspace from previous run...',
      );
      try {
        rmSync(workspacePath, { recursive: true, force: true });
      } catch (error) {
        logger.warn(
          `[INSTALL] Failed to cleanup existing workspace (non-critical): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Create minimal workspace with 2 libraries
    workspace = await createWorkspace({
      name: 'install-test',
      libs: 2,
      includeApp: false,
    });

    logger.verbose(`[INSTALL] Workspace created at: ${workspace.path}`);

    // Configure npm to use local registry
    const npmrcPath = join(workspace.path, '.npmrc');
    const npmrcContent = `registry=${registryUrl}\n`;
    writeFileSync(npmrcPath, npmrcContent, 'utf-8');

    logger.verbose('[INSTALL] Installing @nxworker/workspace@0.0.0-e2e...');

    // Install plugin from local registry
    try {
      execSync('npm install @nxworker/workspace@0.0.0-e2e', {
        cwd: workspace.path,
        stdio: 'pipe',
        encoding: 'utf-8',
      });
    } catch (error) {
      throw new Error(
        `Failed to install plugin: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

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

    if (packageJson.version !== '0.0.0-e2e') {
      throw new Error(
        `Unexpected package version: expected '0.0.0-e2e', got '${packageJson.version}'`,
      );
    }

    logger.verbose('[INSTALL] Verifying generator registration...');

    // Verify generator is listed in Nx
    let listOutput: string;
    try {
      listOutput = execSync('npx nx list @nxworker/workspace', {
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
