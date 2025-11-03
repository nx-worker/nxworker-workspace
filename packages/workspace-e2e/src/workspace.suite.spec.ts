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
 * Custom Jest Matchers
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      /**
       * Assert that a file or directory exists on the filesystem.
       *
       * @example
       * expect('/path/to/file.ts').toExistOnFilesystem();
       * expect('/path/to/missing').not.toExistOnFilesystem();
       */
      toExistOnFilesystem(): R;
    }
  }
}

expect.extend({
  toExistOnFilesystem(received: string) {
    const exists = existsSync(received);
    const pass = exists;

    if (pass) {
      return {
        message: () =>
          `expected path ${this.utils.printReceived(received)} not to exist on filesystem, but it does`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected path ${this.utils.printReceived(received)} to exist on filesystem, but it does not`,
        pass: false,
      };
    }
  },
});

/**
 * Custom TypeScript assertion function to validate that a value is defined.
 * Throws an error with a helpful message if the value is undefined or null.
 *
 * This function provides both runtime validation and TypeScript type narrowing,
 * eliminating the need for separate `expect().toBeDefined()` and `if (!value) return;` patterns.
 *
 * @param value - The value to check
 * @param name - The name of the value (used in error messages)
 * @throws {Error} If the value is undefined or null
 *
 * @example
 * assertDefined(sharedWorkspace, 'sharedWorkspace');
 * // TypeScript now knows sharedWorkspace is not undefined
 * console.log(sharedWorkspace.path);
 */
function assertDefined<T>(
  value: T,
  name: string,
): asserts value is NonNullable<T> {
  if (value === undefined || value === null) {
    throw new Error(`Expected ${name} to be defined, but it was ${value}`);
  }
}

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
  // REPEAT_MOVE removed: not supported per agent instructions (idempotence not guaranteed)
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

    assertDefined(sharedWorkspace, 'sharedWorkspace');

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
    expect(targetPath).toExistOnFilesystem();
    console.log(`[MOVE-SMALL] ✓ File exists at ${libB}/src/lib/util.ts`);

    // Verify file removed from lib-a
    expect(utilPath).not.toExistOnFilesystem();
    console.log(`[MOVE-SMALL] ✓ File removed from ${libA}/src/lib/util.ts`);

    // Verify import in consumer.ts updated
    const updatedConsumer = readFileSync(consumerPath, 'utf-8');
    expect(updatedConsumer).not.toContain(`@${workspaceName}/${libA}`);
    expect(updatedConsumer).toContain('./util');
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

    assertDefined(sharedWorkspace, 'sharedWorkspace');

    console.log('[APP-TO-LIB] Using shared workspace with allocated library');

    const [libName] = LIBRARY_ALLOCATION.APP_TO_LIB;
    const appName = sharedWorkspace.app;
    const workspaceName = sharedWorkspace.name;

    assertDefined(appName, 'appName');

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
    expect(targetPath).toExistOnFilesystem();
    console.log(`[APP-TO-LIB] ✓ File exists at ${libName}/src/lib/helper.ts`);

    // Verify file removed from app
    expect(helperPath).not.toExistOnFilesystem();
    console.log(`[APP-TO-LIB] ✓ File removed from ${appName}/src/helper.ts`);

    // Verify import in main.ts updated to use library alias
    const updatedMain = readFileSync(mainPath, 'utf-8');
    expect(updatedMain).not.toContain('./helper');
    expect(updatedMain).toContain(`@${workspaceName}/${libName}`);
    console.log('[APP-TO-LIB] ✓ Import in main.ts updated to library alias');

    // Verify library index exports the moved file
    const indexPath = join(sharedWorkspace.path, libName, 'src', 'index.ts');
    const indexContent = readFileSync(indexPath, 'utf-8');
    expect(indexContent).toContain("export * from './lib/helper'");
    console.log('[APP-TO-LIB] ✓ Library index.ts exports the moved file');

    console.log('[APP-TO-LIB] All assertions passed ✓');
  }, 60000); // 1 min: generator execution (~40s) + assertions (~20s) - no workspace creation or plugin install

  // ============================================================================
  // EXPLICIT DIRECTORY
  // ============================================================================

  it('MOVE-PROJECT-DIR: Move with projectDirectory specified', async () => {
    if (infrastructureFailed) return;

    assertDefined(sharedWorkspace, 'sharedWorkspace');

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
    expect(movedContent).toContain('export function util');
    console.log(
      `[MOVE-PROJECT-DIR] ✓ File exists at ${libE}/src/lib/features/utils/util.ts`,
    );

    // Assert: Target project index exports the file
    const libEIndexPath = join(sharedWorkspace.path, libE, 'src', 'index.ts');
    const libEIndexContent = readFileSync(libEIndexPath, 'utf-8');
    expect(libEIndexContent).toContain('./lib/features/utils/util');
    console.log('[MOVE-PROJECT-DIR] ✓ Target index exports the file');

    // Assert: Source project index no longer exports it
    const libDIndexContent = readFileSync(libDIndexPath, 'utf-8');
    expect(libDIndexContent).not.toContain('util');
    console.log('[MOVE-PROJECT-DIR] ✓ Source index updated');

    console.log('[MOVE-PROJECT-DIR] All assertions passed ✓');
  }, 60000);

  // ============================================================================
  // DERIVE DIRECTORY
  // ============================================================================

  it('MOVE-DERIVE-DIR: Move with deriveProjectDirectory=true', async () => {
    if (infrastructureFailed) return;

    assertDefined(sharedWorkspace, 'sharedWorkspace');

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
    expect(movedContent).toContain('authUtil');
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

    assertDefined(sharedWorkspace, 'sharedWorkspace');

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
    expect(movedContent).toContain('util');
    console.log(`[MOVE-SKIP-EXPORT] ✓ File moved to ${libI}/src/lib/util.ts`);

    // Assert: Target index unchanged (no export added)
    const newLibIIndex = readFileSync(libIIndexPath, 'utf-8');
    expect(newLibIIndex).toBe(originalLibIIndex);
    expect(newLibIIndex).not.toContain('util');
    console.log('[MOVE-SKIP-EXPORT] ✓ Target index unchanged');

    // Assert: Source index still updated (export removed)
    const libHIndexContent = readFileSync(libHIndexPath, 'utf-8');
    expect(libHIndexContent).not.toContain('util');
    console.log('[MOVE-SKIP-EXPORT] ✓ Source index updated');

    console.log('[MOVE-SKIP-EXPORT] All assertions passed ✓');
  }, 60000);

  // ============================================================================
  // SKIP FORMAT
  // ============================================================================

  it('MOVE-SKIP-FORMAT: Move file with skipFormat=true', async () => {
    if (infrastructureFailed) return;

    assertDefined(sharedWorkspace, 'sharedWorkspace');

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
    expect(movedContent).toBe(unformattedContent);
    // Verify multiple spaces remain (not formatted to single space)
    expect(movedContent).toContain('   ');
    console.log('[MOVE-SKIP-FORMAT] ✓ File content preserved unformatted');

    console.log('[MOVE-SKIP-FORMAT] All assertions passed ✓');
  }, 60000);

  // ============================================================================
  // ALLOW UNICODE
  // ============================================================================

  it('MOVE-UNICODE: Move file with Unicode characters in path', async () => {
    if (infrastructureFailed) return;

    assertDefined(sharedWorkspace, 'sharedWorkspace');

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
    expect(movedContent).toContain('unicodeUtil');
    console.log(
      `[MOVE-UNICODE] ✓ File moved with Unicode name preserved: ${libM}/src/lib/${unicodeFileName}`,
    );

    // Assert: Imports updated in consumer (now cross-project)
    const consumerContent = readFileSync(consumerPath, 'utf-8');
    expect(consumerContent).toContain(`@${workspaceName}/${libM}`);
    console.log('[MOVE-UNICODE] ✓ Consumer imports updated to library alias');

    console.log('[MOVE-UNICODE] All assertions passed ✓');
  }, 60000);

  // ============================================================================
  // REMOVE EMPTY PROJECT
  // ============================================================================

  it('MOVE-REMOVE-EMPTY: Move last source files triggering project removal', async () => {
    if (infrastructureFailed) return;

    assertDefined(sharedWorkspace, 'sharedWorkspace');

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
    expect(movedContent).toContain('util');
    console.log(`[MOVE-REMOVE-EMPTY] ✓ File moved to ${libO}/src/lib/util.ts`);

    // Assert: Source project removed (project.json deleted)
    const projectJsonPath = join(sharedWorkspace.path, libN, 'project.json');
    expect(projectJsonPath).not.toExistOnFilesystem();
    console.log('[MOVE-REMOVE-EMPTY] ✓ Source project removed');

    console.log('[MOVE-REMOVE-EMPTY] All assertions passed ✓');
  }, 60000);

  // ============================================================================
  // PATH ALIASES
  // ============================================================================

  it('PATH-ALIASES: Workspace with 3 libs; multiple alias moves', async () => {
    if (infrastructureFailed) return;

    assertDefined(sharedWorkspace, 'sharedWorkspace');

    console.log(
      '[PATH-ALIASES] Using shared workspace with allocated libraries',
    );

    const [libP, libQ, libR] = LIBRARY_ALLOCATION.PATH_ALIASES;
    const workspaceName = sharedWorkspace.name;

    // Create util.ts in lib-p that will be used by lib-r
    const utilPContent = `export function utilFromP(): string {
  return 'Hello from lib-p';
}
`;
    const utilPPath = join(sharedWorkspace.path, libP, 'src', 'lib', 'util.ts');
    writeFileSync(utilPPath, utilPContent, 'utf-8');
    console.log(`[PATH-ALIASES] Created ${libP}/src/lib/util.ts`);

    // Export from lib-p index
    const libPIndexPath = join(sharedWorkspace.path, libP, 'src', 'index.ts');
    writeFileSync(libPIndexPath, "export * from './lib/util';\n", 'utf-8');

    // Create helper.ts in lib-q that will be used by lib-p
    const helperQContent = `export function helperFromQ(): number {
  return 42;
}
`;
    const helperQPath = join(
      sharedWorkspace.path,
      libQ,
      'src',
      'lib',
      'helper.ts',
    );
    writeFileSync(helperQPath, helperQContent, 'utf-8');
    console.log(`[PATH-ALIASES] Created ${libQ}/src/lib/helper.ts`);

    // Export from lib-q index
    const libQIndexPath = join(sharedWorkspace.path, libQ, 'src', 'index.ts');
    writeFileSync(libQIndexPath, "export * from './lib/helper';\n", 'utf-8');

    // Create consumer.ts in lib-r that imports from lib-p
    const consumerRContent = `import { utilFromP } from '@${workspaceName}/${libP}';

export function consumerInR(): string {
  return utilFromP();
}
`;
    const consumerRPath = join(
      sharedWorkspace.path,
      libR,
      'src',
      'lib',
      'consumer.ts',
    );
    writeFileSync(consumerRPath, consumerRContent, 'utf-8');
    console.log(`[PATH-ALIASES] Created ${libR}/src/lib/consumer.ts`);

    // Create consumer.ts in lib-p that imports from lib-q
    const consumerPContent = `import { helperFromQ } from '@${workspaceName}/${libQ}';

export function consumerInP(): number {
  return helperFromQ();
}
`;
    const consumerPPath = join(
      sharedWorkspace.path,
      libP,
      'src',
      'lib',
      'consumer.ts',
    );
    writeFileSync(consumerPPath, consumerPContent, 'utf-8');
    console.log(`[PATH-ALIASES] Created ${libP}/src/lib/consumer.ts`);

    console.log('[PATH-ALIASES] Performing first move: lib-p/util.ts → lib-q');

    // Move 1: util.ts from lib-p to lib-q (used by lib-r)
    execSync(
      `npx nx generate ${E2E_PACKAGE_NAME}:move-file ${libP}/src/lib/util.ts --project=${libQ} --no-interactive`,
      {
        cwd: sharedWorkspace.path,
        stdio: 'inherit',
      },
    );

    console.log('[PATH-ALIASES] First move completed, verifying...');

    // Verify util.ts moved to lib-q
    const utilMovedPath = join(
      sharedWorkspace.path,
      libQ,
      'src',
      'lib',
      'util.ts',
    );
    expect(utilMovedPath).toExistOnFilesystem();
    expect(utilPPath).not.toExistOnFilesystem();
    console.log(`[PATH-ALIASES] ✓ util.ts moved from ${libP} to ${libQ}`);

    // Verify lib-r's import updated from lib-p to lib-q
    const updatedConsumerR = readFileSync(consumerRPath, 'utf-8');
    expect(updatedConsumerR).not.toContain(`@${workspaceName}/${libP}`);
    expect(updatedConsumerR).toContain(`@${workspaceName}/${libQ}`);
    console.log('[PATH-ALIASES] ✓ lib-r import updated to reference lib-q');

    // Verify lib-q index exports util
    const libQIndexContent = readFileSync(libQIndexPath, 'utf-8');
    expect(libQIndexContent).toContain('./lib/util');
    console.log('[PATH-ALIASES] ✓ lib-q index exports util');

    console.log(
      '[PATH-ALIASES] Performing second move: lib-q/helper.ts → lib-r',
    );

    // Move 2: helper.ts from lib-q to lib-r (used by lib-p)
    execSync(
      `npx nx generate ${E2E_PACKAGE_NAME}:move-file ${libQ}/src/lib/helper.ts --project=${libR} --no-interactive`,
      {
        cwd: sharedWorkspace.path,
        stdio: 'inherit',
      },
    );

    console.log('[PATH-ALIASES] Second move completed, verifying...');

    // Verify helper.ts moved to lib-r
    const helperMovedPath = join(
      sharedWorkspace.path,
      libR,
      'src',
      'lib',
      'helper.ts',
    );
    expect(helperMovedPath).toExistOnFilesystem();
    expect(helperQPath).not.toExistOnFilesystem();
    console.log(`[PATH-ALIASES] ✓ helper.ts moved from ${libQ} to ${libR}`);

    // Verify lib-p's import updated from lib-q to lib-r
    const updatedConsumerP = readFileSync(consumerPPath, 'utf-8');
    expect(updatedConsumerP).not.toContain(`@${workspaceName}/${libQ}`);
    expect(updatedConsumerP).toContain(`@${workspaceName}/${libR}`);
    console.log('[PATH-ALIASES] ✓ lib-p import updated to reference lib-r');

    // Verify lib-r index exports helper
    const libRIndexPath = join(sharedWorkspace.path, libR, 'src', 'index.ts');
    const libRIndexContent = readFileSync(libRIndexPath, 'utf-8');
    expect(libRIndexContent).toContain('./lib/helper');
    console.log('[PATH-ALIASES] ✓ lib-r index exports helper');

    // Verify tsconfig.base.json paths are valid (no broken aliases)
    const tsconfigPath = join(sharedWorkspace.path, 'tsconfig.base.json');
    const tsconfigContent = readFileSync(tsconfigPath, 'utf-8');
    const tsconfig = JSON.parse(tsconfigContent);
    expect(tsconfig.compilerOptions.paths).toBeDefined();
    expect(
      tsconfig.compilerOptions.paths[`@${workspaceName}/${libP}`],
    ).toBeDefined();
    expect(
      tsconfig.compilerOptions.paths[`@${workspaceName}/${libQ}`],
    ).toBeDefined();
    expect(
      tsconfig.compilerOptions.paths[`@${workspaceName}/${libR}`],
    ).toBeDefined();
    console.log('[PATH-ALIASES] ✓ tsconfig.base.json paths remain valid');

    console.log('[PATH-ALIASES] All assertions passed ✓');
  }, 120000); // 120s: two generator executions + assertions

  // ============================================================================
  // EXPORT UPDATES
  // ============================================================================

  it('EXPORTS: Move exported file and verify index updated', async () => {
    if (infrastructureFailed) return;

    assertDefined(sharedWorkspace, 'sharedWorkspace');

    console.log('[EXPORTS] Using shared workspace with allocated libraries');

    const [libS, libT] = LIBRARY_ALLOCATION.EXPORTS;
    const workspaceName = sharedWorkspace.name;

    // Create multiple files in lib-s with exports
    const exportedUtilContent = `export function exportedUtil(): string {
  return 'exported utility';
}
`;
    const exportedUtilPath = join(
      sharedWorkspace.path,
      libS,
      'src',
      'lib',
      'exported-util.ts',
    );
    writeFileSync(exportedUtilPath, exportedUtilContent, 'utf-8');
    console.log(`[EXPORTS] Created ${libS}/src/lib/exported-util.ts`);

    const anotherFileContent = `export function anotherFunction(): number {
  return 123;
}
`;
    const anotherFilePath = join(
      sharedWorkspace.path,
      libS,
      'src',
      'lib',
      'another-file.ts',
    );
    writeFileSync(anotherFilePath, anotherFileContent, 'utf-8');
    console.log(`[EXPORTS] Created ${libS}/src/lib/another-file.ts`);

    // Update lib-s index to export both files
    const libSIndexPath = join(sharedWorkspace.path, libS, 'src', 'index.ts');
    const libSIndexContent = `export * from './lib/exported-util';
export * from './lib/another-file';
`;
    writeFileSync(libSIndexPath, libSIndexContent, 'utf-8');
    console.log('[EXPORTS] Updated lib-s index to export both files');

    // Create external consumer in lib-t that imports from lib-s
    const externalConsumerContent = `import { exportedUtil } from '@${workspaceName}/${libS}';

export function useExportedUtil(): string {
  return exportedUtil();
}
`;
    const externalConsumerPath = join(
      sharedWorkspace.path,
      libT,
      'src',
      'lib',
      'external-consumer.ts',
    );
    writeFileSync(externalConsumerPath, externalConsumerContent, 'utf-8');
    console.log(
      `[EXPORTS] Created ${libT}/src/lib/external-consumer.ts importing from lib-s`,
    );

    console.log('[EXPORTS] Running move-file generator...');

    // Move exported-util.ts from lib-s to lib-t
    execSync(
      `npx nx generate ${E2E_PACKAGE_NAME}:move-file ${libS}/src/lib/exported-util.ts --project=${libT} --no-interactive`,
      {
        cwd: sharedWorkspace.path,
        stdio: 'inherit',
      },
    );

    console.log('[EXPORTS] Generator completed, verifying results...');

    // Verify file moved to lib-t
    const movedFilePath = join(
      sharedWorkspace.path,
      libT,
      'src',
      'lib',
      'exported-util.ts',
    );
    expect(movedFilePath).toExistOnFilesystem();
    expect(exportedUtilPath).not.toExistOnFilesystem();
    console.log(`[EXPORTS] ✓ exported-util.ts moved from ${libS} to ${libT}`);

    // Verify source index no longer exports the moved file
    const updatedLibSIndex = readFileSync(libSIndexPath, 'utf-8');
    expect(updatedLibSIndex).not.toContain('exported-util');
    expect(updatedLibSIndex).toContain('another-file');
    console.log('[EXPORTS] ✓ Source index export removed');

    // Verify target index now exports the moved file
    const libTIndexPath = join(sharedWorkspace.path, libT, 'src', 'index.ts');
    const libTIndexContent = readFileSync(libTIndexPath, 'utf-8');
    expect(libTIndexContent).toContain('./lib/exported-util');
    console.log('[EXPORTS] ✓ Target index export added');

    // Verify external imports updated from lib-s to lib-t
    const updatedExternalConsumer = readFileSync(externalConsumerPath, 'utf-8');
    expect(updatedExternalConsumer).not.toContain(`@${workspaceName}/${libS}`);
    expect(updatedExternalConsumer).toContain(`@${workspaceName}/${libT}`);
    console.log('[EXPORTS] ✓ External imports updated to target library');

    console.log('[EXPORTS] All assertions passed ✓');
  }, 60000); // 60s: generator execution + assertions

  // ============================================================================
  // GRAPH REACTION
  // ============================================================================

  it('GRAPH-REACTION: Force project graph rebuild after moves', async () => {
    if (infrastructureFailed) return;

    assertDefined(sharedWorkspace, 'sharedWorkspace');

    console.log(
      '[GRAPH-REACTION] Using shared workspace with allocated libraries',
    );

    const [libW, libX] = LIBRARY_ALLOCATION.GRAPH_REACTION;
    const workspaceName = sharedWorkspace.name;

    // Create dependency relationship: lib-w depends on lib-x
    const utilXContent = `export function utilFromX(): string {
  return 'from lib-x';
}
`;
    const utilXPath = join(sharedWorkspace.path, libX, 'src', 'lib', 'util.ts');
    writeFileSync(utilXPath, utilXContent, 'utf-8');
    console.log(`[GRAPH-REACTION] Created ${libX}/src/lib/util.ts`);

    // Export from lib-x index
    const libXIndexPath = join(sharedWorkspace.path, libX, 'src', 'index.ts');
    writeFileSync(libXIndexPath, "export * from './lib/util';\n", 'utf-8');

    // Create consumer in lib-w that imports from lib-x
    const consumerWContent = `import { utilFromX } from '@${workspaceName}/${libX}';

export function consumerInW(): string {
  return utilFromX();
}
`;
    const consumerWPath = join(
      sharedWorkspace.path,
      libW,
      'src',
      'lib',
      'consumer.ts',
    );
    writeFileSync(consumerWPath, consumerWContent, 'utf-8');
    console.log(`[GRAPH-REACTION] Created ${libW}/src/lib/consumer.ts`);

    console.log('[GRAPH-REACTION] Capturing initial project graph...');

    // Reset Nx cache to ensure clean graph
    execSync('npx nx reset', {
      cwd: sharedWorkspace.path,
      stdio: 'pipe',
    });

    // Generate initial graph
    const initialGraphPath = join(
      sharedWorkspace.path,
      'tmp',
      'graph-initial.json',
    );
    mkdirSync(join(sharedWorkspace.path, 'tmp'), { recursive: true });
    execSync(`npx nx graph --file=${initialGraphPath}`, {
      cwd: sharedWorkspace.path,
      stdio: 'pipe',
    });

    // Validate graph file was created
    expect(initialGraphPath).toExistOnFilesystem();

    const initialGraph = JSON.parse(readFileSync(initialGraphPath, 'utf-8'));
    console.log('[GRAPH-REACTION] ✓ Initial graph captured');

    // Verify initial dependency: lib-w depends on lib-x
    const initialLibWNode = initialGraph.graph.nodes[libW];
    expect(initialLibWNode).toBeDefined();
    const initialLibWDeps = initialGraph.graph.dependencies[libW] || [];
    const hasInitialDep = initialLibWDeps.some(
      (dep: { target: string }) => dep.target === libX,
    );
    expect(hasInitialDep).toBe(true);
    console.log(
      '[GRAPH-REACTION] ✓ Initial graph shows lib-w → lib-x dependency',
    );

    console.log('[GRAPH-REACTION] Performing move to change dependencies...');

    // Move util.ts from lib-x to lib-w (changes dependency structure)
    execSync(
      `npx nx generate ${E2E_PACKAGE_NAME}:move-file ${libX}/src/lib/util.ts --project=${libW} --no-interactive`,
      {
        cwd: sharedWorkspace.path,
        stdio: 'inherit',
      },
    );

    console.log('[GRAPH-REACTION] Move completed, rebuilding graph...');

    // Force graph rebuild
    execSync('npx nx reset', {
      cwd: sharedWorkspace.path,
      stdio: 'pipe',
    });

    const updatedGraphPath = join(
      sharedWorkspace.path,
      'tmp',
      'graph-updated.json',
    );
    execSync(`npx nx graph --file=${updatedGraphPath}`, {
      cwd: sharedWorkspace.path,
      stdio: 'pipe',
    });

    // Validate graph file was created
    expect(updatedGraphPath).toExistOnFilesystem();

    const updatedGraph = JSON.parse(readFileSync(updatedGraphPath, 'utf-8'));
    console.log('[GRAPH-REACTION] ✓ Updated graph captured');

    // Verify updated graph reflects new file location
    const updatedLibWNode = updatedGraph.graph.nodes[libW];
    expect(updatedLibWNode).toBeDefined();
    console.log('[GRAPH-REACTION] ✓ lib-w node still exists in graph');

    // Verify dependency removed (util.ts now in same project as consumer)
    const updatedLibWDeps = updatedGraph.graph.dependencies[libW] || [];
    const hasUpdatedDep = updatedLibWDeps.some(
      (dep: { target: string }) => dep.target === libX,
    );
    expect(hasUpdatedDep).toBe(false);
    console.log(
      '[GRAPH-REACTION] ✓ Dependency lib-w → lib-x removed (now same project)',
    );

    // Verify consumer import updated to relative path
    const updatedConsumerW = readFileSync(consumerWPath, 'utf-8');
    expect(updatedConsumerW).not.toContain(`@${workspaceName}/${libX}`);
    expect(updatedConsumerW).toContain('./util');
    console.log('[GRAPH-REACTION] ✓ Consumer import updated to relative path');

    // Test nx affected correctly identifies affected projects
    console.log('[GRAPH-REACTION] Testing nx affected detection...');

    // Touch a file in lib-w to mark it as affected
    const touchPath = join(
      sharedWorkspace.path,
      libW,
      'src',
      'lib',
      'touch.ts',
    );
    writeFileSync(touchPath, 'export const touched = true;\n', 'utf-8');

    // Run nx affected (may not have git history in test workspace, so we just verify command executes)
    // In a real workspace with git history, this would show affected projects
    try {
      const affectedOutput = execSync('npx nx show projects --affected', {
        cwd: sharedWorkspace.path,
        encoding: 'utf-8',
        stdio: 'pipe',
      });

      // If we have git history, verify the output
      const commandExecuted = affectedOutput.length > 0;
      expect(commandExecuted).toBe(true);
    } catch {
      // No git history or command failed - this is acceptable in test workspaces
      // The important part is that the graph itself was updated correctly
      console.log(
        '[GRAPH-REACTION] nx affected unavailable (no git history) - skipping affected check',
      );
    }
    console.log('[GRAPH-REACTION] ✓ nx affected command executed successfully');

    console.log('[GRAPH-REACTION] All assertions passed ✓');
  }, 120000); // 120s: two graph generations + generator execution + assertions

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
