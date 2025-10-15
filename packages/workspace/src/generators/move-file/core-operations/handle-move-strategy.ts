import type { Tree, ProjectConfiguration, ProjectGraph } from '@nx/devkit';
import type { MoveContext } from '../types/move-context';
import { handleSameProjectMove } from './handle-same-project-move';
import { handleExportedMove } from './handle-exported-move';
import { handleNonExportedAliasMove } from './handle-non-exported-alias-move';
import { handleDefaultMove } from './handle-default-move';

/**
 * Decides which move strategy to execute based on the context.
 *
 * @param tree - The virtual file system tree.
 * @param getProjectGraphAsync - Lazy getter for the dependency graph (only creates when needed).
 * @param projects - Map of all projects in the workspace.
 * @param ctx - Resolved move context.
 * @param getCachedDependentProjects - Function to get cached dependent projects.
 * @param getProjectSourceFiles - Function to get project source files with caching.
 * @param cachedTreeExists - Function to check file existence with caching.
 */
export async function handleMoveStrategy(
  tree: Tree,
  getProjectGraphAsync: () => Promise<ProjectGraph>,
  projects: Map<string, ProjectConfiguration>,
  ctx: MoveContext,
  getCachedDependentProjects: (
    projectGraph: ProjectGraph,
    projectName: string,
  ) => Set<string>,
  getProjectSourceFiles: (tree: Tree, projectRoot: string) => string[],
  cachedTreeExists: (tree: Tree, filePath: string) => boolean,
): Promise<void> {
  const { isSameProject, isExported, sourceImportPath, targetImportPath } = ctx;

  if (isSameProject) {
    handleSameProjectMove(tree, ctx, getProjectSourceFiles);
    return;
  }

  if (isExported && sourceImportPath && targetImportPath) {
    await handleExportedMove(
      tree,
      getProjectGraphAsync,
      projects,
      ctx,
      getCachedDependentProjects,
      getProjectSourceFiles,
      cachedTreeExists,
    );
    return;
  }

  if (targetImportPath) {
    handleNonExportedAliasMove(tree, ctx, getProjectSourceFiles);
    return;
  }

  handleDefaultMove(tree, ctx, getProjectSourceFiles);
}
