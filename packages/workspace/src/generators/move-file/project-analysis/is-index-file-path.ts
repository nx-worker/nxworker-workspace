import { buildFileNames } from '../path-utils/build-file-names';
import { buildPatterns } from '../path-utils/build-patterns';
import { primaryEntryBaseNames } from '../constants/file-extensions';

const primaryEntryFilenames = buildFileNames(primaryEntryBaseNames);
const mainEntryFilenames = buildFileNames(['main']);

const entrypointPatterns = buildPatterns(
  ['', 'src/', 'lib/'],
  primaryEntryFilenames,
);
const mainEntryPatterns = buildPatterns(['', 'src/'], mainEntryFilenames);

/**
 * Determines if a path string references a supported index file using pattern matching.
 * This is a fallback when we can't dynamically verify the file exists.
 *
 * @param pathStr - Path value from the tsconfig mapping
 * @returns True if the path matches common index file patterns
 */
export function isIndexFilePath(pathStr: string): boolean {
  const indexPatterns = [...entrypointPatterns, ...mainEntryPatterns];

  return indexPatterns.some((pattern) => pathStr.endsWith(pattern));
}
