import type { MoveContext } from '../types/move-context';
import type { MoveFileGeneratorSchema } from '../schema';

/**
 * Determines whether the moved file should be exported after the move completes.
 *
 * Export logic:
 * - Always skip if skipExport option is true
 * - For same-project moves: maintain existing export status
 * - For cross-project moves: export if previously exported OR if target has imports
 *
 * @param ctx - Resolved move context.
 * @param options - Generator options controlling export behavior.
 * @returns True if an export statement should be ensured.
 */
export function shouldExportFile(
  ctx: MoveContext,
  options: MoveFileGeneratorSchema,
): boolean {
  const { isSameProject, isExported, hasImportsInTarget } = ctx;

  if (options.skipExport) {
    return false;
  }

  if (isSameProject) {
    return isExported;
  }

  return isExported || hasImportsInTarget;
}
