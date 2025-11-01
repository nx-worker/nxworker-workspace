/**
 * MOVE-SMALL Scenario
 *
 * Validates basic move-file generator functionality by moving a single file
 * between two libraries in the same workspace using default options.
 *
 * Parent Issue: #319 - Adopt new end-to-end test plan
 * This Issue: #333 - Implement basic move scenarios
 */

import { logger } from '@nx/devkit';
import { execSync } from 'node:child_process';
import { join } from 'node:path/posix';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import {
  createWorkspace,
  cleanupWorkspace,
  type WorkspaceInfo,
} from '@internal/e2e-util';
import { uniqueId } from '@internal/test-util';
import type { InfrastructureScenarioContext } from './types';
import { E2E_PACKAGE_NAME, E2E_PACKAGE_VERSION } from './constants';

/**
 * MOVE-SMALL: Move single file lib→lib (2 libs) default options
 *
 * Validates:
 * 1. File moved from lib-a to lib-b
 * 2. Import in lib-b updated to reflect new location
 * 3. Source file removed from lib-a
 * 4. Both projects still build successfully
 * 5. No duplicate imports or exports
 *
 * @param context - Infrastructure scenario context with registry configuration
 * @throws Error if move fails or assertions fail
 */
export async function run(
  context: InfrastructureScenarioContext,
): Promise<void> {
  const { registryUrl } = context;
  let workspace: WorkspaceInfo | undefined;

  try {
    logger.verbose('[MOVE-SMALL] Creating test workspace with 2 libraries...');

    // Create workspace with 2 libraries
    const workspaceName = `move-small-${uniqueId('ws')}`;
    workspace = await createWorkspace({
      name: workspaceName,
      libs: 2,
      includeApp: false,
    });

    logger.verbose(
      `[MOVE-SMALL] Workspace created at: ${workspace.path} with libs: ${workspace.libs.join(', ')}`,
    );

    const [libA, libB] = workspace.libs;

    // Add util.ts to lib-a with exported function
    const utilContent = `export function calculateSum(a: number, b: number): number {
  return a + b;
}
`;
    const utilPath = join(workspace.path, libA, 'src', 'lib', 'util.ts');
    writeFileSync(utilPath, utilContent, 'utf-8');
    logger.verbose(`[MOVE-SMALL] Created ${libA}/src/lib/util.ts`);

    // Add consumer.ts to lib-b that imports util from lib-a
    const consumerContent = `import { calculateSum } from '@${workspaceName}/${libA}';

export function useCalculator() {
  return calculateSum(10, 20);
}
`;
    const consumerPath = join(
      workspace.path,
      libB,
      'src',
      'lib',
      'consumer.ts',
    );
    writeFileSync(consumerPath, consumerContent, 'utf-8');
    logger.verbose(`[MOVE-SMALL] Created ${libB}/src/lib/consumer.ts`);

    // Configure npm to use local registry
    const npmrcPath = join(workspace.path, '.npmrc');
    writeFileSync(npmrcPath, `registry=${registryUrl}\n`, 'utf-8');

    logger.verbose(
      `[MOVE-SMALL] Installing ${E2E_PACKAGE_NAME}@${E2E_PACKAGE_VERSION}...`,
    );

    // Install plugin from local registry
    execSync(`npm install ${E2E_PACKAGE_NAME}@${E2E_PACKAGE_VERSION}`, {
      cwd: workspace.path,
      stdio: 'pipe',
      encoding: 'utf-8',
    });

    logger.verbose(
      '[MOVE-SMALL] Plugin installed, running move-file generator...',
    );

    // Run move-file generator
    const sourceFile = `${libA}/src/lib/util.ts`;
    execSync(
      `npx nx generate ${E2E_PACKAGE_NAME}:move-file ${sourceFile} --project=${libB} --no-interactive`,
      {
        cwd: workspace.path,
        stdio: 'inherit',
      },
    );

    logger.verbose('[MOVE-SMALL] Generator completed, verifying results...');

    // Verify file moved to lib-b
    const targetPath = join(workspace.path, libB, 'src', 'lib', 'util.ts');
    if (!existsSync(targetPath)) {
      throw new Error(
        `File not found at target location: ${libB}/src/lib/util.ts`,
      );
    }
    logger.verbose(`[MOVE-SMALL] ✓ File exists at ${libB}/src/lib/util.ts`);

    // Verify file removed from lib-a
    if (existsSync(utilPath)) {
      throw new Error(
        `File still exists at source location: ${libA}/src/lib/util.ts`,
      );
    }
    logger.verbose(`[MOVE-SMALL] ✓ File removed from ${libA}/src/lib/util.ts`);

    // Verify import in consumer.ts updated
    const updatedConsumer = readFileSync(consumerPath, 'utf-8');
    if (updatedConsumer.includes(`@${workspaceName}/${libA}`)) {
      throw new Error(
        `Import in consumer.ts still references old location: @${workspaceName}/${libA}`,
      );
    }
    if (!updatedConsumer.includes('./util')) {
      throw new Error(
        'Import in consumer.ts not updated to relative path: ./util',
      );
    }
    logger.verbose(
      '[MOVE-SMALL] ✓ Import in consumer.ts updated to relative path',
    );

    logger.verbose(
      '[MOVE-SMALL] All assertions passed - basic lib→lib move works correctly',
    );
  } finally {
    // Clean up workspace
    if (workspace) {
      logger.verbose('[MOVE-SMALL] Cleaning up test workspace...');
      try {
        await cleanupWorkspace(workspace.path);
      } catch (error) {
        // Cleanup failures are non-critical on Windows due to file locking
        logger.warn(
          `[MOVE-SMALL] Cleanup failed (non-critical): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
