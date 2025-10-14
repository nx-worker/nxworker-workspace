import { Tree, ProjectConfiguration } from '@nx/devkit';
import { hasImportSpecifier } from '../jscodeshift-utils';

/**
 * Checks if a project has imports to a given file/path
 *
 * @param tree - The virtual file system tree.
 * @param project - The project configuration.
 * @param importPath - The import path to check for.
 * @param getProjectSourceFilesFn - Function to get project source files.
 * @returns True if any file in the project imports the given path.
 */
export function checkForImportsInProject(
  tree: Tree,
  project: ProjectConfiguration,
  importPath: string,
  getProjectSourceFilesFn: (tree: Tree, projectRoot: string) => string[],
): boolean {
  const sourceFiles = getProjectSourceFilesFn(tree, project.root);

  for (const filePath of sourceFiles) {
    // Use jscodeshift to check for imports
    if (hasImportSpecifier(tree, filePath, importPath)) {
      return true;
    }
  }

  return false;
}
