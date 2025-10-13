/**
 * Splits a comma-separated string into patterns, respecting brace expansions.
 * Commas inside braces are not treated as separators.
 *
 * For example: "file1.ts,file.{ts,js}" => ["file1.ts", "file.{ts,js}"]
 *
 * @param input - Comma-separated string that may contain brace expansions
 * @returns Array of individual patterns with whitespace trimmed
 */
export function splitPatterns(input: string): string[] {
  const patterns: string[] = [];
  let current = '';
  let braceDepth = 0;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (char === '{') {
      braceDepth++;
      current += char;
    } else if (char === '}') {
      braceDepth--;
      current += char;
    } else if (char === ',' && braceDepth === 0) {
      // This is a separator comma, not part of a brace expansion
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        patterns.push(trimmed);
      }
      current = '';
    } else {
      current += char;
    }
  }

  // Don't forget the last pattern
  const trimmed = current.trim();
  if (trimmed.length > 0) {
    patterns.push(trimmed);
  }

  return patterns;
}
