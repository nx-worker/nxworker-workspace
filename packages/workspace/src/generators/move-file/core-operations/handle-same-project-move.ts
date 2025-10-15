import type { Tree } from '@nx/devkit';
import { logger } from '@nx/devkit';
import type { MoveContext } from '../types/move-context';
import { updateImportPathsInProject } from '../import-updates/update-import-paths-in-project';

/**
 * Applies the move behavior when the file remains in the same project.
 *
 * @param tree - The virtual file system tree.
 * @param ctx - Resolved move context.
 * @param getProjectSourceFiles - Function to get project source files with caching.
 */
export function handleSameProjectMove(
  tree: Tree,
  ctx: MoveContext,
  getProjectSourceFiles: (tree: Tree, projectRoot: string) => string[],
): void {
  const { sourceProject, normalizedSource, normalizedTarget } = ctx;

  logger.verbose(
    `Moving within same project, updating imports to relative paths`,
  );

  updateImportPathsInProject(
    tree,
    sourceProject,
    normalizedSource,
    normalizedTarget,
    getProjectSourceFiles,
  );
}
