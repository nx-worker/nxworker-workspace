import type { Tree } from '@nx/devkit';
import { astCache } from '../ast-cache';
import { treeReadCache } from '../tree-cache';

/**
 * Cached export information for index (entrypoint) files to avoid reparsing.
 */
export interface IndexExports {
  exports: Set<string>; // direct exports (file paths without extension)
  reexports: Set<string>; // re-exported modules (file paths without extension)
}

// Internal cache keyed by normalized index file path
const indexExportsCache = new Map<string, IndexExports>();

/** Clears all cached index export data. */
export function clearIndexExportsCache(): void {
  indexExportsCache.clear();
}

/** Invalidates a single index file from the cache (e.g., after write). */
export function invalidateIndexExportsCacheEntry(indexPath: string): void {
  indexExportsCache.delete(indexPath);
}

/**
 * Get (and cache) export info for an index/entrypoint file.
 * Lightweight regex based extraction – sufficient for current export patterns.
 */
export function getIndexExports(tree: Tree, indexPath: string): IndexExports {
  const cached = indexExportsCache.get(indexPath);
  if (cached) return cached;

  const content = treeReadCache.read(tree, indexPath, 'utf-8') || '';

  const exports = new Set<string>();
  const reexports = new Set<string>();

  // Match: export * from './path';  OR export { ... } from './path'; OR export {default as X} from './path';
  const reExportPattern =
    /export\s+(?:\*|\{[^}]+\})\s+from\s+['"](\.\.?\/[^'";]+)['"];?/g;
  // Match: export * from './path'; specially capture star exports for potential future distinction
  // Simple capture group for path without extension processing here

  let match: RegExpExecArray | null;
  while ((match = reExportPattern.exec(content))) {
    const spec = match[1];
    reexports.add(spec);
  }

  // Match direct export * from './x'; and export { Something } from './x'; already covered above.
  // Capture exported local files: export * from './lib/file'; we store path without extension for comparison ease.
  for (const spec of reexports) {
    const withoutExt = spec.replace(/\.(ts|tsx|js|jsx)$/i, '');
    exports.add(withoutExt);
  }

  const result: IndexExports = { exports, reexports };
  indexExportsCache.set(indexPath, result);
  return result;
}
