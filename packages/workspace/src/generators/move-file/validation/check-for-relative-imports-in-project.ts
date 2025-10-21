import { Tree, ProjectConfiguration, normalizePath } from '@nx/devkit';
import { posix as path } from 'node:path';
import { removeSourceFileExtension } from '../path-utils/remove-source-file-extension';
import { hasImportSpecifierMatching } from '../jscodeshift-utils';

/**
 * Checks if a project has relative imports to a given file
 *
 * @param tree - The virtual file system tree.
 * @param project - The project configuration.
 * @param sourceFilePath - The absolute path to the source file.
 * @param getProjectSourceFilesFn - Function to get project source files.
 * @returns True if any file in the project imports the given file via relative path.
 */
export function checkForRelativeImportsInProject(
  tree: Tree,
  project: ProjectConfiguration,
  sourceFilePath: string,
  getProjectSourceFilesFn: (tree: Tree, projectRoot: string) => string[],
): boolean {
  const sourceFiles = getProjectSourceFilesFn(tree, project.root);
  const normalizedSourceWithoutExt = normalizePath(
    removeSourceFileExtension(sourceFilePath),
  );

  for (const filePath of sourceFiles) {
    // Skip the source file itself
    if (filePath === sourceFilePath) {
      continue;
    }

    // Check if this file has an import that resolves to the source file
    const hasImport = hasImportSpecifierMatching(tree, filePath, (specifier) => {
      // Only check relative imports
      if (!specifier.startsWith('.')) {
        return false;
      }

      // Resolve the import specifier to an absolute path
      const importerDir = path.dirname(filePath);
      const resolvedImport = path.join(importerDir, specifier);

      // Normalize and compare with source file (both without extension)
      const normalizedResolvedImport = normalizePath(
        removeSourceFileExtension(resolvedImport),
      );

      return normalizedResolvedImport === normalizedSourceWithoutExt;
    });

    if (hasImport) {
      return true;
    }
  }

  return false;
}
