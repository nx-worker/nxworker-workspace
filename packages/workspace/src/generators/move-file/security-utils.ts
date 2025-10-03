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
 */
export function escapeRegex(str: string): string {
  // Escape characters that have special meaning in regular expressions.
  // Hyphen (`-`) does not need escaping outside of character classes, so leave it as-is
  // to match existing test expectations and avoid altering harmless filenames.
  return str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

/**
 * Escape a string for use inside a regular expression character class.
 * Inside a character class, a hyphen (`-`) creates ranges, so it must be escaped.
 * This function builds on `escapeRegex` and additionally escapes the hyphen
 * using a safe `\x2d` escape which can't be interpreted as a range.
 *
 * * @remarks Native in Node.js >=24, see {@link RegExp.escape}
 *
 * @license MIT
 * MIT License
 * Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
export function escapeRegexForCharClass(str: string): string {
  // First perform the general escaping
  const base = escapeRegex(str);

  // Then escape hyphen for character-class contexts. We use \x2d to avoid
  // introducing ambiguity when inserted inside `[...]`.
  return base.replace(/-/g, '\\x2d');
}

/**
 * Options for locale-aware path input validation.
 */
export interface PathValidationOptions {
  /**
   * When true, allow Unicode letters, numbers and marks (recommended for
   * internationalized filenames). Defaults to false (ASCII-only).
   */
  allowUnicode?: boolean;

  /**
   * Maximum allowed length for the string. Undefined means no limit.
   */
  maxLength?: number;

  /**
   * Additional literal characters to allow (they will be escaped).
   * Example: "#~" to allow hash and tilde.
   */
  additionalAllowedChars?: string;
}

/**
 * Validate user input intended to be used as a literal file/path fragment using
 * a whitelist approach. The default configuration allows ASCII alphanumerics
 * plus a small set of safe punctuation, but callers can opt into
 * internationalized filenames, length limits, or extra literal characters.
 *
 * Prefer invoking this before interpolating user input into generated regexes
 * or other sensitive contexts. Adjust the options to suit your project's
 * filename/path conventions. Set `allowUnicode: true` to accept
 * international characters.
 */
export function isValidPathInput(
  str: string,
  options: PathValidationOptions,
): boolean {
  const {
    allowUnicode = false,
    maxLength,
    additionalAllowedChars = '',
  } = options || {};

  if (typeof str !== 'string') {
    return false;
  }

  if (typeof maxLength === 'number' && str.length > maxLength) {
    return false;
  }

  // Build a regex depending on whether Unicode support is required.
  // When allowing Unicode, use Unicode property escapes (\p{L}, \p{N}, \p{M}).
  // Note: the `u` flag is required for \p escapes.
  const extra = additionalAllowedChars
    ? additionalAllowedChars.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    : '';

  if (allowUnicode) {
    // Letters, numbers, marks (combining), connector punctuation (includes `_`),
    // plus our safe punctuation: @ . - / \ and space, and any extra allowed chars.
    const pattern = `^[\\p{L}\\p{N}\\p{M}\\p{Pc}@./\\\\ ${extra}-]*$`;
    const re = new RegExp(pattern, 'u');
    return re.test(str);
  }

  // ASCII-only safe set: letters, numbers, underscore, dot, at, dash, slash/backslash and spaces
  const asciiPattern = `^[A-Za-z0-9_@./\\\\ ${extra}-]*$`;
  const asciiRe = new RegExp(asciiPattern);
  return asciiRe.test(str);
}
