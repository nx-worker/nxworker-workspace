/**
 * Escape characters with special meaning outside character classes.
 * Use a simple backslash escape when it’s always valid.
 * Prevents ReDoS (Regular Expression Denial of Service) attacks
 * @remarks To escape character classes, use `RegExp.escape` or a `core-js-pure` polyfill.
 * @param str - The string to escape
 * @returns The escaped string safe for use in regular expressions
 */
export function escapeRegex(str: string): string {
  // Escape characters that have special meaning in regular expressions.
  // Hyphen (`-`) does not need escaping outside of character classes, so leave it as-is
  // to match existing test expectations and avoid altering harmless filenames.
  return str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}
