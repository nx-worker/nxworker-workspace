import type { Tree } from '@nx/devkit';
import { treeReadCache } from '../tree-cache';

/**
 * Creates the target file and updates related caches.
 *
 * @param tree - The virtual file system tree.
 * @param normalizedTarget - The normalized target file path.
 * @param fileContent - The content to write to the target file.
 * @param updateFileExistenceCache - Function to update file existence cache.
 */
export function createTargetFile(
  tree: Tree,
  normalizedTarget: string,
  fileContent: string,
  updateFileExistenceCache: (filePath: string, exists: boolean) => void,
): void {
  tree.write(normalizedTarget, fileContent);
  // Update file existence cache
  updateFileExistenceCache(normalizedTarget, true);
  // Invalidate tree read cache for this file
  treeReadCache.invalidateFile(normalizedTarget);
}
