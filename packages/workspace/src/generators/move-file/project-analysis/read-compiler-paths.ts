import { Tree, logger } from '@nx/devkit';
import { treeReadCache } from '../tree-cache';

/**
 * Reads the TypeScript compiler path mappings from tsconfig files at the workspace root.
 * Tries tsconfig.base.json, tsconfig.json, and any tsconfig.*.json files.
 *
 * Results are cached to avoid repeated file system operations.
 *
 * @param tree - The virtual file system tree
 * @returns The paths object or null if unavailable
 */

// Cache for TypeScript compiler paths to avoid repeated parsing of tsconfig files
let compilerPathsCache: Record<string, unknown> | null | undefined = undefined;

export function readCompilerPaths(tree: Tree): Record<string, unknown> | null {
  // Return cached value if available
  if (compilerPathsCache !== undefined) {
    return compilerPathsCache;
  }

  // Try common tsconfig files in order of preference
  const tsconfigFiles = ['tsconfig.base.json', 'tsconfig.json'];

  // Add any tsconfig.*.json files found at the root
  const rootFiles = treeReadCache.children(tree, '');
  const additionalTsconfigFiles = rootFiles
    .filter((file) => file.startsWith('tsconfig.') && file.endsWith('.json'))
    .filter((file) => !tsconfigFiles.includes(file));

  const allTsconfigFiles = [...tsconfigFiles, ...additionalTsconfigFiles];

  for (const tsconfigPath of allTsconfigFiles) {
    if (!tree.exists(tsconfigPath)) {
      continue;
    }

    try {
      const tsconfigContent = treeReadCache.read(tree, tsconfigPath, 'utf-8');
      if (!tsconfigContent) {
        continue;
      }

      const tsconfig = JSON.parse(tsconfigContent);
      const paths = tsconfig.compilerOptions?.paths;

      if (typeof paths === 'object' && paths) {
        compilerPathsCache = paths;
        return paths;
      }
    } catch (error) {
      logger.warn(`Could not parse ${tsconfigPath}: ${error}`);
    }
  }

  compilerPathsCache = null;
  return null;
}

/**
 * Clears the compiler paths cache.
 * Should be called when tsconfig files are modified or at the start of generator execution.
 */
export function clearCompilerPathsCache(): void {
  compilerPathsCache = undefined;
}
