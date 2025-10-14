/**
 * Normalizes a path mapping entry to its first string value.
 *
 * TypeScript path mappings can be a string or an array of strings.
 * This function normalizes to a single string.
 *
 * @param pathEntry - Single string or string array entry from tsconfig paths
 * @returns The first path string or null when not resolvable
 */
export function toFirstPath(pathEntry: unknown): string | null {
  if (typeof pathEntry === 'string') {
    return pathEntry;
  }

  if (Array.isArray(pathEntry) && typeof pathEntry[0] === 'string') {
    return pathEntry[0];
  }

  return null;
}
