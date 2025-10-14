import { Tree, normalizePath } from '@nx/devkit';
import { isIndexFilePath } from './is-index-file-path';

/**
 * Checks whether the provided path string points to the project's index file.
 *
 * @param tree - The virtual file system tree
 * @param pathStr - Path value from the tsconfig mapping
 * @param sourceRoot - Source root of the project
 * @returns True when the path targets the project's index
 */
export function pointsToProjectIndex(
  tree: Tree,
  pathStr: string,
  sourceRoot: string,
): boolean {
  const normalizedPathStr = normalizePath(pathStr);
  const normalizedSourceRoot = normalizePath(sourceRoot);

  // First, check if path is within the project's source root
  if (
    normalizedPathStr !== normalizedSourceRoot &&
    !normalizedPathStr.startsWith(`${normalizedSourceRoot}/`)
  ) {
    return false;
  }

  // Try dynamic verification: check if the file actually exists
  if (tree.exists(normalizedPathStr)) {
    return true;
  }

  // Fallback to hard-coded pattern matching for common index file patterns
  return isIndexFilePath(normalizedPathStr);
}
