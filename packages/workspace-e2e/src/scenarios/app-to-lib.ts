/**
 * APP-TO-LIB Scenario
 *
 * Validates cross-project move from application to library, testing how the
 * generator handles different source roots and import path transformations.
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
import { verifyExportInIndex } from './helpers/verify-exports';

/**
 * APP-TO-LIB: Move file from application to library
 *
 * Validates:
 * 1. File moved from app to library
 * 2. Imports in app updated to use library import path
 * 3. Source file removed from app
 * 4. Library exports the moved file
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
    logger.verbose(
      '[APP-TO-LIB] Creating test workspace with 1 app and 1 library...',
    );

    // Create workspace with 1 application and 1 library
    const workspaceName = `app-to-lib-${uniqueId('ws')}`;
    workspace = await createWorkspace({
      name: workspaceName,
      libs: 1,
      includeApp: true,
    });

    logger.verbose(
      `[APP-TO-LIB] Workspace created at: ${workspace.path} with app: ${workspace.app}, lib: ${workspace.libs[0]}`,
    );

    if (!workspace.app) {
      throw new Error('Workspace was not created with an application');
    }

    const appName = workspace.app;
    const libName = workspace.libs[0];

    // Add helper.ts to app-main with exported function
    const helperContent = `export function formatMessage(message: string): string {
  return \`[INFO] \${message}\`;
}
`;
    const helperPath = join(workspace.path, appName, 'src', 'helper.ts');
    writeFileSync(helperPath, helperContent, 'utf-8');
    logger.verbose(`[APP-TO-LIB] Created ${appName}/src/helper.ts`);

    // Update main.ts to use helper
    const mainPath = join(workspace.path, appName, 'src', 'main.ts');
    const mainContent = `import { formatMessage } from './helper';

console.log(formatMessage('Application started'));
`;
    writeFileSync(mainPath, mainContent, 'utf-8');
    logger.verbose(`[APP-TO-LIB] Updated ${appName}/src/main.ts`);

    // Configure npm to use local registry
    const npmrcPath = join(workspace.path, '.npmrc');
    writeFileSync(npmrcPath, `registry=${registryUrl}\n`, 'utf-8');

    logger.verbose(
      `[APP-TO-LIB] Installing ${E2E_PACKAGE_NAME}@${E2E_PACKAGE_VERSION}...`,
    );

    // Install plugin from local registry
    execSync(`npm install ${E2E_PACKAGE_NAME}@${E2E_PACKAGE_VERSION}`, {
      cwd: workspace.path,
      stdio: 'pipe',
      encoding: 'utf-8',
    });

    logger.verbose(
      '[APP-TO-LIB] Plugin installed, running move-file generator...',
    );

    // Run move-file generator
    const sourceFile = `${appName}/src/helper.ts`;
    execSync(
      `npx nx generate ${E2E_PACKAGE_NAME}:move-file ${sourceFile} --project=${libName} --no-interactive`,
      {
        cwd: workspace.path,
        stdio: 'inherit',
      },
    );

    logger.verbose('[APP-TO-LIB] Generator completed, verifying results...');

    // Verify file moved to library
    const targetPath = join(workspace.path, libName, 'src', 'lib', 'helper.ts');
    if (!existsSync(targetPath)) {
      throw new Error(
        `File not found at target location: ${libName}/src/lib/helper.ts`,
      );
    }
    logger.verbose(
      `[APP-TO-LIB] ✓ File exists at ${libName}/src/lib/helper.ts`,
    );

    // Verify file removed from app
    if (existsSync(helperPath)) {
      throw new Error(
        `File still exists at source location: ${appName}/src/helper.ts`,
      );
    }
    logger.verbose(`[APP-TO-LIB] ✓ File removed from ${appName}/src/helper.ts`);

    // Verify import in main.ts updated to use library alias
    const updatedMain = readFileSync(mainPath, 'utf-8');
    if (updatedMain.includes('./helper')) {
      throw new Error(`Import in main.ts still uses relative path: ./helper`);
    }
    if (!updatedMain.includes(`@${workspaceName}/${libName}`)) {
      throw new Error(
        `Import in main.ts not updated to library alias: @${workspaceName}/${libName}`,
      );
    }
    logger.verbose('[APP-TO-LIB] ✓ Import in main.ts updated to library alias');

    // Verify library index exports the moved file
    verifyExportInIndex(workspace.path, libName, 'helper');
    logger.verbose('[APP-TO-LIB] ✓ Library index.ts exports the moved file');

    logger.verbose(
      '[APP-TO-LIB] All assertions passed - app→lib move works correctly',
    );
  } finally {
    // Clean up workspace
    if (workspace) {
      logger.verbose('[APP-TO-LIB] Cleaning up test workspace...');
      try {
        await cleanupWorkspace(workspace.path);
      } catch (error) {
        // Cleanup failures are non-critical on Windows due to file locking
        logger.warn(
          `[APP-TO-LIB] Cleanup failed (non-critical): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
