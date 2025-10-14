import type { Tree } from '@nx/devkit';
import type { ProjectConfiguration } from '@nx/devkit';
import { logger } from '@nx/devkit';
import { getProjectEntryPointPaths } from '../project-analysis/get-project-entry-point-paths';
import { removeSourceFileExtension } from '../path-utils/remove-source-file-extension';
import { escapeRegex } from '../security-utils/escape-regex';
import { treeReadCache } from '../tree-cache';

/**
 * Removes the export for a file from the project's entrypoint.
 *
 * This function removes all export statements matching the file from
 * all entrypoint files. If removing the export leaves the file empty,
 * it adds `export {};` to prevent runtime errors.
 *
 * Supported patterns to remove:
 * - export * from "path"
 * - export { ... } from "path"
 *
 * @param tree - The virtual file system tree.
 * @param project - Project configuration.
 * @param file - Relative file path within project (e.g., "lib/utils.ts").
 * @param cachedTreeExists - Cached tree.exists() function.
 */
export function removeFileExport(
  tree: Tree,
  project: ProjectConfiguration,
  file: string,
  cachedTreeExists: (tree: Tree, filePath: string) => boolean,
): void {
  const indexPaths = getProjectEntryPointPaths(tree, project);

  // Find existing index files
  indexPaths.forEach((indexPath) => {
    if (!cachedTreeExists(tree, indexPath)) {
      return;
    }

    const content = treeReadCache.read(tree, indexPath, 'utf-8');
    if (!content) {
      return;
    }

    // Remove export for the file
    const fileWithoutExt = removeSourceFileExtension(file);
    const escapedFile = escapeRegex(fileWithoutExt);

    // Match various export patterns
    const exportPatterns = [
      new RegExp(
        `export\\s+\\*\\s+from\\s+['"]\\.\\.?/${escapedFile}['"];?\\s*\\n?`,
        'g',
      ),
      new RegExp(
        `export\\s+\\{[^}]+\\}\\s+from\\s+['"]\\.\\.?/${escapedFile}['"];?\\s*\\n?`,
        'g',
      ),
    ];

    let updatedContent = content;
    exportPatterns.forEach((pattern) => {
      updatedContent = updatedContent.replace(pattern, '');
    });

    if (updatedContent !== content) {
      // If the file becomes empty or whitespace-only, add export {}
      // to prevent runtime errors when importing from the package
      if (updatedContent.trim() === '') {
        updatedContent = 'export {};\n';
      }

      tree.write(indexPath, updatedContent);
      treeReadCache.invalidateFile(indexPath);
      logger.verbose(`Removed export from ${indexPath}`);
    }
  });
}
