import { posix as path } from 'node:path';
import { sourceFileExtensions } from '../constants/file-extensions';

/**
 * Removes the file extension from a path if it's one of the supported source file extensions.
 *
 * @param filePath - The file path to process
 * @returns The path with extension removed, or the original path if no supported extension
 */
export function removeSourceFileExtension(filePath: string): string {
  const ext = path.extname(filePath);
  if (
    sourceFileExtensions.includes(ext as (typeof sourceFileExtensions)[number])
  ) {
    return filePath.slice(0, -ext.length);
  }
  return filePath;
}
