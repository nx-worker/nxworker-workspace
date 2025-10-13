import { posix as path } from 'node:path';
import { sourceFileExtensions } from '../constants/file-extensions';

/**
 * Checks if a file has one of the supported source file extensions.
 *
 * @param filePath - The file path to check
 * @returns true if the file has a supported extension
 */
export function hasSourceFileExtension(filePath: string): boolean {
  const ext = path.extname(filePath);
  return sourceFileExtensions.includes(
    ext as (typeof sourceFileExtensions)[number],
  );
}
