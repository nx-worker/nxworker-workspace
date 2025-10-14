import {
  ProjectConfiguration,
  Tree,
  visitNotIgnoredFiles,
  normalizePath,
} from '@nx/devkit';
import { posix as path } from 'node:path';
import { getProjectEntryPointPaths } from './get-project-entry-point-paths';
import { buildFileNames } from '../path-utils/build-file-names';
import { primaryEntryBaseNames } from '../constants/file-extensions';
import { hasSourceFileExtension } from '../path-utils/has-source-file-extension';

const primaryEntryFilenames = buildFileNames(primaryEntryBaseNames);

/**
 * Checks if a project is empty (contains only index/entry point files).
 *
 * A project is considered empty if it only contains its entry point file(s)
 * and no other source files.
 *
 * @param tree - The virtual file system tree
 * @param project - The project to check
 * @returns True if the project only contains index files
 */
export function isProjectEmpty(
  tree: Tree,
  project: ProjectConfiguration,
): boolean {
  const sourceRoot = project.sourceRoot || project.root;
  const indexCandidates = new Set(
    getProjectEntryPointPaths(tree, project).map((candidate) =>
      normalizePath(candidate),
    ),
  );

  if (indexCandidates.size === 0) {
    indexCandidates.add(
      normalizePath(path.join(sourceRoot, primaryEntryFilenames[0])),
    );
  }

  // Don't use cache for isProjectEmpty check as we need the current state
  let hasNonIndexSourceFiles = false;

  visitNotIgnoredFiles(tree, sourceRoot, (filePath) => {
    if (hasNonIndexSourceFiles) {
      return; // Short-circuit if we already found a non-index file
    }

    const normalizedFilePath = normalizePath(filePath);
    const isSourceFile = hasSourceFileExtension(normalizedFilePath);

    if (!isSourceFile) {
      return;
    }

    if (indexCandidates.has(normalizedFilePath)) {
      return;
    }

    hasNonIndexSourceFiles = true;
  });

  return !hasNonIndexSourceFiles;
}
