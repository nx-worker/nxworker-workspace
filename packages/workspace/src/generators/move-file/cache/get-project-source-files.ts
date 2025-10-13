import { Tree, visitNotIgnoredFiles, normalizePath } from '@nx/devkit';
import { sourceFileExtensions } from '../constants/file-extensions';
import { cachedTreeExists } from './cached-tree-exists';

/**
 * Gets all source files in a project with caching to avoid repeated traversals.
 *
 * This function uses a cache to store the list of source files per project,
 * which can significantly improve performance when the same project is
 * accessed multiple times during a move operation.
 *
 * The cache is populated by traversing the project directory and filtering
 * for files with supported source file extensions.
 *
 * @param tree - The virtual file system tree
 * @param projectRoot - Root path of the project
 * @param projectSourceFilesCache - Cache for source files per project
 * @param fileExistenceCache - Cache for file existence checks
 * @returns Array of source file paths
 */
export function getProjectSourceFiles(
  tree: Tree,
  projectRoot: string,
  projectSourceFilesCache: Map<string, string[]>,
  fileExistenceCache: Map<string, boolean>,
): string[] {
  const cached = projectSourceFilesCache.get(projectRoot);
  if (cached !== undefined) {
    return cached;
  }

  const sourceFiles: string[] = [];

  // Early exit: check if project directory exists to avoid traversal overhead
  if (!cachedTreeExists(tree, projectRoot, fileExistenceCache)) {
    projectSourceFilesCache.set(projectRoot, sourceFiles);
    return sourceFiles;
  }

  visitNotIgnoredFiles(tree, projectRoot, (filePath) => {
    if (sourceFileExtensions.some((ext) => filePath.endsWith(ext))) {
      sourceFiles.push(normalizePath(filePath));
    }
  });

  projectSourceFilesCache.set(projectRoot, sourceFiles);
  return sourceFiles;
}
