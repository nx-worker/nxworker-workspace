/**
 * Export Verification Helpers
 *
 * Shared utilities for verifying that library index files export the expected
 * files after move operations.
 *
 * Parent Issue: #319 - Adopt new end-to-end test plan
 * Enhancement: Code review suggestion from PR #338
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path/posix';

/**
 * Verifies that a library's index.ts exports the specified file
 *
 * @param workspacePath - Root path of the test workspace
 * @param libName - Library project name
 * @param expectedExport - Expected export name or pattern to find in index.ts
 * @throws Error if export is not found in the library's index file
 *
 * @example
 * ```typescript
 * verifyExportInIndex(workspace.path, 'lib-shared', 'helper');
 * // Checks that lib-shared/src/index.ts contains 'helper' in an export
 * ```
 */
export function verifyExportInIndex(
  workspacePath: string,
  libName: string,
  expectedExport: string,
): void {
  const indexPath = join(workspacePath, libName, 'src', 'index.ts');
  const indexContent = readFileSync(indexPath, 'utf-8');

  if (!indexContent.includes(expectedExport)) {
    throw new Error(
      `Library ${libName} index.ts does not export '${expectedExport}'.\nContent:\n${indexContent}`,
    );
  }
}
