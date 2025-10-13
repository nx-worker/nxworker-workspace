import { normalizePath } from '@nx/devkit';
import { posix as path } from 'node:path';
import { toAbsoluteWorkspacePath } from './to-absolute-workspace-path';
import { stripFileExtension } from './strip-file-extension';

/**
 * Calculates the relative import specifier from one file to another.
 * The result is normalized and has the file extension stripped (except for ESM files).
 *
 * @param fromFilePath - The source file path (where the import is)
 * @param toFilePath - The target file path (what is being imported)
 * @returns The relative import specifier (e.g., './lib/utils', '../shared')
 */
export function getRelativeImportSpecifier(
  fromFilePath: string,
  toFilePath: string,
): string {
  const normalizedFrom = normalizePath(fromFilePath);
  const normalizedTo = normalizePath(toFilePath);
  const absoluteFromDir = path.dirname(toAbsoluteWorkspacePath(normalizedFrom));
  const absoluteTarget = toAbsoluteWorkspacePath(normalizedTo);
  let relativePath = path.relative(absoluteFromDir, absoluteTarget);

  if (!relativePath.startsWith('.')) {
    relativePath = `./${relativePath}`;
  }

  relativePath = normalizePath(relativePath);
  return stripFileExtension(relativePath);
}
