import type { Tree } from '@nx/devkit';
import type { ProjectConfiguration } from '@nx/devkit';
import { getProjectEntryPointPaths } from '../project-analysis/get-project-entry-point-paths';
import { removeSourceFileExtension } from '../path-utils/remove-source-file-extension';
import { escapeRegex } from '../security-utils/escape-regex';
import { treeReadCache } from '../tree-cache';

/**
 * Checks if a file is exported from the project's entrypoint.
 *
 * This function scans project entrypoint files (index.ts, index.tsx, etc.)
 * and checks for export statements matching the given file.
 *
 * Supported export patterns:
 * - export * from "path"
 * - export { Something } from "path"
 * - export Something from "path"
 *
 * @param tree - The virtual file system tree.
 * @param project - Project configuration.
 * @param file - Relative file path within project (e.g., "lib/utils.ts").
 * @param cachedTreeExists - Cached tree.exists() function.
 * @returns True if the file is exported from any entrypoint.
 */
export function isFileExported(
  tree: Tree,
  project: ProjectConfiguration,
  file: string,
  cachedTreeExists: (tree: Tree, filePath: string) => boolean,
): boolean {
  const indexPaths = getProjectEntryPointPaths(tree, project);

  const fileWithoutExt = removeSourceFileExtension(file);
  const escapedFile = escapeRegex(fileWithoutExt);

  return indexPaths.some((indexPath) => {
    if (!cachedTreeExists(tree, indexPath)) {
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
