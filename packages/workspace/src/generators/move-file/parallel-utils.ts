import { Tree, ProjectConfiguration, normalizePath, logger } from '@nx/devkit';
import { hasImportSpecifier } from './jscodeshift-utils';

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

/**
 * Collects all source files from a project directory that match the file extensions.
 * This is a helper for parallel processing.
 *
 * @param tree - The virtual file system tree
 * @param projectRoot - Root directory of the project
 * @param excludeFiles - Files to exclude from collection
 * @returns Array of file paths
 */
function collectSourceFiles(
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
 * Checks if any files in the given list contain imports to the specified path.
 * This version processes files in parallel for better performance.
 *
 * @param tree - The virtual file system tree
 * @param files - Array of file paths to check
 * @param importPath - The import path to search for
 * @returns True if any file contains the import
 */
async function checkFilesForImportsParallel(
  tree: Tree,
  files: string[],
  importPath: string,
): Promise<boolean> {
  // Process files in parallel batches
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
 * @returns Promise that resolves to true if the project has imports
 */
export async function checkForImportsInProjectParallel(
  tree: Tree,
  project: ProjectConfiguration,
  importPath: string,
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
  return checkFilesForImportsParallel(tree, files, importPath);
}

/**
 * Checks multiple projects for imports in parallel.
 *
 * @param tree - The virtual file system tree
 * @param projects - Array of [projectName, projectConfig] tuples
 * @param importPath - The import path to search for
 * @returns Promise that resolves to array of [projectName, projectConfig] tuples that have imports
 */
export async function filterProjectsWithImportsParallel(
  tree: Tree,
  projects: Array<[string, ProjectConfiguration]>,
  importPath: string,
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
      );
      return hasImports ? ([name, project] as [string, ProjectConfiguration]) : null;
    }),
  );

  // Filter out null results
  return results.filter(
    (result): result is [string, ProjectConfiguration] => result !== null,
  );
}
