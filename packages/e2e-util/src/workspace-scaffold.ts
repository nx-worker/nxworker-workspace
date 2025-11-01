/**
 * Workspace Scaffold Helper
 *
 * Creates minimal Nx workspaces with configurable libraries and optional applications
 * for e2e testing scenarios.
 */

import { execSync, spawn } from 'node:child_process';
import { join, dirname } from 'node:path/posix';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { uniqueId } from '@internal/test-util';
import { logger } from '@nx/devkit';
import { withRetry } from './retry-utils';

/**
 * Execute command asynchronously for parallel execution
 *
 * @param command Command to execute
 * @param cwd Working directory
 * @returns Promise that resolves when command completes
 */
function execAsync(command: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: 'pipe', // Capture output for error reporting
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        const errorOutput = stderr || stdout || 'No error output';
        reject(
          new Error(
            `Command "${command}" failed with exit code ${code}:\n${errorOutput}`,
          ),
        );
      }
    });

    child.on('error', (error) => {
      reject(
        new Error(`Failed to spawn command "${command}": ${error.message}`),
      );
    });
  });
}

export interface WorkspaceConfig {
  /**
   * Name of the workspace (will be prefixed with 'test-workspace-' and a unique ID)
   */
  name?: string;

  /**
   * Number of libraries to generate (default: 2)
   */
  libs?: number;

  /**
   * Whether to include an application (default: false)
   */
  includeApp?: boolean;

  /**
   * Nx version to use (e.g., 19, 20, 21). If not provided, uses workspace version.
   */
  nxVersion?: number;

  /**
   * Base directory for temp workspaces (default: './tmp')
   */
  baseDir?: string;

  /**
   * Prefix for generated library names (default: 'lib')
   * Example: libPrefix 'scenario' generates: scenario-a, scenario-b, etc.
   */
  libPrefix?: string;
}

export interface WorkspaceInfo {
  /**
   * Full path to the workspace directory
   */
  path: string;

  /**
   * Workspace name
   */
  name: string;

  /**
   * Array of generated library names
   */
  libs: string[];

  /**
   * Application name if includeApp was true
   */
  app?: string;
}

/**
 * Creates a test workspace with the specified configuration
 *
 * Features:
 * - Scaffolds minimal Nx workspace using npx create-nx-workspace with pinned version
 * - Generates libraries with deterministic names (lib-a, lib-b, etc.)
 * - Optionally creates an application
 * - Uses short paths and unique seeding via uniqueId
 * - Supports Nx version pinning
 *
 * @param config Workspace configuration
 * @returns Promise that resolves to workspace information
 *
 * @example
 * ```typescript
 * const workspace = await createWorkspace({
 *   libs: 2,
 *   includeApp: false,
 * });
 * console.log('Workspace created at:', workspace.path);
 * console.log('Libraries:', workspace.libs);
 * ```
 */
export async function createWorkspace(
  config: WorkspaceConfig = {},
): Promise<WorkspaceInfo> {
  const {
    name = `test-workspace-${uniqueId()}`,
    libs = 2,
    includeApp = false,
    nxVersion,
    baseDir = './tmp',
    libPrefix = 'lib',
  } = config;

  logger.verbose(
    `Creating workspace "${name}" with ${libs} libraries${includeApp ? ' and 1 app' : ''}...`,
  );

  // Determine workspace path (use short paths for Windows compatibility)
  const workspacePath = join(process.cwd(), baseDir, name);
  const workspaceParentDir = dirname(workspacePath);

  logger.verbose(`Workspace path: ${workspacePath}`);

  // Ensure parent directory exists
  mkdirSync(workspaceParentDir, { recursive: true });

  // Determine Nx version to use
  let versionSpec: string;
  if (nxVersion) {
    versionSpec = `^${nxVersion}.0.0`;
    logger.verbose(`Using Nx version: ${nxVersion}.x`);
  } else {
    // Get workspace Nx version from root package.json
    const rootPackageJsonPath = join(process.cwd(), 'package.json');
    const rootPackageJson = JSON.parse(
      readFileSync(rootPackageJsonPath, 'utf-8'),
    );
    versionSpec =
      rootPackageJson.devDependencies?.nx || rootPackageJson.dependencies?.nx;

    if (!versionSpec) {
      throw new Error('Could not determine workspace Nx version');
    }
    logger.verbose(`Using workspace Nx version: ${versionSpec}`);
  }

  // Create workspace using create-nx-workspace with retry logic
  logger.verbose(`Running create-nx-workspace@${versionSpec}...`);
  await withRetry(
    async () => {
      execSync(
        `npx --prefer-offline create-nx-workspace@${versionSpec} ${name} --preset apps --nxCloud=skip --no-interactive`,
        {
          cwd: workspaceParentDir,
          stdio: 'inherit',
          env: process.env,
        },
      );
    },
    {
      maxAttempts: 3,
      delayMs: 2000,
      operationName: `create workspace "${name}"`,
    },
  );

  logger.verbose(`Workspace created at ${workspacePath}`);

  // Generate libraries in batches with async infrastructure
  const libNames: string[] = [];
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  // CONCURRENCY=4 enables parallel library generation. Multiple Nx generators will
  // race to modify tsconfig.base.json, causing corruption. We fix this by calling
  // rebuildTsConfigPaths() after generation completes to deterministically reconstruct
  // all path mappings. This achieves ~70% speedup vs sequential generation.
  const CONCURRENCY = 4;

  // Pre-calculate all library names using the configured prefix
  for (let i = 0; i < libs; i++) {
    const libName = `${libPrefix}-${alphabet[i % alphabet.length]}${i >= alphabet.length ? Math.floor(i / alphabet.length) : ''}`;
    libNames.push(libName);
  }

  logger.verbose(
    `Generating ${libs} libraries in parallel batches of ${CONCURRENCY}...`,
  );

  // Generate libraries in batches
  for (let i = 0; i < libs; i += CONCURRENCY) {
    const batch = libNames.slice(i, i + CONCURRENCY);
    logger.verbose(`Generating batch: ${batch.join(', ')}`);

    const batchPromises = batch.map((libName) =>
      withRetry(
        () =>
          execAsync(
            `npx nx generate @nx/js:library ${libName} --directory ${libName} --unitTestRunner=none --bundler=none --skipFormat --no-interactive`,
            workspacePath,
          ),
        {
          maxAttempts: 2,
          delayMs: 1000,
          operationName: `generate library ${libName}`,
        },
      ),
    );

    await Promise.all(batchPromises);
  }

  logger.verbose(`Generated ${libs} libraries: ${libNames.join(', ')}`);

  // Rebuild tsconfig.base.json paths to fix any corruption from parallel generation
  if (libs > 0) {
    rebuildTsConfigPaths(workspacePath, name, libNames);
  }

  // Generate application if requested
  let appName: string | undefined;
  if (includeApp) {
    appName = 'app-main';
    logger.verbose(`Generating application: ${appName}`);
    execSync(
      `npx nx generate @nx/node:application ${appName} --unitTestRunner=none --bundler=esbuild --no-interactive`,
      {
        cwd: workspacePath,
        stdio: 'inherit',
      },
    );
    logger.verbose(`Generated application: ${appName}`);

    // Rebuild paths again to include the application
    rebuildTsConfigPaths(workspacePath, name, libNames, appName);
  }

  logger.verbose(`Workspace "${name}" created successfully`);

  return {
    path: workspacePath,
    name,
    libs: libNames,
    app: appName,
  };
}

/**
 * Rebuilds TypeScript path mappings in tsconfig.base.json
 *
 * This function corrects path mappings that may be corrupted when multiple
 * Nx generators run in parallel and race to modify tsconfig.base.json.
 * It deterministically reconstructs the paths section based on the actual
 * libraries that were generated.
 *
 * @param workspacePath - Absolute path to workspace directory
 * @param workspaceName - Name of the workspace (used in path aliases)
 * @param libNames - Array of library names that were generated
 * @param appName - Optional application name if one was generated
 */
function rebuildTsConfigPaths(
  workspacePath: string,
  workspaceName: string,
  libNames: string[],
  appName?: string,
): void {
  const tsconfigPath = join(workspacePath, 'tsconfig.base.json');

  logger.verbose(
    `Rebuilding tsconfig.base.json paths for ${libNames.length} libraries...`,
  );

  // Read current tsconfig
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8')) as {
    compilerOptions?: {
      paths?: Record<string, string[]>;
    };
  };

  // Ensure compilerOptions and paths exist
  if (!tsconfig.compilerOptions) {
    tsconfig.compilerOptions = {};
  }

  // Rebuild paths from scratch
  const paths: Record<string, string[]> = {};

  // Add library paths
  for (const libName of libNames) {
    const aliasName = `@${workspaceName}/${libName}`;
    const pathValue = `${libName}/src/index.ts`;
    paths[aliasName] = [pathValue];
  }

  // Add application path if exists
  if (appName) {
    const aliasName = `@${workspaceName}/${appName}`;
    const pathValue = `${appName}/src/main.ts`;
    paths[aliasName] = [pathValue];
  }

  // Replace paths section
  tsconfig.compilerOptions.paths = paths;

  // Write corrected tsconfig
  writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2), 'utf-8');

  logger.verbose(
    `Rebuilt ${Object.keys(paths).length} path mappings in tsconfig.base.json`,
  );
}

/**
 * Adds a source file to a project in the workspace
 *
 * @param workspace Workspace information from createWorkspace
 * @param projectName Name of the project (library or app)
 * @param relativePath Relative path within the project (e.g., 'src/lib/util.ts')
 * @param contents File contents
 *
 * @example
 * ```typescript
 * const workspace = await createWorkspace({ libs: 2 });
 * await addSourceFile(
 *   workspace,
 *   workspace.libs[0],
 *   'src/lib/util.ts',
 *   'export const util = () => 42;'
 * );
 * ```
 */
export async function addSourceFile(
  workspace: WorkspaceInfo,
  projectName: string,
  relativePath: string,
  contents: string,
): Promise<void> {
  logger.verbose(`Adding file ${relativePath} to project ${projectName}`);

  const filePath = join(workspace.path, projectName, relativePath);
  const fileDir = dirname(filePath);

  // Ensure directory exists
  mkdirSync(fileDir, { recursive: true });

  // Write file
  writeFileSync(filePath, contents, 'utf-8');

  logger.verbose(`File added: ${filePath}`);
}
