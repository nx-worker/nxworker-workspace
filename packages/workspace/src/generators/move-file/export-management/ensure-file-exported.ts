import type { Tree } from '@nx/devkit';
import type { ProjectConfiguration } from '@nx/devkit';
import { logger } from '@nx/devkit';
import { getProjectEntryPointPaths } from '../project-analysis/get-project-entry-point-paths';
import { removeSourceFileExtension } from '../path-utils/remove-source-file-extension';
import { treeReadCache } from '../tree-cache';
import { invalidateIndexExportsCache } from './index-exports-cache';
import { astCache } from '../ast-cache';

/**
 * Ensures the file is exported from the target project's entrypoint.
 *
 * This function adds an export statement to the project's index file.
 * If the export already exists, it does nothing to avoid duplicates.
 *
 * @param tree - The virtual file system tree.
 * @param project - Project configuration.
 * @param file - Relative file path within project (e.g., "lib/utils.ts").
 * @param cachedTreeExists - Cached tree.exists() function.
 */
export function ensureFileExported(
  tree: Tree,
  project: ProjectConfiguration,
  file: string,
  cachedTreeExists: (tree: Tree, filePath: string) => boolean,
): void {
  const indexPaths = getProjectEntryPointPaths(tree, project);

  // Find the first existing index file
  const indexPath =
    indexPaths.find((p) => cachedTreeExists(tree, p)) || indexPaths[0];

  let content = '';
  if (cachedTreeExists(tree, indexPath)) {
    content = treeReadCache.read(tree, indexPath, 'utf-8') || '';
  }

  // Add export for the moved file
  const fileWithoutExt = removeSourceFileExtension(file);
  const exportStatement = `export * from './${fileWithoutExt}';\n`;

  // Check if export already exists
  if (!content.includes(exportStatement.trim())) {
    content += exportStatement;
    tree.write(indexPath, content);
    treeReadCache.invalidateFile(indexPath);
    invalidateIndexExportsCache(indexPath);
    astCache.invalidate(indexPath);
    logger.verbose(`Added export to ${indexPath}`);
  }
}
