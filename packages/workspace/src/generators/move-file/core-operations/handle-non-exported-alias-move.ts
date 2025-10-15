import type { Tree } from '@nx/devkit';
import { logger } from '@nx/devkit';
import type { MoveContext } from '../types/move-context';
import { updateImportPathsToPackageAlias } from '../import-updates/update-import-paths-to-package-alias';

/**
 * Handles moves across projects when the file is not exported but aliases exist.
 *
 * @param tree - The virtual file system tree.
 * @param ctx - Resolved move context.
 * @param getProjectSourceFiles - Function to get project source files with caching.
 */
export function handleNonExportedAliasMove(
  tree: Tree,
  ctx: MoveContext,
  getProjectSourceFiles: (tree: Tree, projectRoot: string) => string[],
): void {
  const {
    sourceProject,
    normalizedSource,
    normalizedTarget,
    targetImportPath,
  } = ctx;

  if (!targetImportPath) {
    return;
  }

  logger.verbose(
    `File is not exported, updating imports within source project to use target import path`,
  );

  updateImportPathsToPackageAlias(
    tree,
    sourceProject,
    normalizedSource,
    targetImportPath,
    [normalizedTarget], // Exclude the moved file
    getProjectSourceFiles,
  );
}
