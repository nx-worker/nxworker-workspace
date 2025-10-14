import { Tree, logger, ProjectConfiguration, ProjectGraph } from '@nx/devkit';
import { checkForImportsInProject } from './check-for-imports-in-project';
import { updateImportsToRelative } from './update-imports-to-relative';
import { updateImportsByAliasInProject } from './update-imports-by-alias-in-project';

/**
 * Updates import paths in all projects that depend on the source project
 *
 * @param tree - The virtual file system tree.
 * @param projectGraph - The project graph.
 * @param projects - Map of all projects.
 * @param sourceProjectName - Name of the source project.
 * @param sourceImportPath - Import path to the source.
 * @param targetImportPath - Import path to the target.
 * @param target - Optional target project information.
 * @param getCachedDependentProjectsFn - Function to get dependent projects.
 * @param getProjectSourceFilesFn - Function to get project source files.
 */
export async function updateImportPathsInDependentProjects(
  tree: Tree,
  projectGraph: ProjectGraph,
  projects: Map<string, ProjectConfiguration>,
  sourceProjectName: string,
  sourceImportPath: string,
  targetImportPath: string,
  target:
    | { targetProjectName?: string; targetRelativePath?: string }
    | undefined,
  getCachedDependentProjectsFn: (
    projectGraph: ProjectGraph,
    projectName: string,
  ) => Set<string>,
  getProjectSourceFilesFn: (tree: Tree, projectRoot: string) => string[],
): Promise<void> {
  const { targetProjectName, targetRelativePath } = target ?? {};
  const dependentProjectNames = Array.from(
    getCachedDependentProjectsFn(projectGraph, sourceProjectName),
  );

  let candidates: Array<[string, ProjectConfiguration]>;

  if (dependentProjectNames.length) {
    // Use dependency graph when available
    candidates = dependentProjectNames
      .map((name) => {
        const project = projects.get(name);
        return project ? [name, project] : null;
      })
      .filter(
        (entry): entry is [string, ProjectConfiguration] => entry !== null,
      );
  } else {
    // Filter: check all projects for imports
    const projectEntries = Array.from(projects.entries());
    candidates = projectEntries
      .filter(([, project]) =>
        checkForImportsInProject(
          tree,
          project,
          sourceImportPath,
          getProjectSourceFilesFn,
        ),
      )
      .map(
        ([name, project]) => [name, project] as [string, ProjectConfiguration],
      );
  }

  // Preload project file caches for all dependent projects to improve performance
  // This avoids sequential file tree traversals when updating imports
  candidates.forEach(([, dependentProject]) => {
    getProjectSourceFilesFn(tree, dependentProject.root);
  });

  candidates.forEach(([dependentName, dependentProject]) => {
    logger.verbose(`Checking project ${dependentName} for imports`);

    // If the dependent project is the target project, use relative imports
    if (
      targetProjectName &&
      targetRelativePath &&
      dependentName === targetProjectName
    ) {
      logger.verbose(
        `Updating imports in target project ${dependentName} to use relative paths`,
      );
      updateImportsToRelative(
        tree,
        dependentProject,
        sourceImportPath,
        targetRelativePath,
        [],
        getProjectSourceFilesFn,
      );
    } else {
      updateImportsByAliasInProject(
        tree,
        dependentProject,
        sourceImportPath,
        targetImportPath,
        getProjectSourceFilesFn,
      );
    }
  });
}
