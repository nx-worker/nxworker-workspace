/**
 * Workspace Scaffold Helper
 *
 * Creates minimal Nx workspaces with configurable libraries and optional applications
 * for e2e testing scenarios.
 */

import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { uniqueId } from '@internal/test-util';
import { logger } from '@nx/devkit';

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

  // Create workspace using create-nx-workspace
  logger.verbose(`Running create-nx-workspace@${versionSpec}...`);
  execSync(
    `npx --yes create-nx-workspace@${versionSpec} ${name} --preset apps --nxCloud=skip --no-interactive`,
    {
      cwd: workspaceParentDir,
      stdio: 'inherit',
      env: process.env,
    },
  );

  logger.verbose(`Workspace created at ${workspacePath}`);

  // Generate libraries
  const libNames: string[] = [];
  const libNamePrefix = 'lib-';
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';

  for (let i = 0; i < libs; i++) {
    const libName = `${libNamePrefix}${alphabet[i % alphabet.length]}${i >= alphabet.length ? Math.floor(i / alphabet.length) : ''}`;
    libNames.push(libName);

    logger.verbose(`Generating library: ${libName}`);
    execSync(
      `npx nx generate @nx/js:library ${libName} --unitTestRunner=none --bundler=none --no-interactive`,
      {
        cwd: workspacePath,
        stdio: 'inherit',
      },
    );
  }

  logger.verbose(`Generated ${libs} libraries: ${libNames.join(', ')}`);

  // Generate application if requested
  let appName: string | undefined;
  if (includeApp) {
    appName = 'app-main';
    logger.verbose(`Generating application: ${appName}`);
    execSync(
      `npx nx generate @nx/js:app ${appName} --unitTestRunner=none --bundler=none --no-interactive`,
      {
        cwd: workspacePath,
        stdio: 'inherit',
      },
    );
    logger.verbose(`Generated application: ${appName}`);
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
