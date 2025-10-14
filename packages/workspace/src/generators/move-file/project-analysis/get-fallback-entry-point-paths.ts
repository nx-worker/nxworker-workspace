import { ProjectConfiguration } from '@nx/devkit';
import { posix as path } from 'node:path';
import { buildFileNames } from '../path-utils/build-file-names';
import { primaryEntryBaseNames } from '../constants/file-extensions';

const primaryEntryFilenames = buildFileNames(primaryEntryBaseNames);

/**
 * Gets fallback entry point paths when TypeScript compiler paths are unavailable.
 *
 * Returns common entry point file locations based on project structure.
 *
 * @param project - The project configuration
 * @returns Array of potential entry point file paths
 */
export function getFallbackEntryPointPaths(
  project: ProjectConfiguration,
): string[] {
  const sourceRoot = project.sourceRoot || project.root;

  return [
    ...primaryEntryFilenames.map((fileName) => path.join(sourceRoot, fileName)),
    ...primaryEntryFilenames.map((fileName) =>
      path.join(project.root, 'src', fileName),
    ),
  ];
}
