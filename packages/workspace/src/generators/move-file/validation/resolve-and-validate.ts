import { Tree, ProjectConfiguration } from '@nx/devkit';
import { posix as path } from 'node:path';
import { MoveFileGeneratorSchema } from '../schema';
import { sanitizePath } from '../security-utils/sanitize-path';
import { isValidPathInput } from '../security-utils/is-valid-path-input';
import { treeReadCache } from '../tree-cache';
import type { MoveContext } from '../types/move-context';
import { buildTargetPath } from '../path-utils/build-target-path';
import { findProjectForFile } from '../project-analysis/find-project-for-file';
import { deriveProjectDirectoryFromSource } from '../project-analysis/derive-project-directory-from-source';
import { getProjectImportPath } from '../project-analysis/get-project-import-path';
import { isFileExported } from '../export-management/is-file-exported';
import { checkForImportsInProject } from './check-for-imports-in-project';

/**
 * Normalizes, validates, and gathers metadata about the source and target files.
 *
 * @param tree - The virtual file system tree.
 * @param options - Raw options supplied to the generator.
 * @param projects - Map of all projects in the workspace.
 * @param cachedTreeExists - Function to check if a file exists (with caching).
 * @param getProjectSourceFiles - Function to get project source files (with caching).
 * @returns Resolved context data describing the move operation.
 */
export function resolveAndValidate(
  tree: Tree,
  options: MoveFileGeneratorSchema,
  projects: Map<string, ProjectConfiguration>,
  cachedTreeExists: (tree: Tree, filePath: string) => boolean,
  getProjectSourceFiles: (tree: Tree, projectRoot: string) => string[],
): MoveContext {
  // Check if the file input contains glob characters
  const isGlobPattern = /[*?[\]{}]/.test(options.file);

  // Validate user input to avoid accepting regex-like patterns or dangerous characters
  if (
    !isValidPathInput(options.file, {
      allowUnicode: !!options.allowUnicode,
      allowGlobPatterns: isGlobPattern,
    })
  ) {
    throw new Error(
      `Invalid path input for 'file': contains disallowed characters: "${options.file}"`,
    );
  }

  // Validate project name
  if (
    !isValidPathInput(options.project, {
      allowUnicode: !!options.allowUnicode,
    })
  ) {
    throw new Error(
      `Invalid project name: contains disallowed characters: "${options.project}"`,
    );
  }

  // Validate project name exists
  const targetProject = projects.get(options.project);
  if (!targetProject) {
    throw new Error(
      `Target project "${options.project}" not found in workspace`,
    );
  }

  // Validate that deriveProjectDirectory and projectDirectory are not both set
  if (options.deriveProjectDirectory && options.projectDirectory) {
    throw new Error(
      'Cannot use both "deriveProjectDirectory" and "projectDirectory" options at the same time',
    );
  }

  // Validate projectDirectory if provided
  if (
    options.projectDirectory &&
    !isValidPathInput(options.projectDirectory, {
      allowUnicode: !!options.allowUnicode,
    })
  ) {
    throw new Error(
      `Invalid path input for 'projectDirectory': contains disallowed characters: "${options.projectDirectory}"`,
    );
  }

  const normalizedSource = sanitizePath(options.file);

  // Verify source file exists before deriving directory
  if (!cachedTreeExists(tree, normalizedSource)) {
    throw new Error(`Source file "${normalizedSource}" not found`);
  }

  // Find which project the source file belongs to (needed for deriving directory)
  const sourceProjectInfo = findProjectForFile(projects, normalizedSource);

  if (!sourceProjectInfo) {
    throw new Error(
      `Could not determine source project for file "${normalizedSource}"`,
    );
  }

  const { project: sourceProject, name: sourceProjectName } = sourceProjectInfo;

  // Derive or use provided projectDirectory
  let sanitizedProjectDirectory: string | undefined;

  if (options.deriveProjectDirectory) {
    // Derive the directory from the source file path
    const derivedDirectory = deriveProjectDirectoryFromSource(
      normalizedSource,
      sourceProject,
    );
    sanitizedProjectDirectory = derivedDirectory
      ? sanitizePath(derivedDirectory)
      : undefined;
  } else if (options.projectDirectory) {
    // Sanitize projectDirectory to prevent path traversal
    sanitizedProjectDirectory = sanitizePath(options.projectDirectory);
  }

  // Construct target path from project and optional directory
  const normalizedTarget = buildTargetPath(
    targetProject,
    normalizedSource,
    sanitizedProjectDirectory,
  );

  // Verify target file does not exist
  if (cachedTreeExists(tree, normalizedTarget)) {
    throw new Error(`Target file "${normalizedTarget}" already exists`);
  }

  const targetProjectName = options.project;

  // Read the file content using cached read for better performance
  const fileContent = treeReadCache.read(tree, normalizedSource, 'utf-8');
  if (!fileContent) {
    throw new Error(`Could not read file "${normalizedSource}"`);
  }

  // Get the relative path within the source project to check if it's exported
  const sourceRoot = sourceProject.sourceRoot || sourceProject.root;
  const relativeFilePathInSource = path.relative(sourceRoot, normalizedSource);

  // Check if file is exported from source project entrypoint
  const isExported = isFileExported(
    tree,
    sourceProject,
    relativeFilePathInSource,
    cachedTreeExists,
  );

  // Get import paths for both projects
  const sourceImportPath = getProjectImportPath(
    tree,
    sourceProjectName,
    sourceProject,
  );
  const targetImportPath = getProjectImportPath(
    tree,
    targetProjectName,
    targetProject,
  );

  // Check if target project already has imports to this file
  const hasImportsInTarget =
    !!targetImportPath &&
    checkForImportsInProject(
      tree,
      targetProject,
      sourceImportPath || normalizedSource,
      getProjectSourceFiles,
    );

  // Check if moving within the same project
  const isSameProject = sourceProjectName === targetProjectName;

  return {
    normalizedSource,
    normalizedTarget,
    sourceProject,
    sourceProjectName,
    targetProject,
    targetProjectName,
    fileContent,
    sourceRoot,
    relativeFilePathInSource,
    isExported,
    sourceImportPath,
    targetImportPath,
    hasImportsInTarget,
    isSameProject,
  };
}
