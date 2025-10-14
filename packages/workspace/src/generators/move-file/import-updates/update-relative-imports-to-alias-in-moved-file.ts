import { Tree, logger, ProjectConfiguration } from '@nx/devkit';
import { posix as path } from 'node:path';
import { treeReadCache } from '../tree-cache';
import { updateImportSpecifierPattern } from '../jscodeshift-utils';
import { removeSourceFileExtension } from '../path-utils/remove-source-file-extension';
import { escapeRegex } from '../security-utils/escape-regex';
import { getProjectEntryPointPaths } from '../project-analysis/get-project-entry-point-paths';

/**
 * Checks if a file is exported from the project's entrypoint
 */
function isFileExported(
  tree: Tree,
  project: ProjectConfiguration,
  file: string,
  cachedTreeExistsFn: (tree: Tree, filePath: string) => boolean,
): boolean {
  const indexPaths = getProjectEntryPointPaths(tree, project);

  const fileWithoutExt = removeSourceFileExtension(file);
  const escapedFile = escapeRegex(fileWithoutExt);

  return indexPaths.some((indexPath) => {
    if (!cachedTreeExistsFn(tree, indexPath)) {
      return false;
    }
    const content = treeReadCache.read(tree, indexPath, 'utf-8');
    if (!content) {
      return false;
    }
    // Support: export ... from "path"
    // Support: export * from "path"
    // Support: export { Something } from "path"
    const exportPattern = new RegExp(
      `export\\s+(?:\\*|\\{[^}]+\\}|.+)\\s+from\\s+['"]\\.?\\.?/.*${escapedFile}['"]`,
    );
    return exportPattern.test(content);
  });
}

/**
 * Updates relative imports within the moved file to use alias imports when moving across projects.
 *
 * @param tree - The virtual file system tree.
 * @param normalizedSource - Original file path.
 * @param normalizedTarget - New file path.
 * @param sourceProject - Source project configuration.
 * @param sourceImportPath - Import alias for the source project.
 * @param cachedTreeExistsFn - Function to check if a file exists (with caching).
 */
export function updateRelativeImportsToAliasInMovedFile(
  tree: Tree,
  normalizedSource: string,
  normalizedTarget: string,
  sourceProject: ProjectConfiguration,
  sourceImportPath: string,
  cachedTreeExistsFn: (tree: Tree, filePath: string) => boolean,
): void {
  const content = treeReadCache.read(tree, normalizedTarget, 'utf-8');
  if (!content) {
    return;
  }

  logger.verbose(
    `Updating relative imports in moved file to use alias imports to source project`,
  );

  const sourceRoot = sourceProject.sourceRoot || sourceProject.root;

  // Use jscodeshift to update relative imports to alias
  updateImportSpecifierPattern(
    tree,
    normalizedTarget,
    (specifier) => {
      // Only process relative imports
      if (!specifier.startsWith('.')) {
        return false;
      }

      // Resolve the import path relative to the ORIGINAL (source) file location
      const sourceDir = path.dirname(normalizedSource);
      const resolvedPath = path.join(sourceDir, specifier);

      // Check if this import points to a file in the source project
      return resolvedPath.startsWith(sourceRoot + '/');
    },
    (importPath) => {
      // Resolve the import path relative to the ORIGINAL (source) file location
      const sourceDir = path.dirname(normalizedSource);
      const resolvedPath = path.join(sourceDir, importPath);

      // Check if the resolved file is exported from the source project's entrypoint
      const relativeFilePathInSource = path.relative(sourceRoot, resolvedPath);
      const isExported = isFileExported(
        tree,
        sourceProject,
        relativeFilePathInSource,
        cachedTreeExistsFn,
      );

      if (!isExported) {
        logger.warn(
          `Import '${importPath}' in ${normalizedTarget} is being converted to '${sourceImportPath}', but the imported file is not exported from the source project's entrypoint. This may result in an invalid import.`,
        );
      }

      return sourceImportPath;
    },
  );
}
