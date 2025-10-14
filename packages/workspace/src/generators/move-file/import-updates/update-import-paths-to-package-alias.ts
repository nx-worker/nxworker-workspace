import { Tree, ProjectConfiguration, normalizePath } from '@nx/devkit';
import { posix as path } from 'node:path';
import { removeSourceFileExtension } from '../path-utils/remove-source-file-extension';
import { updateImportSpecifierPattern } from '../jscodeshift-utils';

/**
 * Updates import paths within a single project to use a package alias
 *
 * @param tree - The virtual file system tree.
 * @param project - The project configuration.
 * @param sourceFilePath - The source file path.
 * @param targetPackageAlias - The target package alias.
 * @param excludeFilePaths - File paths to exclude from updates.
 * @param getProjectSourceFilesFn - Function to get project source files.
 */
export function updateImportPathsToPackageAlias(
  tree: Tree,
  project: ProjectConfiguration,
  sourceFilePath: string,
  targetPackageAlias: string,
  excludeFilePaths: string[],
  getProjectSourceFilesFn: (tree: Tree, projectRoot: string) => string[],
): void {
  const normalizedSourceWithoutExt = normalizePath(
    removeSourceFileExtension(sourceFilePath),
  );
  const excludeSet = new Set([sourceFilePath, ...excludeFilePaths]);
  const sourceFiles = getProjectSourceFilesFn(tree, project.root);

  for (const normalizedFilePath of sourceFiles) {
    if (excludeSet.has(normalizedFilePath)) {
      continue;
    }

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
      () => targetPackageAlias,
    );
  }
}
