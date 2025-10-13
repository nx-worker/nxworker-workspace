import { normalizePath, ProjectConfiguration } from '@nx/devkit';
import { posix as path } from 'node:path';

/**
 * Builds the target file path from the target project and optional directory.
 *
 * @param targetProject - Target project configuration
 * @param sourceFilePath - Original source file path (used to extract filename)
 * @param projectDirectory - Optional directory within the target project, appended to base directory
 * @returns The full target file path
 */
export function buildTargetPath(
  targetProject: ProjectConfiguration,
  sourceFilePath: string,
  projectDirectory?: string,
): string {
  const fileName = path.basename(sourceFilePath);

  // Determine base directory
  const baseRoot =
    targetProject.sourceRoot || path.join(targetProject.root, 'src');

  // Use 'app' for application projects, 'lib' for library projects
  const baseDir = targetProject.projectType === 'application' ? 'app' : 'lib';

  // If projectDirectory is specified, append it to the base directory
  const targetDir = projectDirectory
    ? path.join(baseDir, projectDirectory)
    : baseDir;

  return normalizePath(path.join(baseRoot, targetDir, fileName));
}
