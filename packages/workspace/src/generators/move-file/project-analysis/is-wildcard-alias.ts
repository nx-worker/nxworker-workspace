/**
 * Checks whether both alias and path represent wildcard mappings.
 *
 * @param alias - The alias key from tsconfig paths
 * @param pathStr - The resolved path string
 * @returns True when both contain wildcard tokens
 */
export function isWildcardAlias(alias: string, pathStr: string): boolean {
  return alias.includes('*') && pathStr.includes('*');
}
