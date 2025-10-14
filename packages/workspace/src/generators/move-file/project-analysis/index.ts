/**
 * Project analysis utilities for the move-file generator.
 *
 * This module contains functions for analyzing project structure,
 * dependencies, and TypeScript path mappings.
 */

export { findProjectForFile } from './find-project-for-file';
export { isProjectEmpty } from './is-project-empty';
export { getDependentProjectNames } from './get-dependent-project-names';
export { deriveProjectDirectoryFromSource } from './derive-project-directory-from-source';
export { getProjectImportPath } from './get-project-import-path';
export {
  readCompilerPaths,
  clearCompilerPathsCache,
} from './read-compiler-paths';
export { getProjectEntryPointPaths } from './get-project-entry-point-paths';
export { getFallbackEntryPointPaths } from './get-fallback-entry-point-paths';
export { pointsToProjectIndex } from './points-to-project-index';
export { isIndexFilePath } from './is-index-file-path';
export { isWildcardAlias } from './is-wildcard-alias';
export { buildReverseDependencyMap } from './build-reverse-dependency-map';
export { toFirstPath } from './to-first-path';
