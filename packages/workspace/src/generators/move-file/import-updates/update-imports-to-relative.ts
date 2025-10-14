import { Tree, ProjectConfiguration } from '@nx/devkit';
import { posix as path } from 'node:path';
import { updateImportSpecifier } from '../jscodeshift-utils';
import { getRelativeImportSpecifier } from '../path-utils/get-relative-import-specifier';

/**
 * Updates imports in target project from absolute import path to relative imports
 *
 * @param tree - The virtual file system tree.
 * @param project - The project configuration.
 * @param sourceImportPath - The source import path to replace.
 * @param targetRelativePath - The target relative path.
 * @param excludeFilePaths - File paths to exclude from updates.
 * @param getProjectSourceFilesFn - Function to get project source files.
 */
export function updateImportsToRelative(
  tree: Tree,
  project: ProjectConfiguration,
  sourceImportPath: string,
  targetRelativePath: string,
  excludeFilePaths: string[],
  getProjectSourceFilesFn: (tree: Tree, projectRoot: string) => string[],
): void {
  const excludeSet = new Set(excludeFilePaths);
  const sourceFiles = getProjectSourceFilesFn(tree, project.root);

  for (const normalizedFilePath of sourceFiles) {
    if (excludeSet.has(normalizedFilePath)) {
      continue;
    }

    const projectRoot = project.sourceRoot || project.root;
    const targetFilePath = path.join(projectRoot, targetRelativePath);
    const relativeSpecifier = getRelativeImportSpecifier(
      normalizedFilePath,
      targetFilePath,
    );

    // Use jscodeshift to update imports from source import path to relative path
    updateImportSpecifier(
      tree,
      normalizedFilePath,
      sourceImportPath,
      relativeSpecifier,
    );
  }
}
