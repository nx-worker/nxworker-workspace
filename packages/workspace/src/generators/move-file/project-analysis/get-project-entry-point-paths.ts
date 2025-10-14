import { ProjectConfiguration, Tree, normalizePath } from '@nx/devkit';
import { readCompilerPaths } from './read-compiler-paths';
import { toFirstPath } from './to-first-path';
import { pointsToProjectIndex } from './points-to-project-index';
import { getFallbackEntryPointPaths } from './get-fallback-entry-point-paths';

/**
 * Gets all possible entry point paths for a project.
 *
 * First attempts to find entry points from TypeScript compiler paths,
 * then falls back to common entry point locations.
 *
 * @param tree - The virtual file system tree
 * @param project - The project configuration
 * @returns Array of entry point file paths
 */
export function getProjectEntryPointPaths(
  tree: Tree,
  project: ProjectConfiguration,
): string[] {
  const sourceRoot = project.sourceRoot || project.root;
  const seen = new Set<string>();
  const candidates: string[] = [];

  const addCandidate = (value: string | null | undefined) => {
    if (!value) {
      return;
    }
    const normalized = normalizePath(value);
    if (seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    candidates.push(normalized);
  };

  const compilerPaths = readCompilerPaths(tree);
  if (compilerPaths) {
    for (const [, pathEntry] of Object.entries(compilerPaths)) {
      const pathStr = toFirstPath(pathEntry);
      if (!pathStr) {
        continue;
      }

      if (pointsToProjectIndex(tree, pathStr, sourceRoot)) {
        addCandidate(pathStr);
      }
    }
  }

  getFallbackEntryPointPaths(project).forEach(addCandidate);

  return candidates;
}
