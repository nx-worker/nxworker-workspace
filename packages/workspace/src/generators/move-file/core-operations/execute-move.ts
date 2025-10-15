import type { Tree, ProjectConfiguration } from '@nx/devkit';
import type { ProjectGraph } from '@nx/devkit';
import { logger } from '@nx/devkit';
import type { MoveFileGeneratorSchema } from '../schema';
import type { MoveContext } from '../types/move-context';
import { updateMovedFileImportsIfNeeded } from '../import-updates/update-moved-file-imports-if-needed';
import { updateTargetProjectImportsIfNeeded } from '../import-updates/update-target-project-imports-if-needed';
import { ensureExportIfNeeded } from '../export-management/ensure-export-if-needed';
import { createTargetFile } from './create-target-file';
import { handleMoveStrategy } from './handle-move-strategy';
import { finalizeMove } from './finalize-move';

/**
 * Coordinates the move workflow by executing the individual move steps in order.
 *
 * @param tree - The virtual file system tree.
 * @param options - Generator options controlling the move.
 * @param projects - Map of all projects in the workspace.
 * @param getProjectGraphAsync - Lazy getter for the dependency graph (only creates when needed).
 * @param ctx - Precomputed move context produced by resolveAndValidate.
 * @param cachedTreeExists - Function to check file existence with caching.
 * @param updateProjectSourceFilesCache - Function to update project source files cache.
 * @param updateFileExistenceCache - Function to update file existence cache.
 * @param getProjectSourceFiles - Function to get project source files with caching.
 * @param getCachedDependentProjects - Function to get cached dependent projects.
 * @param skipFinalization - Skip deletion and formatting (for batch operations).
 */
export async function executeMove(
  tree: Tree,
  options: MoveFileGeneratorSchema,
  projects: Map<string, ProjectConfiguration>,
  getProjectGraphAsync: () => Promise<ProjectGraph>,
  ctx: MoveContext,
  cachedTreeExists: (tree: Tree, filePath: string) => boolean,
  updateProjectSourceFilesCache: (
    projectRoot: string,
    oldPath: string,
    newPath: string | null,
  ) => void,
  updateFileExistenceCache: (filePath: string, exists: boolean) => void,
  getProjectSourceFiles: (tree: Tree, projectRoot: string) => string[],
  getCachedDependentProjects: (
    projectGraph: ProjectGraph,
    projectName: string,
  ) => Set<string>,
  skipFinalization = false,
) {
  const {
    normalizedSource,
    normalizedTarget,
    sourceProjectName,
    targetProjectName,
    fileContent,
    sourceImportPath,
  } = ctx;

  logger.verbose(
    `Moving ${normalizedSource} (project: ${sourceProjectName}) to ${normalizedTarget} (project: ${targetProjectName})`,
  );

  createTargetFile(
    tree,
    normalizedTarget,
    fileContent,
    updateFileExistenceCache,
  );

  // Update cache incrementally for projects that will be modified
  // This is more efficient than invalidating and re-scanning the entire project
  const sourceProject = projects.get(sourceProjectName);
  const targetProject = projects.get(targetProjectName);
  if (sourceProject) {
    updateProjectSourceFilesCache(
      sourceProject.root,
      normalizedSource,
      targetProjectName === sourceProjectName ? normalizedTarget : null,
    );
  }
  if (targetProject && targetProject.root !== sourceProject?.root) {
    updateProjectSourceFilesCache(targetProject.root, '', normalizedTarget);
  }

  updateMovedFileImportsIfNeeded(tree, ctx, cachedTreeExists);

  await handleMoveStrategy(
    tree,
    getProjectGraphAsync,
    projects,
    ctx,
    getCachedDependentProjects,
    getProjectSourceFiles,
    cachedTreeExists,
  );

  const sourceIdentifier = sourceImportPath || normalizedSource;
  updateTargetProjectImportsIfNeeded(
    tree,
    ctx,
    sourceIdentifier,
    getProjectSourceFiles,
  );

  ensureExportIfNeeded(tree, ctx, options, cachedTreeExists);

  if (!skipFinalization) {
    await finalizeMove(tree, normalizedSource, options);
  }
}
