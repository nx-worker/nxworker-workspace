import { Tree, ProjectConfiguration, normalizePath } from '@nx/devkit';
import { posix as path } from 'node:path';
import { removeSourceFileExtension } from '../path-utils/remove-source-file-extension';
import { getRelativeImportSpecifier } from '../path-utils/get-relative-import-specifier';
import { updateImportSpecifierPattern } from '../jscodeshift-utils';

/**
 * Updates import paths within a single project
 *
 * @param tree - The virtual file system tree.
 * @param project - The project configuration.
 * @param sourceFilePath - The source file path.
 * @param targetFilePath - The target file path.
 * @param getProjectSourceFilesFn - Function to get project source files.
 */
export function updateImportPathsInProject(
  tree: Tree,
  project: ProjectConfiguration,
  sourceFilePath: string,
  targetFilePath: string,
  getProjectSourceFilesFn: (tree: Tree, projectRoot: string) => string[],
): void {
  const sourceFiles = getProjectSourceFilesFn(tree, project.root);
  const normalizedSourceWithoutExt = normalizePath(
    removeSourceFileExtension(sourceFilePath),
  );

  for (const normalizedFilePath of sourceFiles) {
    if (
      normalizedFilePath === sourceFilePath ||
      normalizedFilePath === targetFilePath
    ) {
      continue;
    }

    const relativeSpecifier = getRelativeImportSpecifier(
      normalizedFilePath,
      targetFilePath,
    );

    // Use jscodeshift to update imports that reference the source file
    updateImportSpecifierPattern(
      tree,
      normalizedFilePath,
      (specifier) => {
        // Match relative imports that reference the source file
        if (!specifier.startsWith('.')) {
          return false;
        }
        // Resolve the import specifier to an absolute path
        const importerDir = path.dirname(normalizedFilePath);
        const resolvedImport = path.join(importerDir, specifier);
        // Normalize and compare with source file (both without extension)
        const normalizedResolvedImport = normalizePath(
          removeSourceFileExtension(resolvedImport),
        );
        return normalizedResolvedImport === normalizedSourceWithoutExt;
      },
      () => relativeSpecifier,
    );
  }
}
