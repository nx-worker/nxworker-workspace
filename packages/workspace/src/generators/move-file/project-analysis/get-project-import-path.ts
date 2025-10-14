import { ProjectConfiguration, Tree } from '@nx/devkit';
import { readCompilerPaths } from './read-compiler-paths';
import { toFirstPath } from './to-first-path';
import { pointsToProjectIndex } from './points-to-project-index';
import { isWildcardAlias } from './is-wildcard-alias';

/**
 * Resolves a wildcard alias to the project-specific alias string.
 *
 * @param alias - The alias key from tsconfig paths
 * @param sourceRoot - Source root of the project
 * @param projectName - Fallback project name when the directory name is missing
 * @returns The resolved alias string
 */
function resolveWildcardAlias(
  alias: string,
  sourceRoot: string,
  projectName: string,
): string {
  const projectDirName = sourceRoot.split('/').pop();
  return alias.replace(/\*/g, projectDirName || projectName);
}

/**
 * Gets the TypeScript import path for a project from tsconfig.base.json.
 *
 * Searches through TypeScript compiler paths to find the alias that points
 * to the project's index file.
 *
 * @param tree - The virtual file system tree
 * @param projectName - The project name
 * @param project - The project configuration
 * @returns The import path/alias or null if not found
 */
export function getProjectImportPath(
  tree: Tree,
  projectName: string,
  project: ProjectConfiguration,
): string | null {
  const paths = readCompilerPaths(tree);
  if (!paths) {
    return null;
  }

  const sourceRoot = project.sourceRoot || project.root;

  for (const [alias, pathEntry] of Object.entries(paths)) {
    const pathStr = toFirstPath(pathEntry);
    if (!pathStr) {
      continue;
    }

    if (!pointsToProjectIndex(tree, pathStr, sourceRoot)) {
      continue;
    }

    if (isWildcardAlias(alias, pathStr)) {
      return resolveWildcardAlias(alias, sourceRoot, projectName);
    }

    return alias;
  }

  return null;
}
