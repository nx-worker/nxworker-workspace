import * as path from 'path';

/**
 * Sanitizes a file path by normalizing and validating it
 * Prevents path traversal attacks by ensuring the path doesn't escape the workspace
 * @param filePath - The file path to sanitize
 * @returns The sanitized path
 * @throws Error if path traversal is detected
 */
export function sanitizePath(filePath: string): string {
  // Remove leading slash
  let normalized = filePath.replace(/^\//, '');

  // Normalize the path to resolve '..' and '.'
  normalized = path.normalize(normalized);

  // Ensure the path doesn't try to escape using '..'
  if (normalized.startsWith('..') || normalized.includes(path.sep + '..')) {
    throw new Error(`Invalid path: path traversal detected in "${filePath}"`);
  }

  return normalized;
}

/**
 * Escapes special regex characters in a string
 * Prevents ReDoS (Regular Expression Denial of Service) attacks
 * @param str - The string to escape
 * @returns The escaped string safe for use in regular expressions
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
