import { ProjectGraph } from '@nx/devkit';
import { buildReverseDependencyMap } from './build-reverse-dependency-map';

/**
 * Gets all projects that depend (directly or transitively) on the given project.
 *
 * Uses breadth-first search to find all dependent projects.
 *
 * @param projectGraph - The project dependency graph
 * @param projectName - The project name to find dependents for
 * @returns Array of dependent project names
 */
export function getDependentProjectNames(
  projectGraph: ProjectGraph,
  projectName: string,
): string[] {
  const reverseMap = buildReverseDependencyMap(projectGraph);
  const dependents = new Set<string>();
  const queue: string[] = [projectName];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    const directDependents = reverseMap.get(current);
    if (!directDependents) {
      continue;
    }

    directDependents.forEach((dependent) => {
      if (!dependents.has(dependent)) {
        dependents.add(dependent);
        queue.push(dependent);
      }
    });
  }

  dependents.delete(projectName);
  return Array.from(dependents);
}
