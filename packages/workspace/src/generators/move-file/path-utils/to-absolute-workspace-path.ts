import { normalizePath } from '@nx/devkit';
import { posix as path } from 'node:path';

/**
 * Converts a relative workspace path to an absolute path with leading slash.
 * This is useful for calculating relative paths between files.
 *
 * @param filePath - The relative workspace path to convert
 * @returns The absolute path with leading slash
 */
export function toAbsoluteWorkspacePath(filePath: string): string {
  const normalized = normalizePath(filePath);
  return path.join('/', normalized);
}
