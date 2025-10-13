import { posix as path } from 'node:path';
import { strippableExtensions } from '../constants/file-extensions';

/**
 * Strips file extension from import path for TypeScript and regular JavaScript files.
 * Preserves extensions for ESM-specific files (.mjs, .mts, .cjs, .cts) as they are
 * required by the ESM specification.
 *
 * @param importPath - The import path to process
 * @returns The import path with extension stripped (or preserved for ESM files)
 */
export function stripFileExtension(importPath: string): string {
  // Only strip .ts, .tsx, .js, .jsx extensions
  // Preserve .mjs, .mts, .cjs, .cts as they are required for ESM
  const ext = path.extname(importPath);
  if (
    strippableExtensions.includes(ext as (typeof strippableExtensions)[number])
  ) {
    return importPath.slice(0, -ext.length);
  }
  return importPath;
}
