import type { Tree } from '@nx/devkit';
import type { ProjectConfiguration } from '@nx/devkit';
import { getProjectEntryPointPaths } from '../project-analysis/get-project-entry-point-paths';
import { removeSourceFileExtension } from '../path-utils/remove-source-file-extension';
import { getIndexExports } from './index-exports-cache';

/**
 * Checks if a file is exported from the project's entrypoint.
 *
 * This function scans project entrypoint files (index.ts, index.tsx, etc.)
 * and checks for re-export statements matching the given file.
 *
 * Supported export patterns:
 * - export * from "path"
 * - export { Something } from "path"
 * - export Something from "path"
 *
 * Note: This function currently only checks for re-exports (export ... from).
 * It does not check if symbols from the file are individually defined/exported
 * in the index file via local declarations.
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

  return indexPaths.some((indexPath) => {
    if (!cachedTreeExists(tree, indexPath)) {
      return false;
    }

    // Use the new cache to get re-exports
    const indexExports = getIndexExports(tree, indexPath);

    // Check if any re-export path matches the file
    // The file path (e.g., 'lib/utils.ts') should match re-export paths like:
    // - './lib/utils'
    // - './lib/utils.ts'
    // - '../lib/utils'
    for (const reexport of indexExports.reexports) {
      // Remove leading './' or '../' from reexport path
      const normalizedReexport = reexport.replace(/^\.\.?\//, '');
      // Remove extension if present
      const reexportWithoutExt = removeSourceFileExtension(normalizedReexport);

      // Compare without extensions
      if (reexportWithoutExt === fileWithoutExt) {
        return true;
      }
    }

    return false;
  });
}
