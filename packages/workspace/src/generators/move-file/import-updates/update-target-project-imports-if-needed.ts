import { Tree, logger } from '@nx/devkit';
import { posix as path } from 'node:path';
import type { MoveContext } from '../types/move-context';
import { updateImportsToRelative } from './update-imports-to-relative';

/**
 * Updates imports in the target project when necessary after moving the file.
 *
 * @param tree - The virtual file system tree.
 * @param ctx - Resolved move context.
 * @param sourceIdentifier - The import specifier to replace.
 * @param getProjectSourceFilesFn - Function to get project source files.
 */
export function updateTargetProjectImportsIfNeeded(
  tree: Tree,
  ctx: MoveContext,
  sourceIdentifier: string,
  getProjectSourceFilesFn: (tree: Tree, projectRoot: string) => string[],
): void {
  const {
    isSameProject,
    hasImportsInTarget,
    targetImportPath,
    targetProject,
    normalizedTarget,
  } = ctx;

  if (isSameProject || !hasImportsInTarget || !targetImportPath) {
    return;
  }

  logger.verbose(`Updating imports in target project to relative imports`);

  const targetRoot = targetProject.sourceRoot || targetProject.root;
  const relativeFilePathInTarget = path.relative(targetRoot, normalizedTarget);

  updateImportsToRelative(
    tree,
    targetProject,
    sourceIdentifier,
    relativeFilePathInTarget,
    [normalizedTarget], // Exclude the moved file
    getProjectSourceFilesFn,
  );
}
