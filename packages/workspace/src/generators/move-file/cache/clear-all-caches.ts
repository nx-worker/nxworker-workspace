import { treeReadCache } from '../tree-cache';

/**
 * Clears all caches. Should be called when starting a new generator operation
 * to ensure fresh state.
 *
 * This function clears:
 * - Project source files cache
 * - File existence cache
 * - Compiler paths cache
 * - Tree read cache
 * - Dependency graph cache
 *
 * @param projectSourceFilesCache - Cache for source files per project
 * @param fileExistenceCache - Cache for file existence checks
 * @param compilerPathsCache - Cache for TypeScript compiler paths (pass by ref wrapper)
 * @param dependencyGraphCache - Cache for dependent project lookups
 */
export function clearAllCaches(
  projectSourceFilesCache: Map<string, string[]>,
  fileExistenceCache: Map<string, boolean>,
  compilerPathsCache: { value: Record<string, unknown> | null | undefined },
  dependencyGraphCache: Map<string, Set<string>>,
): void {
  projectSourceFilesCache.clear();
  fileExistenceCache.clear();
  compilerPathsCache.value = undefined;
  treeReadCache.clear();
  dependencyGraphCache.clear();
}
