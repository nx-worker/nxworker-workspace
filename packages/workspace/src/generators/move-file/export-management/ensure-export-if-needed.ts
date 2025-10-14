import type { Tree } from '@nx/devkit';
import * as path from 'node:path';
import type { MoveContext } from '../types/move-context';
import type { MoveFileGeneratorSchema } from '../schema';
import { shouldExportFile } from './should-export-file';
import { ensureFileExported } from './ensure-file-exported';

/**
 * Ensures the moved file is exported from the target project when required.
 *
 * @param tree - The virtual file system tree.
 * @param ctx - Resolved move context.
 * @param options - Generator options controlling export behavior.
 * @param cachedTreeExists - Cached tree.exists() function.
 */
export function ensureExportIfNeeded(
  tree: Tree,
  ctx: MoveContext,
  options: MoveFileGeneratorSchema,
  cachedTreeExists: (tree: Tree, filePath: string) => boolean,
): void {
  const { targetImportPath, targetProject, normalizedTarget } = ctx;

  if (!targetImportPath) {
    return;
  }

  if (!shouldExportFile(ctx, options)) {
    return;
  }

  const targetRoot = targetProject.sourceRoot || targetProject.root;
  const relativeFilePathInTarget = path.relative(targetRoot, normalizedTarget);

  ensureFileExported(
    tree,
    targetProject,
    relativeFilePathInTarget,
    cachedTreeExists,
  );
}
