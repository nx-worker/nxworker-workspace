/**
 * Updates the project source files cache incrementally when a file is moved.
 * This is more efficient than invalidating and re-scanning the entire project.
 *
 * @param projectRoot - Root path of the project
 * @param oldPath - Path of the file being moved
 * @param newPath - New path of the file (or null if file is being removed from project)
 * @param projectSourceFilesCache - Cache for source files per project
 */
export function updateProjectSourceFilesCache(
  projectRoot: string,
  oldPath: string,
  newPath: string | null,
  projectSourceFilesCache: Map<string, string[]>,
): void {
  const cached = projectSourceFilesCache.get(projectRoot);
  if (!cached) {
    return; // Cache doesn't exist for this project, nothing to update
  }

  // Remove old path
  const oldIndex = cached.indexOf(oldPath);
  if (oldIndex !== -1) {
    cached.splice(oldIndex, 1);
  }

  // Add new path if it's still in this project
  if (newPath && newPath.startsWith(projectRoot + '/')) {
    cached.push(newPath);
  }
}
