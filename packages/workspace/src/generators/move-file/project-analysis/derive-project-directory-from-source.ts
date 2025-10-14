import { ProjectConfiguration } from '@nx/devkit';
import { posix as path } from 'node:path';

/**
 * Derives the target directory from a source file path.
 *
 * Extracts the directory structure relative to the project's base directory (lib/ or app/).
 * Returns undefined if the file is not in the expected structure.
 *
 * @param sourceFilePath - Source file path
 * @param sourceProject - Source project configuration
 * @returns Directory path or undefined if not derivable
 */
export function deriveProjectDirectoryFromSource(
  sourceFilePath: string,
  sourceProject: ProjectConfiguration,
): string | undefined {
  const sourceRoot = sourceProject.sourceRoot || sourceProject.root;
  const baseDir = sourceProject.projectType === 'application' ? 'app' : 'lib';

  // Get the path relative to source root
  const relativeToSourceRoot = path.relative(sourceRoot, sourceFilePath);

  // Check if the file is within the base directory (lib or app)
  const baseDirPrefix = baseDir + '/';
  if (!relativeToSourceRoot.startsWith(baseDirPrefix)) {
    // File is not in the expected base directory, return undefined
    return undefined;
  }

  // Remove the base directory prefix
  const afterBaseDir = relativeToSourceRoot.substring(baseDirPrefix.length);

  // Get the directory part (without the filename)
  const dirPath = path.dirname(afterBaseDir);

  // If dirPath is '.' it means the file is directly in the base directory
  if (dirPath === '.') {
    return undefined;
  }

  return dirPath;
}
