import type { Tree } from '@nx/devkit';
import { formatFiles } from '@nx/devkit';
import type { MoveFileGeneratorSchema } from '../schema';
import { treeReadCache } from '../tree-cache';

/**
 * Performs cleanup by deleting the source file and formatting if required.
 *
 * @param tree - The virtual file system tree.
 * @param normalizedSource - Normalized path of the original file.
 * @param options - Generator options controlling formatting behavior.
 */
export async function finalizeMove(
  tree: Tree,
  normalizedSource: string,
  options: MoveFileGeneratorSchema,
): Promise<void> {
  tree.delete(normalizedSource);
  // Invalidate tree read cache
  treeReadCache.invalidateFile(normalizedSource);

  if (!options.skipFormat) {
    await formatFiles(tree);
  }
}
