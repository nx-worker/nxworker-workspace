import type { Tree } from '@nx/devkit';

/**
 * Cached wrapper for tree.exists() to avoid redundant file system checks.
 *
 * This function uses a cache to store the results of tree.exists() calls,
 * which can significantly reduce file system overhead when checking the same
 * files multiple times during a move operation.
 *
 * @param tree - The virtual file system tree
 * @param filePath - Path to check for existence
 * @param fileExistenceCache - Cache for file existence checks
 * @returns True if file exists, false otherwise
 */
export function cachedTreeExists(
  tree: Tree,
  filePath: string,
  fileExistenceCache: Map<string, boolean>,
): boolean {
  const cached = fileExistenceCache.get(filePath);
  if (cached !== undefined) {
    return cached;
  }

  const exists = tree.exists(filePath);
  fileExistenceCache.set(filePath, exists);
  return exists;
}
