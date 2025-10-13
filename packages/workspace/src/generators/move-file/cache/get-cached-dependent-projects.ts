import type { ProjectGraph } from '@nx/devkit';

/**
 * Gets dependent projects with caching to avoid repeated graph traversals.
 * The cache is cleared at the start of each generator execution.
 *
 * This function uses a cache to store the set of dependent project names,
 * which can significantly improve performance when the same project's
 * dependents are queried multiple times during a move operation.
 *
 * @param projectGraph - The project dependency graph
 * @param projectName - The name of the project to get dependents for
 * @param getDependentProjectNames - Function to get dependent project names from graph
 * @param dependencyGraphCache - Cache for dependent project lookups
 * @returns Set of dependent project names
 */
export function getCachedDependentProjects(
  projectGraph: ProjectGraph,
  projectName: string,
  getDependentProjectNames: (
    projectGraph: ProjectGraph,
    projectName: string,
  ) => string[],
  dependencyGraphCache: Map<string, Set<string>>,
): Set<string> {
  const cached = dependencyGraphCache.get(projectName);
  if (cached !== undefined) {
    return cached;
  }
  const dependents = new Set(
    getDependentProjectNames(projectGraph, projectName),
  );
  dependencyGraphCache.set(projectName, dependents);
  return dependents;
}
