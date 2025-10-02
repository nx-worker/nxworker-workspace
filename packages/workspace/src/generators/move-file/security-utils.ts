import { posix as path } from 'path';

/**
 * Sanitizes a file path by normalizing and validating it
 * Prevents path traversal attacks by ensuring the path doesn't escape the workspace
 * Always uses POSIX paths (forward slashes) regardless of platform
 * @param filePath - The file path to sanitize
 * @returns The sanitized path with forward slashes
 * @throws Error if path traversal is detected
 */
export function sanitizePath(filePath: string): string {
  // Convert backslashes to forward slashes for Windows compatibility
  let normalized = filePath.replace(/\\/g, '/');

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

/**
 * Escape characters with special meaning either inside or outside character sets.
 * Use a simple backslash escape when it’s always valid, and a `\xnn` escape when the simpler form would be disallowed by Unicode patterns’ stricter grammar.
 * Prevents ReDoS (Regular Expression Denial of Service) attacks
 * @param str - The string to escape
 * @returns The escaped string safe for use in regular expressions
 * @remarks Native in Node.js >=24, see {@link RegExp.escape}
 *
 * @license MIT
 * MIT License
 * Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&').replace(/-/g, '\\x2d');
}
