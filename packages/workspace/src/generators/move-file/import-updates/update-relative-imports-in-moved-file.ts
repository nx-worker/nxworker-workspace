import { Tree, logger } from '@nx/devkit';
import { posix as path } from 'node:path';
import { treeReadCache } from '../tree-cache';
import { updateImportSpecifierPattern } from '../jscodeshift-utils';
import { getRelativeImportSpecifier } from '../path-utils/get-relative-import-specifier';

/**
 * Updates relative imports within the moved file when moving within the same project.
 *
 * @param tree - The virtual file system tree.
 * @param normalizedSource - Original file path.
 * @param normalizedTarget - New file path.
 */
export function updateRelativeImportsInMovedFile(
  tree: Tree,
  normalizedSource: string,
  normalizedTarget: string,
): void {
  const content = treeReadCache.read(tree, normalizedTarget, 'utf-8');
  if (!content) {
    return;
  }

  logger.verbose(
    `Updating relative imports in moved file to maintain correct paths`,
  );

  // Use jscodeshift to update relative imports in the moved file
  updateImportSpecifierPattern(
    tree,
    normalizedTarget,
    (specifier) => {
      // Only process relative imports
      return specifier.startsWith('.');
    },
    (oldImportPath) => {
      // Calculate the new relative path from target to the imported file
      const sourceDir = path.dirname(normalizedSource);

      // Resolve the import path relative to the original location
      const absoluteImportPath = path.join(sourceDir, oldImportPath);

      // Calculate the new relative path from the target location
      const newRelativePath = getRelativeImportSpecifier(
        normalizedTarget,
        absoluteImportPath,
      );

      if (newRelativePath !== oldImportPath) {
        logger.verbose(
          `Updated import '${oldImportPath}' to '${newRelativePath}' in moved file`,
        );
      }

      return newRelativePath;
    },
  );
}
