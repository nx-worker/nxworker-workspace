import { normalizePath } from '@nx/devkit';
import { posix as path } from 'node:path';

/**
 * Sanitizes a file path by normalizing and validating it.
 * Prevents path traversal attacks by ensuring the path doesn't escape the workspace.
 * Always uses POSIX paths (forward slashes) regardless of platform.
 * @param filePath - The file path to sanitize
 * @returns The sanitized path with forward slashes
 * @throws Error if path traversal is detected
 */
export function sanitizePath(filePath: string): string {
  // Convert backslashes to forward slashes for Windows compatibility
  let normalized = normalizePath(filePath);

  // Remove leading slash
  normalized = normalized.replace(/^\//, '');

  // Normalize the path to resolve '..' and '.'
  normalized = path.normalize(normalized);

  // Ensure the path doesn't try to escape using '..'
  if (normalized.startsWith('..') || normalized.includes('/../')) {
    throw new Error(`Invalid path: path traversal detected in "${filePath}"`);
  }

  return normalized;
}
