import type { ProjectConfiguration } from '@nx/devkit';

/**
 * Context data for a single file move operation.
 * Contains all resolved paths and metadata needed to execute the move.
 */
export interface MoveContext {
  /**
   * Normalized absolute path of the source file.
   */
  normalizedSource: string;

  /**
   * Normalized absolute path of the target file.
   */
  normalizedTarget: string;

  /**
   * Name of the source project.
   */
  sourceProjectName: string;

  /**
   * Name of the target project.
   */
  targetProjectName: string;

  /**
   * Source project configuration.
   */
  sourceProject: ProjectConfiguration;

  /**
   * Target project configuration.
   */
  targetProject: ProjectConfiguration;

  /**
   * Content of the source file.
   */
  fileContent: string;

  /**
   * Root directory of the source project.
   */
  sourceRoot: string;

  /**
   * Relative path of the file within the source project.
   */
  relativeFilePathInSource: string;

  /**
   * Import path/alias for the source project (if available).
   * Example: '@myorg/source-lib'
   */
  sourceImportPath: string | null;

  /**
   * Import path/alias for the target project (if available).
   * Example: '@myorg/target-lib'
   */
  targetImportPath: string | null;

  /**
   * Whether the file is currently exported from the source project's entry point.
   */
  isExported: boolean;

  /**
   * Whether the target project already has imports to this file.
   */
  hasImportsInTarget: boolean;

  /**
   * Whether the source project has imports to this file.
   */
  hasImportsInSource: boolean;

  /**
   * Whether the source and target are the same project.
   */
  isSameProject: boolean;
}
