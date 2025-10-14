import { ProjectGraph } from '@nx/devkit';

/**
 * Builds a reverse dependency map from the project graph.
 *
 * Maps each project to the set of projects that depend on it.
 *
 * @param projectGraph - The project dependency graph
 * @returns Map from project name to set of dependent project names
 */
export function buildReverseDependencyMap(
  projectGraph: ProjectGraph,
): Map<string, Set<string>> {
  const reverse = new Map<string, Set<string>>();

  Object.entries(projectGraph.dependencies || {}).forEach(
    ([source, dependencies]) => {
      dependencies.forEach((dependency) => {
        const dependents = reverse.get(dependency.target);
        if (dependents) {
          dependents.add(source);
        } else {
          reverse.set(dependency.target, new Set([source]));
        }
      });
    },
  );

  return reverse;
}
