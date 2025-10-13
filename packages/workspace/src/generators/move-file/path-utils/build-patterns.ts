/**
 * Builds a list of patterns by combining prefixes with file names.
 * For example, ['src/', 'lib/'] with ['index.ts', 'main.js'] produces:
 * ['src/index.ts', 'src/main.js', 'lib/index.ts', 'lib/main.js']
 *
 * @param prefixes - Array of path prefixes (e.g., directory paths)
 * @param fileNames - Array of file names
 * @returns Array of combined path patterns
 */
export function buildPatterns(
  prefixes: readonly string[],
  fileNames: readonly string[],
): string[] {
  return prefixes.flatMap((prefix) =>
    fileNames.map((fileName) => `${prefix}${fileName}`),
  );
}
