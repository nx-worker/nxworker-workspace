import type { Tree, ProjectConfiguration, ProjectGraph } from '@nx/devkit';
import { logger } from '@nx/devkit';
import { posix as path } from 'node:path';
import type { MoveContext } from '../types/move-context';
import { updateImportPathsInDependentProjects } from '../import-updates/update-import-paths-in-dependent-projects';
import { removeFileExport } from '../export-management/remove-file-export';
import { updateImportPathsToPackageAlias } from '../import-updates/update-import-paths-to-package-alias';

/**
 * Handles the move when the source file is exported and must update dependents.
 *
 * @param tree - The virtual file system tree.
 * @param getProjectGraphAsync - Lazy getter for the dependency graph (only creates when needed).
 * @param projects - Map of all projects in the workspace.
 * @param ctx - Resolved move context.
 * @param getCachedDependentProjects - Function to get cached dependent projects.
 * @param getProjectSourceFiles - Function to get project source files with caching.
 * @param cachedTreeExists - Function to check file existence with caching.
 */
export async function handleExportedMove(
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
  const {
    sourceProjectName,
    sourceImportPath,
    targetImportPath,
    sourceProject,
    targetProject,
    targetProjectName,
    normalizedSource,
    normalizedTarget,
    relativeFilePathInSource,
  } = ctx;

  if (!sourceImportPath || !targetImportPath) {
    return;
  }

  logger.verbose(
    `File is exported from ${sourceImportPath}, updating dependent projects`,
  );

  // Compute the relative path in the target project
  const targetRoot = targetProject.sourceRoot || targetProject.root;
  const relativeFilePathInTarget = path.relative(targetRoot, normalizedTarget);

  // Lazily load project graph only when updating dependent projects.
  // This is the only code path that requires the graph, so we defer creation until here.
  // Same-project moves and non-exported cross-project moves never reach this code.
  const projectGraph = await getProjectGraphAsync();

  await updateImportPathsInDependentProjects(
    tree,
    projectGraph,
    projects,
    sourceProjectName,
    sourceImportPath,
    targetImportPath,
    {
      targetProjectName,
      targetRelativePath: relativeFilePathInTarget,
    },
    getCachedDependentProjects,
    getProjectSourceFiles,
  );

  // Remove the export from source index BEFORE updating imports to package alias
  // This ensures we can find and remove the relative path export before it's
  // converted to a package alias
  removeFileExport(
    tree,
    sourceProject,
    relativeFilePathInSource,
    cachedTreeExists,
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
