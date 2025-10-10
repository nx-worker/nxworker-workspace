import { Tree, ProjectConfiguration, normalizePath, logger } from '@nx/devkit';
import { hasImportSpecifier } from './jscodeshift-utils';
import { Worker } from 'worker_threads';
import { join } from 'path';

const sourceFileExtensions = Object.freeze([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.mjs',
  '.cts',
  '.cjs',
] as const);

// Worker thread configuration
const WORKER_POOL_SIZE = 4; // Number of worker threads to use
const MIN_FILES_FOR_WORKERS = 100; // Minimum files to justify worker thread overhead

/**
 * Collects all source files from a project directory that match the file extensions.
 * This is a helper for parallel processing.
 *
 * @param tree - The virtual file system tree
 * @param projectRoot - Root directory of the project
 * @param excludeFiles - Files to exclude from collection
 * @returns Array of file paths
 */
export function collectSourceFiles(
  tree: Tree,
  projectRoot: string,
  excludeFiles: Set<string> = new Set(),
): string[] {
  const files: string[] = [];
  const fileExtensions = sourceFileExtensions;

  function visitDirectory(dirPath: string): void {
    if (!tree.exists(dirPath)) {
      return;
    }

    const children = tree.children(dirPath);
    for (const child of children) {
      const childPath = normalizePath(`${dirPath}/${child}`);

      if (tree.isFile(childPath)) {
        if (
          fileExtensions.some((ext) => childPath.endsWith(ext)) &&
          !excludeFiles.has(childPath)
        ) {
          files.push(childPath);
        }
      } else {
        // Recursively visit subdirectories
        // Skip common ignore patterns
        if (
          !child.startsWith('.') &&
          child !== 'node_modules' &&
          child !== 'dist' &&
          child !== 'build'
        ) {
          visitDirectory(childPath);
        }
      }
    }
  }

  visitDirectory(projectRoot);
  return files;
}

/**
 * Checks if any files contain imports using worker threads for true parallelism.
 * This is beneficial for large file sets where CPU-bound AST parsing dominates.
 *
 * @param tree - The virtual file system tree
 * @param files - Array of file paths to check
 * @param importPath - The import path to search for
 * @returns True if any file contains the import
 */
async function checkFilesForImportsWithWorkers(
  tree: Tree,
  files: string[],
  importPath: string,
): Promise<boolean> {
  const workerPath = join(__dirname, 'import-check-worker.js');

  // Read all file contents upfront
  const fileContents = files
    .map((filePath) => {
      const content = tree.read(filePath, 'utf-8');
      return content ? { path: filePath, content } : null;
    })
    .filter((item): item is { path: string; content: string } => item !== null);

  if (fileContents.length === 0) {
    return false;
  }

  // Distribute files across workers
  const filesPerWorker = Math.ceil(fileContents.length / WORKER_POOL_SIZE);
  const workerPromises: Promise<boolean>[] = [];

  for (
    let i = 0;
    i < WORKER_POOL_SIZE && i * filesPerWorker < fileContents.length;
    i++
  ) {
    const workerFiles = fileContents.slice(
      i * filesPerWorker,
      (i + 1) * filesPerWorker,
    );

    if (workerFiles.length === 0) continue;

    const workerPromise = new Promise<boolean>((resolve, reject) => {
      const worker = new Worker(workerPath, {
        workerData: {
          fileContents: workerFiles,
          importPath,
        },
      });

      worker.on(
        'message',
        (result: {
          foundImport: boolean;
          matchedFile?: string;
          error?: string;
        }) => {
          if (result.error) {
            reject(new Error(result.error));
          } else {
            if (result.foundImport && result.matchedFile) {
              logger.verbose(`Worker found import in ${result.matchedFile}`);
            }
            resolve(result.foundImport);
          }
          worker.terminate();
        },
      );

      worker.on('error', (err) => {
        reject(err);
        worker.terminate();
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
    });

    workerPromises.push(workerPromise);
  }

  // Wait for all workers and return true if any found imports
  try {
    const results = await Promise.all(workerPromises);
    return results.some((found) => found);
  } catch (error) {
    // If workers fail, fall back to sequential processing
    throw error;
  }
}

/**
 * Checks if any files in the given list contain imports to the specified path.
 * This version processes files in parallel batches for better performance.
 *
 * @param tree - The virtual file system tree
 * @param files - Array of file paths to check
 * @param importPath - The import path to search for
 * @param experimentalThreads - Enable worker threads for true parallelism (disabled by default)
 * @returns True if any file contains the import
 */
async function checkFilesForImportsParallel(
  tree: Tree,
  files: string[],
  importPath: string,
  experimentalThreads = false,
): Promise<boolean> {
  // Use worker threads for large file sets (true parallelism for CPU-bound work)
  if (experimentalThreads && files.length >= MIN_FILES_FOR_WORKERS) {
    try {
      logger.verbose(
        `Using ${WORKER_POOL_SIZE} worker threads to check ${files.length} files`,
      );
      return await checkFilesForImportsWithWorkers(tree, files, importPath);
    } catch (error) {
      // Fall back to Promise.all if worker threads fail
      logger.warn(
        `Worker thread failed, falling back to Promise.all: ${error}`,
      );
    }
  }

  // Fallback: Process files in parallel batches using Promise.all
  const BATCH_SIZE = 10; // Process 10 files at a time
  const batches: string[][] = [];

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    batches.push(files.slice(i, i + BATCH_SIZE));
  }

  for (const batch of batches) {
    // Process batch in parallel
    const results = await Promise.all(
      batch.map((filePath) =>
        Promise.resolve(hasImportSpecifier(tree, filePath, importPath)),
      ),
    );

    // Early exit if we find any match
    if (results.some((hasImport) => hasImport)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a project has imports to a given file/path.
 * This optimized version collects files first, then processes them in parallel.
 *
 * @param tree - The virtual file system tree
 * @param project - Project configuration
 * @param importPath - The import path to search for
 * @param experimentalThreads - Enable worker threads for true parallelism (disabled by default)
 * @returns Promise that resolves to true if the project has imports
 */
export async function checkForImportsInProjectParallel(
  tree: Tree,
  project: ProjectConfiguration,
  importPath: string,
  experimentalThreads = false,
): Promise<boolean> {
  // Collect all source files
  const files = collectSourceFiles(tree, project.root);

  if (files.length === 0) {
    return false;
  }

  logger.verbose(
    `Checking ${files.length} files in parallel for imports to ${importPath}`,
  );

  // Process files in parallel
  return checkFilesForImportsParallel(
    tree,
    files,
    importPath,
    experimentalThreads,
  );
}

/**
 * Checks multiple projects for imports in parallel.
 *
 * @param tree - The virtual file system tree
 * @param projects - Array of [projectName, projectConfig] tuples
 * @param importPath - The import path to search for
 * @param experimentalThreads - Enable worker threads for true parallelism (disabled by default)
 * @returns Promise that resolves to array of [projectName, projectConfig] tuples that have imports
 */
export async function filterProjectsWithImportsParallel(
  tree: Tree,
  projects: Array<[string, ProjectConfiguration]>,
  importPath: string,
  experimentalThreads = false,
): Promise<Array<[string, ProjectConfiguration]>> {
  logger.verbose(
    `Checking ${projects.length} projects in parallel for imports to ${importPath}`,
  );

  // Process all projects in parallel
  const results = await Promise.all(
    projects.map(async ([name, project]) => {
      const hasImports = await checkForImportsInProjectParallel(
        tree,
        project,
        importPath,
        experimentalThreads,
      );
      return hasImports
        ? ([name, project] as [string, ProjectConfiguration])
        : null;
    }),
  );

  // Filter out null results
  return results.filter(
    (result): result is [string, ProjectConfiguration] => result !== null,
  );
}

/**
 * Collects source files from multiple projects in parallel.
 * This is useful for batch operations that need to process many files.
 *
 * @param tree - The virtual file system tree
 * @param projects - Array of [projectName, projectConfig] tuples
 * @param excludeFiles - Files to exclude from collection
 * @returns Promise that resolves to array of [projectName, filePaths] tuples
 */
export async function collectSourceFilesFromProjectsParallel(
  tree: Tree,
  projects: Array<[string, ProjectConfiguration]>,
  excludeFiles: Set<string> = new Set(),
): Promise<Array<[string, string[]]>> {
  logger.verbose(
    `Collecting source files from ${projects.length} projects in parallel`,
  );

  // Process all projects in parallel
  const results = await Promise.all(
    projects.map(async ([name, project]) => {
      const files = collectSourceFiles(tree, project.root, excludeFiles);
      return [name, files] as [string, string[]];
    }),
  );

  return results;
}
