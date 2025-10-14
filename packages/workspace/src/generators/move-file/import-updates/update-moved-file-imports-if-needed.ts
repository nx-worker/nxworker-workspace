import { Tree } from '@nx/devkit';
import type { MoveContext } from '../types/move-context';
import { updateRelativeImportsInMovedFile } from './update-relative-imports-in-moved-file';
import { updateRelativeImportsToAliasInMovedFile } from './update-relative-imports-to-alias-in-moved-file';

/**
 * Updates relative imports within the moved file to use alias imports to the source project.
 *
 * @param tree - The virtual file system tree.
 * @param ctx - Resolved move context.
 * @param cachedTreeExistsFn - Function to check if a file exists (with caching).
 */
export function updateMovedFileImportsIfNeeded(
  tree: Tree,
  ctx: MoveContext,
  cachedTreeExistsFn: (tree: Tree, filePath: string) => boolean,
): void {
  const {
    isSameProject,
    normalizedSource,
    normalizedTarget,
    sourceProject,
    sourceImportPath,
  } = ctx;

  if (isSameProject) {
    // For same-project moves, update relative imports to maintain correct paths
    updateRelativeImportsInMovedFile(tree, normalizedSource, normalizedTarget);
  } else if (sourceImportPath) {
    // For cross-project moves, convert relative imports to the source project to alias imports
    updateRelativeImportsToAliasInMovedFile(
      tree,
      normalizedSource,
      normalizedTarget,
      sourceProject,
      sourceImportPath,
      cachedTreeExistsFn,
    );
  }
}
