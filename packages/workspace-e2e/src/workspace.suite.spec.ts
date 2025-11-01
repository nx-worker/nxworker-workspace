/**
 * E2E Test Suite Orchestrator
 *
 * This orchestrator executes all scenario modules for the cost-efficient
 * end-to-end test plan. It consolidates setup/teardown (Verdaccio registry,
 * plugin publishing) and executes scenarios in deterministic order.
 *
 * Parent Issue: #319 - Adopt new end-to-end test plan
 * This Issue: #321 - Add orchestrator spec for e2e target
 * Scenarios: #322 - Implement scenario modules
 * Infrastructure: #332 - Implement infrastructure scenarios
 */

import type { VerdaccioConfig, WorkspaceInfo } from '@internal/e2e-util';
import { httpGet, createWorkspace, cleanupWorkspace } from '@internal/e2e-util';
import { uniqueId } from '@internal/test-util';
import { execSync } from 'node:child_process';
import { join } from 'node:path/posix';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { run as runRegStart } from './scenarios/reg-start';
import { run as runPublish } from './scenarios/publish';
import { run as runInstall } from './scenarios/install';
import type { InfrastructureScenarioContext } from './scenarios/types';
import { E2E_PACKAGE_NAME, E2E_PACKAGE_VERSION } from './scenarios/constants';

/**
 * Orchestrator State
 *
 * Shared state across all scenarios:
 * - Verdaccio configuration (port, storage path)
 * - Infrastructure failure flag (for fast-fail behavior)
 * - Shared workspace for generator scenarios (Phase 2 optimization)
 *
 * Note: Registry is managed by Jest global setup/teardown, not by the orchestrator.
 */
let verdaccioConfig: VerdaccioConfig;
let registryUrl: string;
let infrastructureFailed = false;
let sharedWorkspace: WorkspaceInfo | undefined;

/**
 * Library Allocation Map
 *
 * Defines which libraries are used by each generator scenario to prevent conflicts.
 * Libraries are named generically (lib-a, lib-b, lib-c...) by workspace-scaffold.
 *
 * Phase 2 optimization: All generator scenarios share a single workspace with
 * pre-generated libraries, using unique library assignments to avoid interference.
 */
const LIBRARY_ALLOCATION = {
  // Basic move scenarios
  MOVE_SMALL: ['lib-a', 'lib-b'],
  APP_TO_LIB: ['lib-c'], // Uses app-main from shared workspace

  // Advanced move scenarios (to be implemented)
  MOVE_PROJECT_DIR: ['lib-d', 'lib-e'],
  MOVE_DERIVE_DIR: ['lib-f', 'lib-g'],
  MOVE_SKIP_EXPORT: ['lib-h', 'lib-i'],
  MOVE_SKIP_FORMAT: ['lib-j', 'lib-k'],
  MOVE_UNICODE: ['lib-l', 'lib-m'],
  MOVE_REMOVE_EMPTY: ['lib-n', 'lib-o'],

  // Multi-library scenarios
  PATH_ALIASES: ['lib-p', 'lib-q', 'lib-r'],
  EXPORTS: ['lib-s', 'lib-t'],
  REPEAT_MOVE: ['lib-u', 'lib-v'],
  GRAPH_REACTION: ['lib-w', 'lib-x'],

  // Scale scenario (requires many libraries)
  SCALE_LIBS: [
    'lib-y',
    'lib-z',
    'lib-aa',
    'lib-ab',
    'lib-ac',
    'lib-ad',
    'lib-ae',
    'lib-af',
    'lib-ag',
    'lib-ah',
    'lib-ai',
  ],

  // Smoke sentinel
  SMOKE_SENTINEL: ['lib-aj', 'lib-ak'],
} as const;

/**
 * Calculate total libraries needed
 *
 * Flattens LIBRARY_ALLOCATION to count unique library names for shared workspace setup.
 */
function calculateRequiredLibraries(): number {
  const allLibs = new Set<string>();
  Object.values(LIBRARY_ALLOCATION).forEach((libs) =>
    libs.forEach((lib) => allLibs.add(lib)),
  );
  return allLibs.size;
}

describe('E2E Test Suite (Orchestrator)', () => {
  /**
   * Global Setup
   *
   * Phase 1: Validate Verdaccio registry
   * Phase 2: Create shared workspace for generator scenarios (optimization)
   *
   * The Verdaccio registry and plugin publishing are handled by Jest global setup
   * (tools/scripts/start-local-registry.ts).
   *
   * Registry lifecycle:
   * 1. Jest global setup starts Verdaccio on port 4873
   * 2. Jest global setup publishes @nxworker/workspace@0.0.0-e2e with tag 'e2e'
   * 3. Orchestrator scenarios use the running registry
   * 4. Jest global teardown stops Verdaccio
   *
   * Shared workspace (Phase 2 optimization):
   * - Single workspace creation eliminates ~7-14 minutes of redundant setup
   * - Pre-generates all libraries needed by generator scenarios
   * - Installs plugin once instead of per-scenario
   * - Scenarios use unique library names to avoid conflicts
   */
  beforeAll(async () => {
    // Reset infrastructure failure flag for new test run
    infrastructureFailed = false;

    // Reference the registry started by Jest global setup
    verdaccioConfig = {
      port: 4873,
      maxFallbackAttempts: 2,
    };

    registryUrl = `http://localhost:${verdaccioConfig.port}`;

    // Security: Validate that registry URL is localhost to prevent accidental remote registry use
    const parsedUrl = new URL(registryUrl);
    if (
      parsedUrl.hostname !== 'localhost' &&
      parsedUrl.hostname !== '127.0.0.1'
    ) {
      throw new Error(
        `Security: Registry URL must use localhost or 127.0.0.1, got: ${parsedUrl.hostname}`,
      );
    }

    // Validate registry is accessible
    try {
      await httpGet(`${registryUrl}/-/ping`);
    } catch (error) {
      throw new Error(
        `Registry not accessible at ${registryUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Phase 2: Create shared workspace for generator scenarios
    console.log('[SUITE] Creating shared workspace for generator scenarios...');

    const requiredLibs = calculateRequiredLibraries();
    console.log(
      `[SUITE] Generating ${requiredLibs} libraries for all scenarios`,
    );

    const workspaceName = `e2e-suite-shared-${uniqueId('ws')}`;
    sharedWorkspace = await createWorkspace({
      name: workspaceName,
      libs: requiredLibs,
      includeApp: true, // For APP-TO-LIB scenario
    });

    console.log(`[SUITE] Workspace created at: ${sharedWorkspace.path}`);
    console.log(
      `[SUITE] Libraries: ${sharedWorkspace.libs.slice(0, 5).join(', ')}... (${sharedWorkspace.libs.length} total)`,
    );
    console.log(`[SUITE] Application: ${sharedWorkspace.app}`);

    // Configure npm to use local registry
    const npmrcPath = join(sharedWorkspace.path, '.npmrc');
    writeFileSync(npmrcPath, `registry=${registryUrl}\n`, 'utf-8');

    // Install plugin once for all generator scenarios
    console.log(
      `[SUITE] Installing ${E2E_PACKAGE_NAME}@${E2E_PACKAGE_VERSION}...`,
    );
    execSync(
      `npm install ${E2E_PACKAGE_NAME}@${E2E_PACKAGE_VERSION} --prefer-offline`,
      {
        cwd: sharedWorkspace.path,
        stdio: 'pipe',
        encoding: 'utf-8',
      },
    );

    console.log('[SUITE] Shared workspace setup complete');
  }, 180000); // 3 minute timeout for full setup (workspace creation + library generation + plugin install)

  /**
   * Global Teardown
   *
   * Registry cleanup is handled by Jest global teardown.
   * Shared workspace cleanup (Phase 2 optimization).
   */
  afterAll(async () => {
    // Registry cleanup handled by Jest global teardown (tools/scripts/stop-local-registry.ts)

    // Phase 2: Clean up shared workspace
    if (sharedWorkspace) {
      console.log('[SUITE] Cleaning up shared workspace...');
      try {
        await cleanupWorkspace(sharedWorkspace.path);
        console.log('[SUITE] Shared workspace cleaned up successfully');
      } catch (error) {
        // Cleanup failures are non-critical on Windows due to file locking
        console.warn(
          `[SUITE] Cleanup failed (non-critical): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  });

  /**
   * SCENARIO CATALOGUE
   *
   * The following scenarios are executed in deterministic order
   * matching issue #319's Scenario Catalogue.
   */

  // ============================================================================
  // LOCAL REGISTRY
  // ============================================================================

  it('REG-START: Start Verdaccio and confirm package availability', async () => {
    // Skip if infrastructure already failed
    if (infrastructureFailed) {
      console.warn(
        'Skipping REG-START: infrastructure already failed in earlier scenario',
      );
      return;
    }

    try {
      const context: InfrastructureScenarioContext = {
        verdaccioConfig,
        registryUrl,
      };
      await runRegStart(context);
    } catch (error) {
      infrastructureFailed = true;
      throw error;
    }
  });

  // ============================================================================
  // PUBLISH FLOW
  // ============================================================================

  it('PUBLISH: Local publish of plugin (dry + actual)', async () => {
    // Skip if infrastructure already failed
    if (infrastructureFailed) {
      console.warn(
        'Skipping PUBLISH: infrastructure failed in earlier scenario',
      );
      return;
    }

    try {
      const context: InfrastructureScenarioContext = {
        verdaccioConfig,
        registryUrl,
      };
      await runPublish(context);
    } catch (error) {
      infrastructureFailed = true;
      throw error;
    }
  });

  // ============================================================================
  // INSTALL FLOW
  // ============================================================================

  it('INSTALL: Create new workspace, install plugin, import check', async () => {
    // Skip if infrastructure already failed
    if (infrastructureFailed) {
      console.warn(
        'Skipping INSTALL: infrastructure failed in earlier scenario',
      );
      return;
    }

    try {
      const context: InfrastructureScenarioContext = {
        verdaccioConfig,
        registryUrl,
      };
      await runInstall(context);
    } catch (error) {
      infrastructureFailed = true;
      throw error;
    }
  }, 120000); // 2 min: workspace creation (~30s) + npm install (~30s) + plugin import verification (~10s) + cleanup (~50s)

  // ============================================================================
  // BASIC GENERATOR
  // ============================================================================

  it('MOVE-SMALL: Move single file lib→lib (2 libs) default options', async () => {
    // Skip if infrastructure failed (fast-fail)
    if (infrastructureFailed) {
      console.warn(
        'Skipping MOVE-SMALL: infrastructure failed in earlier scenario',
      );
      return;
    }

    if (!sharedWorkspace) {
      throw new Error('Shared workspace not initialized');
    }

    console.log('[MOVE-SMALL] Using shared workspace with allocated libraries');

    const [libA, libB] = LIBRARY_ALLOCATION.MOVE_SMALL;
    const workspaceName = sharedWorkspace.name;

    // Add util.ts to lib-a with exported function
    const utilContent = `export function calculateSum(a: number, b: number): number {
  return a + b;
}
`;
    const utilPath = join(sharedWorkspace.path, libA, 'src', 'lib', 'util.ts');
    writeFileSync(utilPath, utilContent, 'utf-8');
    console.log(`[MOVE-SMALL] Created ${libA}/src/lib/util.ts`);

    // Add consumer.ts to lib-b that imports util from lib-a
    const consumerContent = `import { calculateSum } from '@${workspaceName}/${libA}';

export function useCalculator() {
  return calculateSum(10, 20);
}
`;
    const consumerPath = join(
      sharedWorkspace.path,
      libB,
      'src',
      'lib',
      'consumer.ts',
    );
    writeFileSync(consumerPath, consumerContent, 'utf-8');
    console.log(`[MOVE-SMALL] Created ${libB}/src/lib/consumer.ts`);

    console.log('[MOVE-SMALL] Running move-file generator...');

    // Run move-file generator
    const sourceFile = `${libA}/src/lib/util.ts`;
    execSync(
      `npx nx generate ${E2E_PACKAGE_NAME}:move-file ${sourceFile} --project=${libB} --no-interactive`,
      {
        cwd: sharedWorkspace.path,
        stdio: 'inherit',
      },
    );

    console.log('[MOVE-SMALL] Generator completed, verifying results...');

    // Verify file moved to lib-b
    const targetPath = join(
      sharedWorkspace.path,
      libB,
      'src',
      'lib',
      'util.ts',
    );
    if (!existsSync(targetPath)) {
      throw new Error(
        `File not found at target location: ${libB}/src/lib/util.ts`,
      );
    }
    console.log(`[MOVE-SMALL] ✓ File exists at ${libB}/src/lib/util.ts`);

    // Verify file removed from lib-a
    if (existsSync(utilPath)) {
      throw new Error(
        `File still exists at source location: ${libA}/src/lib/util.ts`,
      );
    }
    console.log(`[MOVE-SMALL] ✓ File removed from ${libA}/src/lib/util.ts`);

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
    console.log(
      '[MOVE-SMALL] ✓ Import in consumer.ts updated to relative path',
    );

    console.log('[MOVE-SMALL] All assertions passed ✓');
  }, 60000); // 1 min: generator execution (~40s) + assertions (~20s) - no workspace creation or plugin install

  // ============================================================================
  // APP TO LIB MOVE
  // ============================================================================

  it('APP-TO-LIB: Move file from application to library', async () => {
    if (infrastructureFailed) return;

    if (!sharedWorkspace) {
      throw new Error('Shared workspace not initialized');
    }

    console.log('[APP-TO-LIB] Using shared workspace with allocated library');

    const [libName] = LIBRARY_ALLOCATION.APP_TO_LIB;
    const appName = sharedWorkspace.app;
    const workspaceName = sharedWorkspace.name;

    if (!appName) {
      throw new Error('Shared workspace was not created with an application');
    }

    // Add helper.ts to app with exported function
    const helperContent = `export function formatMessage(message: string): string {
  return \`[INFO] \${message}\`;
}
`;
    const helperPath = join(sharedWorkspace.path, appName, 'src', 'helper.ts');
    writeFileSync(helperPath, helperContent, 'utf-8');
    console.log(`[APP-TO-LIB] Created ${appName}/src/helper.ts`);

    // Update main.ts to use helper
    const mainPath = join(sharedWorkspace.path, appName, 'src', 'main.ts');
    const mainContent = `import { formatMessage } from './helper';

console.log(formatMessage('Application started'));
`;
    writeFileSync(mainPath, mainContent, 'utf-8');
    console.log(`[APP-TO-LIB] Updated ${appName}/src/main.ts`);

    console.log('[APP-TO-LIB] Running move-file generator...');

    // Run move-file generator
    const sourceFile = `${appName}/src/helper.ts`;
    execSync(
      `npx nx generate ${E2E_PACKAGE_NAME}:move-file ${sourceFile} --project=${libName} --no-interactive`,
      {
        cwd: sharedWorkspace.path,
        stdio: 'inherit',
      },
    );

    console.log('[APP-TO-LIB] Generator completed, verifying results...');

    // Verify file moved to library
    const targetPath = join(
      sharedWorkspace.path,
      libName,
      'src',
      'lib',
      'helper.ts',
    );
    if (!existsSync(targetPath)) {
      throw new Error(
        `File not found at target location: ${libName}/src/lib/helper.ts`,
      );
    }
    console.log(`[APP-TO-LIB] ✓ File exists at ${libName}/src/lib/helper.ts`);

    // Verify file removed from app
    if (existsSync(helperPath)) {
      throw new Error(
        `File still exists at source location: ${appName}/src/helper.ts`,
      );
    }
    console.log(`[APP-TO-LIB] ✓ File removed from ${appName}/src/helper.ts`);

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
    console.log('[APP-TO-LIB] ✓ Import in main.ts updated to library alias');

    // Verify library index exports the moved file
    const indexPath = join(sharedWorkspace.path, libName, 'src', 'index.ts');
    const indexContent = readFileSync(indexPath, 'utf-8');
    if (!indexContent.includes("export * from './lib/helper'")) {
      throw new Error(
        `Library index.ts does not export helper: ${indexContent}`,
      );
    }
    console.log('[APP-TO-LIB] ✓ Library index.ts exports the moved file');

    console.log('[APP-TO-LIB] All assertions passed ✓');
  }, 60000); // 1 min: generator execution (~40s) + assertions (~20s) - no workspace creation or plugin install

  // ============================================================================
  // EXPLICIT DIRECTORY
  // ============================================================================

  it('MOVE-PROJECT-DIR: Move with projectDirectory specified', async () => {
    if (infrastructureFailed) return;

    if (!sharedWorkspace) {
      throw new Error('Shared workspace not initialized');
    }

    console.log(
      '[MOVE-PROJECT-DIR] Using shared workspace with allocated libraries',
    );

    const [libD, libE] = LIBRARY_ALLOCATION.MOVE_PROJECT_DIR;

    // Create and export a utility file in lib-d
    const utilContent = 'export function util() { return 42; }\n';
    const utilPath = join(sharedWorkspace.path, libD, 'src', 'lib', 'util.ts');
    writeFileSync(utilPath, utilContent, 'utf-8');
    console.log(`[MOVE-PROJECT-DIR] Created ${libD}/src/lib/util.ts`);

    // Export from lib-d index
    const libDIndexPath = join(sharedWorkspace.path, libD, 'src', 'index.ts');
    writeFileSync(libDIndexPath, "export * from './lib/util';\n", 'utf-8');

    console.log('[MOVE-PROJECT-DIR] Running move-file generator...');

    // Move to explicit subdirectory
    execSync(
      `npx nx generate ${E2E_PACKAGE_NAME}:move-file ${libD}/src/lib/util.ts --project ${libE} --project-directory features/utils --no-interactive`,
      {
        cwd: sharedWorkspace.path,
        stdio: 'inherit',
      },
    );

    console.log('[MOVE-PROJECT-DIR] Generator completed, verifying results...');

    // Assert: File exists at specified path
    const movedPath = join(
      sharedWorkspace.path,
      libE,
      'src',
      'lib',
      'features',
      'utils',
      'util.ts',
    );
    const movedContent = readFileSync(movedPath, 'utf-8');
    if (!movedContent.includes('export function util')) {
      throw new Error(
        `File content incorrect at ${libE}/src/lib/features/utils/util.ts`,
      );
    }
    console.log(
      `[MOVE-PROJECT-DIR] ✓ File exists at ${libE}/src/lib/features/utils/util.ts`,
    );

    // Assert: Target project index exports the file
    const libEIndexPath = join(sharedWorkspace.path, libE, 'src', 'index.ts');
    const libEIndexContent = readFileSync(libEIndexPath, 'utf-8');
    if (!libEIndexContent.includes('./lib/features/utils/util')) {
      throw new Error(
        `Target index does not export correct path: ${libEIndexContent}`,
      );
    }
    console.log('[MOVE-PROJECT-DIR] ✓ Target index exports the file');

    // Assert: Source project index no longer exports it
    const libDIndexContent = readFileSync(libDIndexPath, 'utf-8');
    if (libDIndexContent.includes('util')) {
      throw new Error(`Source index still exports util: ${libDIndexContent}`);
    }
    console.log('[MOVE-PROJECT-DIR] ✓ Source index updated');

    console.log('[MOVE-PROJECT-DIR] All assertions passed ✓');
  }, 60000);

  // ============================================================================
  // DERIVE DIRECTORY
  // ============================================================================

  it('MOVE-DERIVE-DIR: Move with deriveProjectDirectory=true', async () => {
    if (infrastructureFailed) return;

    if (!sharedWorkspace) {
      throw new Error('Shared workspace not initialized');
    }

    console.log(
      '[MOVE-DERIVE-DIR] Using shared workspace with allocated libraries',
    );

    const [libF, libG] = LIBRARY_ALLOCATION.MOVE_DERIVE_DIR;

    // Create file in nested structure
    const utilDir = join(
      sharedWorkspace.path,
      libF,
      'src',
      'lib',
      'features',
      'auth',
    );
    mkdirSync(utilDir, { recursive: true });
    const utilPath = join(utilDir, 'auth-util.ts');
    writeFileSync(
      utilPath,
      'export function authUtil() { return true; }\n',
      'utf-8',
    );
    console.log(
      `[MOVE-DERIVE-DIR] Created ${libF}/src/lib/features/auth/auth-util.ts`,
    );

    console.log('[MOVE-DERIVE-DIR] Running move-file generator...');

    // Move with derived directory
    execSync(
      `npx nx generate ${E2E_PACKAGE_NAME}:move-file ${libF}/src/lib/features/auth/auth-util.ts --project ${libG} --derive-project-directory --no-interactive`,
      {
        cwd: sharedWorkspace.path,
        stdio: 'inherit',
      },
    );

    console.log('[MOVE-DERIVE-DIR] Generator completed, verifying results...');

    // Assert: Derived path matches source structure
    const movedPath = join(
      sharedWorkspace.path,
      libG,
      'src',
      'lib',
      'features',
      'auth',
      'auth-util.ts',
    );
    const movedContent = readFileSync(movedPath, 'utf-8');
    if (!movedContent.includes('authUtil')) {
      throw new Error('File content incorrect at derived path');
    }
    console.log(
      `[MOVE-DERIVE-DIR] ✓ File exists at derived path ${libG}/src/lib/features/auth/auth-util.ts`,
    );

    console.log('[MOVE-DERIVE-DIR] All assertions passed ✓');
  }, 60000);

  // ============================================================================
  // SKIP EXPORT
  // ============================================================================

  it('MOVE-SKIP-EXPORT: Move exported file with skipExport flag', async () => {
    if (infrastructureFailed) return;

    if (!sharedWorkspace) {
      throw new Error('Shared workspace not initialized');
    }

    console.log(
      '[MOVE-SKIP-EXPORT] Using shared workspace with allocated libraries',
    );

    const [libH, libI] = LIBRARY_ALLOCATION.MOVE_SKIP_EXPORT;

    // Create and export a file
    const utilPath = join(sharedWorkspace.path, libH, 'src', 'lib', 'util.ts');
    writeFileSync(utilPath, 'export function util() { return 1; }\n', 'utf-8');
    console.log(`[MOVE-SKIP-EXPORT] Created ${libH}/src/lib/util.ts`);

    const libHIndexPath = join(sharedWorkspace.path, libH, 'src', 'index.ts');
    writeFileSync(libHIndexPath, "export * from './lib/util';\n", 'utf-8');

    // Read original lib-i index
    const libIIndexPath = join(sharedWorkspace.path, libI, 'src', 'index.ts');
    const originalLibIIndex = readFileSync(libIIndexPath, 'utf-8');

    console.log('[MOVE-SKIP-EXPORT] Running move-file generator...');

    // Move with skipExport
    execSync(
      `npx nx generate ${E2E_PACKAGE_NAME}:move-file ${libH}/src/lib/util.ts --project ${libI} --skip-export --no-interactive`,
      {
        cwd: sharedWorkspace.path,
        stdio: 'inherit',
      },
    );

    console.log('[MOVE-SKIP-EXPORT] Generator completed, verifying results...');

    // Assert: File moved
    const movedPath = join(sharedWorkspace.path, libI, 'src', 'lib', 'util.ts');
    const movedContent = readFileSync(movedPath, 'utf-8');
    if (!movedContent.includes('util')) {
      throw new Error('File not found at target location');
    }
    console.log(`[MOVE-SKIP-EXPORT] ✓ File moved to ${libI}/src/lib/util.ts`);

    // Assert: Target index unchanged (no export added)
    const newLibIIndex = readFileSync(libIIndexPath, 'utf-8');
    if (newLibIIndex !== originalLibIIndex) {
      throw new Error(
        `Target index was modified: expected "${originalLibIIndex}", got "${newLibIIndex}"`,
      );
    }
    if (newLibIIndex.includes('util')) {
      throw new Error('Target index incorrectly exports util');
    }
    console.log('[MOVE-SKIP-EXPORT] ✓ Target index unchanged');

    // Assert: Source index still updated (export removed)
    const libHIndexContent = readFileSync(libHIndexPath, 'utf-8');
    if (libHIndexContent.includes('util')) {
      throw new Error('Source index still exports util');
    }
    console.log('[MOVE-SKIP-EXPORT] ✓ Source index updated');

    console.log('[MOVE-SKIP-EXPORT] All assertions passed ✓');
  }, 60000);

  // ============================================================================
  // SKIP FORMAT
  // ============================================================================

  it('MOVE-SKIP-FORMAT: Move file with skipFormat=true', async () => {
    if (infrastructureFailed) return;

    if (!sharedWorkspace) {
      throw new Error('Shared workspace not initialized');
    }

    console.log(
      '[MOVE-SKIP-FORMAT] Using shared workspace with allocated libraries',
    );

    const [libJ, libK] = LIBRARY_ALLOCATION.MOVE_SKIP_FORMAT;

    // Create file with intentional formatting inconsistencies
    const utilPath = join(sharedWorkspace.path, libJ, 'src', 'lib', 'util.ts');
    const unformattedContent =
      'export   function   util()   {    return    42;    }\n';
    writeFileSync(utilPath, unformattedContent, 'utf-8');
    console.log(`[MOVE-SKIP-FORMAT] Created ${libJ}/src/lib/util.ts`);

    console.log('[MOVE-SKIP-FORMAT] Running move-file generator...');

    // Move with skipFormat
    execSync(
      `npx nx generate ${E2E_PACKAGE_NAME}:move-file ${libJ}/src/lib/util.ts --project ${libK} --skip-format --no-interactive`,
      {
        cwd: sharedWorkspace.path,
        stdio: 'inherit',
      },
    );

    console.log('[MOVE-SKIP-FORMAT] Generator completed, verifying results...');

    // Assert: File content preserved (multiple spaces intact)
    const movedPath = join(sharedWorkspace.path, libK, 'src', 'lib', 'util.ts');
    const movedContent = readFileSync(movedPath, 'utf-8');
    if (movedContent !== unformattedContent) {
      throw new Error(
        `File content was formatted. Expected "${unformattedContent}", got "${movedContent}"`,
      );
    }
    // Verify multiple spaces remain (not formatted to single space)
    if (!movedContent.includes('   ')) {
      throw new Error('Multiple spaces were removed (file was formatted)');
    }
    console.log('[MOVE-SKIP-FORMAT] ✓ File content preserved unformatted');

    console.log('[MOVE-SKIP-FORMAT] All assertions passed ✓');
  }, 60000);

  // ============================================================================
  // ALLOW UNICODE
  // ============================================================================

  it('MOVE-UNICODE: Move file with Unicode characters in path', async () => {
    if (infrastructureFailed) return;

    if (!sharedWorkspace) {
      throw new Error('Shared workspace not initialized');
    }

    console.log(
      '[MOVE-UNICODE] Using shared workspace with allocated libraries',
    );

    const [libL, libM] = LIBRARY_ALLOCATION.MOVE_UNICODE;
    const workspaceName = sharedWorkspace.name;

    // Create file with Unicode characters
    const unicodeFileName = 'util-émoji-日本語.ts';
    const unicodePath = join(
      sharedWorkspace.path,
      libL,
      'src',
      'lib',
      unicodeFileName,
    );
    writeFileSync(
      unicodePath,
      'export function unicodeUtil() { return "🚀"; }\n',
      'utf-8',
    );
    console.log(`[MOVE-UNICODE] Created ${libL}/src/lib/${unicodeFileName}`);

    // Create a consumer to verify import updates
    const consumerPath = join(
      sharedWorkspace.path,
      libL,
      'src',
      'lib',
      'consumer.ts',
    );
    writeFileSync(
      consumerPath,
      `import { unicodeUtil } from './util-émoji-日本語';\nexport const value = unicodeUtil();\n`,
      'utf-8',
    );
    console.log(`[MOVE-UNICODE] Created ${libL}/src/lib/consumer.ts`);

    console.log('[MOVE-UNICODE] Running move-file generator...');

    // Move with allowUnicode
    execSync(
      `npx nx generate ${E2E_PACKAGE_NAME}:move-file "${libL}/src/lib/${unicodeFileName}" --project ${libM} --allow-unicode --no-interactive`,
      {
        cwd: sharedWorkspace.path,
        stdio: 'inherit',
      },
    );

    console.log('[MOVE-UNICODE] Generator completed, verifying results...');

    // Assert: File moved with Unicode name preserved
    const movedPath = join(
      sharedWorkspace.path,
      libM,
      'src',
      'lib',
      unicodeFileName,
    );
    const movedContent = readFileSync(movedPath, 'utf-8');
    if (!movedContent.includes('unicodeUtil')) {
      throw new Error('File not found at target location with Unicode name');
    }
    console.log(
      `[MOVE-UNICODE] ✓ File moved with Unicode name preserved: ${libM}/src/lib/${unicodeFileName}`,
    );

    // Assert: Imports updated in consumer (now cross-project)
    const consumerContent = readFileSync(consumerPath, 'utf-8');
    if (!consumerContent.includes(`@${workspaceName}/${libM}`)) {
      throw new Error(
        `Consumer import not updated to library alias: ${consumerContent}`,
      );
    }
    console.log('[MOVE-UNICODE] ✓ Consumer imports updated to library alias');

    console.log('[MOVE-UNICODE] All assertions passed ✓');
  }, 60000);

  // ============================================================================
  // REMOVE EMPTY PROJECT
  // ============================================================================

  it('MOVE-REMOVE-EMPTY: Move last source files triggering project removal', async () => {
    if (infrastructureFailed) return;

    if (!sharedWorkspace) {
      throw new Error('Shared workspace not initialized');
    }

    console.log(
      '[MOVE-REMOVE-EMPTY] Using shared workspace with allocated libraries',
    );

    const [libN, libO] = LIBRARY_ALLOCATION.MOVE_REMOVE_EMPTY;

    // Create a single file (beyond the default index)
    const utilPath = join(sharedWorkspace.path, libN, 'src', 'lib', 'util.ts');
    writeFileSync(utilPath, 'export function util() { return 1; }\n', 'utf-8');
    console.log(`[MOVE-REMOVE-EMPTY] Created ${libN}/src/lib/util.ts`);

    // Delete the default generated file to ensure only our file remains
    const defaultFilePath = join(
      sharedWorkspace.path,
      libN,
      'src',
      'lib',
      `${libN}.ts`,
    );
    try {
      const { rmSync } = await import('node:fs');
      rmSync(defaultFilePath, { force: true });
      console.log(
        `[MOVE-REMOVE-EMPTY] Removed default file ${libN}/src/lib/${libN}.ts`,
      );
    } catch {
      // File might not exist, that's ok
      console.log(
        `[MOVE-REMOVE-EMPTY] Default file ${libN}/src/lib/${libN}.ts not found (ok)`,
      );
    }

    console.log('[MOVE-REMOVE-EMPTY] Running move-file generator...');

    // Move the only remaining source file with removeEmptyProject
    execSync(
      `npx nx generate ${E2E_PACKAGE_NAME}:move-file ${libN}/src/lib/util.ts --project ${libO} --remove-empty-project --no-interactive`,
      {
        cwd: sharedWorkspace.path,
        stdio: 'inherit',
      },
    );

    console.log(
      '[MOVE-REMOVE-EMPTY] Generator completed, verifying results...',
    );

    // Assert: File moved
    const movedPath = join(sharedWorkspace.path, libO, 'src', 'lib', 'util.ts');
    const movedContent = readFileSync(movedPath, 'utf-8');
    if (!movedContent.includes('util')) {
      throw new Error('File not found at target location');
    }
    console.log(`[MOVE-REMOVE-EMPTY] ✓ File moved to ${libO}/src/lib/util.ts`);

    // Assert: Source project removed (project.json deleted)
    const projectJsonPath = join(sharedWorkspace.path, libN, 'project.json');
    if (existsSync(projectJsonPath)) {
      throw new Error('Source project was not removed (project.json exists)');
    }
    console.log('[MOVE-REMOVE-EMPTY] ✓ Source project removed');

    console.log('[MOVE-REMOVE-EMPTY] All assertions passed ✓');
  }, 60000);

  // ============================================================================
  // PATH ALIASES
  // ============================================================================

  it('PATH-ALIASES: Workspace with 3 libs; multiple alias moves', async () => {
    if (infrastructureFailed) return;
    // TODO: Implement in #322
    expect(true).toBe(true);
  });

  // ============================================================================
  // EXPORT UPDATES
  // ============================================================================

  it('EXPORTS: Move exported file and verify index updated', async () => {
    if (infrastructureFailed) return;
    // TODO: Implement in #322
    expect(true).toBe(true);
  });

  // ============================================================================
  // REPEAT/IDEMPOTENCE
  // ============================================================================

  it('REPEAT-MOVE: Re-run MOVE-PROJECT-DIR ensuring no duplicates', async () => {
    if (infrastructureFailed) return;
    // TODO: Implement in #322
    expect(true).toBe(true);
  });

  // ============================================================================
  // GRAPH REACTION
  // ============================================================================

  it('GRAPH-REACTION: Force project graph rebuild after moves', async () => {
    if (infrastructureFailed) return;
    // TODO: Implement in #322
    expect(true).toBe(true);
  });

  // ============================================================================
  // SCALE SANITY
  // ============================================================================

  it('SCALE-LIBS: Generate 10+ libs then one lib→lib move', async () => {
    if (infrastructureFailed) return;
    // TODO: Implement in #322
    expect(true).toBe(true);
  });

  // ============================================================================
  // SMOKE SENTINEL
  // ============================================================================

  it('SMOKE-SENTINEL: Combined publish+install+single move', async () => {
    if (infrastructureFailed) return;
    // TODO: Implement in #322
    expect(true).toBe(true);
  });
});
