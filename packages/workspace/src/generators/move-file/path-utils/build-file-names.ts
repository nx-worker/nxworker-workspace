import { entrypointExtensions } from '../constants/file-extensions';

/**
 * Builds a list of file names by combining base names with entry point extensions.
 * For example, ['index', 'main'] with extensions ['.ts', '.js'] produces:
 * ['index.ts', 'index.js', 'main.ts', 'main.js']
 *
 * @param baseNames - Array of base file names (without extensions)
 * @returns Array of file names with all possible entry point extensions
 */
export function buildFileNames(baseNames: readonly string[]): string[] {
  return baseNames.flatMap((base) =>
    entrypointExtensions.map((ext) => `${base}.${ext}`),
  );
}
