import type { Tree } from '@nx/devkit';
import { logger } from '@nx/devkit';
import type { MoveContext } from '../types/move-context';
import { updateImportPathsInProject } from '../import-updates/update-import-paths-in-project';

/**
 * Fallback move strategy when no aliases or exports are involved.
 *
 * @param tree - The virtual file system tree.
 * @param ctx - Resolved move context.
 * @param getProjectSourceFiles - Function to get project source files with caching.
 */
export function handleDefaultMove(
  tree: Tree,
  ctx: MoveContext,
  getProjectSourceFiles: (tree: Tree, projectRoot: string) => string[],
): void {
  const { sourceProject, normalizedSource, normalizedTarget } = ctx;

  logger.verbose(`Updating imports within source project to relative paths`);

  updateImportPathsInProject(
    tree,
    sourceProject,
    normalizedSource,
    normalizedTarget,
    getProjectSourceFiles,
  );
}
