import { ProjectConfiguration } from '@nx/devkit';

/**
 * Finds the project that contains the given file path.
 *
 * Searches through all projects to find one whose sourceRoot or root
 * is an ancestor of the given file path.
 *
 * @param projects - Map of all projects in the workspace
 * @param filePath - The file path to find the project for
 * @returns Project configuration and name, or null if not found
 */
export function findProjectForFile(
  projects: Map<string, ProjectConfiguration>,
  filePath: string,
): { project: ProjectConfiguration; name: string } | null {
  const entry = Array.from(projects.entries()).find(([, project]) => {
    const projectRoot = project.root;
    const sourceRoot = project.sourceRoot || project.root;

    // Check if file is within project's source root or project root
    return (
      filePath.startsWith(sourceRoot + '/') ||
      filePath.startsWith(projectRoot + '/')
    );
  });

  return entry ? { project: entry[1], name: entry[0] } : null;
}
