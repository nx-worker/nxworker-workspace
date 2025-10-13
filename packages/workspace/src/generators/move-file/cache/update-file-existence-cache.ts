/**
 * Updates the file existence cache when a file is created or deleted.
 *
 * This function should be called after creating or deleting a file to keep
 * the cache in sync with the actual file system state.
 *
 * @param filePath - Path of the file
 * @param exists - Whether the file exists after the operation
 * @param fileExistenceCache - Cache for file existence checks
 */
export function updateFileExistenceCache(
  filePath: string,
  exists: boolean,
  fileExistenceCache: Map<string, boolean>,
): void {
  fileExistenceCache.set(filePath, exists);
}
