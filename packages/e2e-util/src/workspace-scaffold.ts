import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { logger } from '@nx/devkit';
import { uniqueId } from '@internal/test-util';

/**
 * Options for creating a workspace
 */
export interface CreateWorkspaceOptions {
  /**
   * Name of the workspace (default: auto-generated with unique ID)
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
   * Nx major version to use (default: workspace version)
   */
  nxVersion?: number;
  /**
   * Base directory for temporary workspaces (default: process.cwd()/tmp)
   */
  baseDir?: string;
}

/**
 * Information about a created workspace
 */
export interface WorkspaceInfo {
  /**
   * Name of the workspace
   */
  name: string;
  /**
   * Absolute path to the workspace directory
   */
  path: string;
  /**
   * Names of generated libraries
   */
  libs: string[];
  /**
   * Name of the generated application (if includeApp was true)
   */
  app?: string;
}

/**
 * Options for adding a source file to a project
 */
export interface AddSourceFileOptions {
  /**
   * Absolute path to the workspace directory
   */
  workspacePath: string;
  /**
   * Name of the project
   */
  project: string;
  /**
   * Relative path within the project (e.g., 'src/lib/utils.ts')
   */
  relativePath: string;
  /**
   * File contents
   */
  contents: string;
}

/**
 * Retry an async operation with exponential backoff
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxAttempts: number,
  delayMs: number,
  errorCodes: string[] = [],
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err as Error;
      const isRetriableError =
        errorCodes.length === 0 ||
        (err &&
          typeof err === 'object' &&
          'code' in err &&
          errorCodes.includes(err.code as string));

      if (isRetriableError && attempt < maxAttempts) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.verbose(
          `Operation failed (attempt ${attempt}/${maxAttempts}), retrying after ${delayMs}ms: ${errorMessage}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else if (!isRetriableError) {
        throw err;
      }
    }
  }
  throw lastError;
}

/**
 * Create a minimal Nx workspace with configurable libraries and optional application
 *
 * This function:
 * - Generates a unique workspace name if not provided
 * - Creates the workspace in a temp directory with short paths
 * - Generates the specified number of libraries with deterministic names
 * - Optionally generates an application
 * - Installs dependencies with pinned versions
 *
 * @param options - Configuration options
 * @returns Information about the created workspace
 *
 * @example
 * ```ts
 * const workspace = await createWorkspace({
 *   libs: 3,
 *   includeApp: true
 * });
 * console.log(`Workspace created at ${workspace.path}`);
 * console.log(`Libraries: ${workspace.libs.join(', ')}`);
 * console.log(`Application: ${workspace.app}`);
 * ```
 */
export async function createWorkspace(
  options: CreateWorkspaceOptions = {},
): Promise<WorkspaceInfo> {
  const {
    name = `test-workspace-${uniqueId()}`,
    libs = 2,
    includeApp = false,
    nxVersion,
    baseDir = join(process.cwd(), 'tmp'),
  } = options;

  logger.verbose(`Creating workspace: ${name}`);

  const workspacePath = join(baseDir, name);

  // Ensure the workspace directory is empty (handle Windows file locking)
  await retryWithBackoff(
    async () => {
      rmSync(workspacePath, { recursive: true, force: true });
    },
    5,
    200,
    ['EBUSY', 'ENOTEMPTY'],
  );

  mkdirSync(dirname(workspacePath), { recursive: true });

  // Determine which version of create-nx-workspace to use
  let versionSpec: string;
  if (nxVersion) {
    versionSpec = `^${nxVersion}.0.0`;
    logger.verbose(`Using Nx version ${nxVersion}.x`);
  } else {
    // Get the workspace Nx version from root package.json
    const rootPackageJsonPath = join(process.cwd(), 'package.json');
    const rootPackageJson = JSON.parse(
      readFileSync(rootPackageJsonPath, 'utf-8'),
    );
    const workspaceNxVersion =
      rootPackageJson.devDependencies?.nx || rootPackageJson.dependencies?.nx;
    if (!workspaceNxVersion) {
      throw new Error('Could not determine workspace Nx version');
    }
    versionSpec = workspaceNxVersion;
    logger.verbose(`Using workspace Nx version: ${workspaceNxVersion}`);
  }

  // Create the workspace
  logger.verbose('Running create-nx-workspace');
  execSync(
    `npx --yes create-nx-workspace@${versionSpec} ${name} --preset apps --nxCloud=skip --no-interactive`,
    {
      cwd: dirname(workspacePath),
      stdio: 'inherit',
      env: process.env,
    },
  );

  logger.verbose(`Workspace created at ${workspacePath}`);

  // Generate libraries with deterministic names
  const libNames: string[] = [];
  const libLabels = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

  for (let i = 0; i < libs; i++) {
    const libName = `lib-${libLabels[i] || i}`;
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
  }

  logger.verbose('Workspace setup complete');

  return {
    name,
    path: workspacePath,
    libs: libNames,
    app: appName,
  };
}

/**
 * Add a source file to a project in the workspace
 *
 * This function creates the necessary directory structure and writes the file contents.
 *
 * @param options - Configuration options
 *
 * @example
 * ```ts
 * await addSourceFile({
 *   workspacePath: '/tmp/my-workspace',
 *   project: 'lib-a',
 *   relativePath: 'src/lib/utils.ts',
 *   contents: 'export function util() { return "hello"; }'
 * });
 * ```
 */
export async function addSourceFile(
  options: AddSourceFileOptions,
): Promise<void> {
  const { workspacePath, project, relativePath, contents } = options;

  const filePath = join(workspacePath, project, relativePath);
  logger.verbose(`Adding source file: ${project}/${relativePath}`);

  // Create directory if it doesn't exist
  mkdirSync(dirname(filePath), { recursive: true });

  // Write the file
  writeFileSync(filePath, contents, 'utf-8');

  logger.verbose(`Source file created at ${filePath}`);
}

/**
 * Get the import alias for a project from tsconfig.base.json
 *
 * @param workspacePath - Absolute path to the workspace
 * @param projectName - Name of the project
 * @returns The import alias (e.g., '@my-workspace/lib-a')
 */
export function getProjectImportAlias(
  workspacePath: string,
  projectName: string,
): string {
  const tsconfigPath = join(workspacePath, 'tsconfig.base.json');
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));
  const paths = tsconfig?.compilerOptions?.paths ?? {};

  for (const [alias, value] of Object.entries(paths)) {
    const pathEntries = Array.isArray(value) ? value : [value];
    if (
      pathEntries.some((entry) =>
        (entry as string)
          .replace(/\\/g, '/')
          .includes(`${projectName}/src/index`),
      )
    ) {
      return alias;
    }
  }

  throw new Error(
    `Could not determine import alias for project "${projectName}"`,
  );
}
