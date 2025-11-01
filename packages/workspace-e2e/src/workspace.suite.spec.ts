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
import { writeFileSync } from 'node:fs';
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
    const { existsSync, readFileSync } = await import('node:fs');
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
    const { existsSync, readFileSync } = await import('node:fs');
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
    // TODO: Implement in #322
    expect(true).toBe(true);
  });

  // ============================================================================
  // DERIVE DIRECTORY
  // ============================================================================

  it('MOVE-DERIVE-DIR: Move with deriveProjectDirectory=true', async () => {
    if (infrastructureFailed) return;
    // TODO: Implement in #322
    expect(true).toBe(true);
  });

  // ============================================================================
  // SKIP EXPORT
  // ============================================================================

  it('MOVE-SKIP-EXPORT: Move exported file with skipExport flag', async () => {
    if (infrastructureFailed) return;
    // TODO: Implement in #322
    expect(true).toBe(true);
  });

  // ============================================================================
  // SKIP FORMAT
  // ============================================================================

  it('MOVE-SKIP-FORMAT: Move file with skipFormat=true', async () => {
    if (infrastructureFailed) return;
    // TODO: Implement in #322
    expect(true).toBe(true);
  });

  // ============================================================================
  // ALLOW UNICODE
  // ============================================================================

  it('MOVE-UNICODE: Move file with Unicode characters in path', async () => {
    if (infrastructureFailed) return;
    // TODO: Implement in #322
    expect(true).toBe(true);
  });

  // ============================================================================
  // REMOVE EMPTY PROJECT
  // ============================================================================

  it('MOVE-REMOVE-EMPTY: Move last source files triggering project removal', async () => {
    if (infrastructureFailed) return;
    // TODO: Implement in #322
    expect(true).toBe(true);
  });

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
