import { Tree, ProjectConfiguration } from '@nx/devkit';
import { updateImportSpecifier } from '../jscodeshift-utils';

/**
 * Updates imports in a project by replacing one alias with another.
 *
 * @param tree - The virtual file system tree.
 * @param project - The project configuration.
 * @param sourceImportPath - The source import path to replace.
 * @param targetImportPath - The target import path to use.
 * @param getProjectSourceFilesFn - Function to get project source files.
 */
export function updateImportsByAliasInProject(
  tree: Tree,
  project: ProjectConfiguration,
  sourceImportPath: string,
  targetImportPath: string,
  getProjectSourceFilesFn: (tree: Tree, projectRoot: string) => string[],
): void {
  const sourceFiles = getProjectSourceFilesFn(tree, project.root);

  for (const filePath of sourceFiles) {
    // Use jscodeshift to update imports from source to target path
    updateImportSpecifier(tree, filePath, sourceImportPath, targetImportPath);
  }
}
