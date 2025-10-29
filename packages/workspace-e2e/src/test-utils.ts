import { randomUUID } from 'node:crypto';

/**
 * Generate a globally unique ID with an optional prefix.
 *
 * This function replaces lodash's `uniqueId` to provide true global uniqueness
 * using Node.js's `randomUUID` from the crypto module. Unlike lodash's counter-based
 * implementation, this ensures IDs are unique across multiple test runs and processes.
 *
 * @param prefix - Optional string prefix to prepend to the UUID
 * @returns A unique string in the format: `{prefix}{uuid-without-dashes}`
 *
 * @example
 * ```ts
 * uniqueId('lib-') // => 'lib-a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'
 * uniqueId()       // => 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'
 * ```
 */
export function uniqueId(prefix = ''): string {
  // Generate UUID and remove dashes to match the numeric-style format of lodash
  const uuid = randomUUID().replace(/-/g, '');
  return `${prefix}${uuid}`;
}
