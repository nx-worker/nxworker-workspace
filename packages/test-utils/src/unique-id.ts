import { randomBytes } from 'node:crypto';

/**
 * Generate a globally unique ID with an optional prefix.
 *
 * This function replaces lodash's `uniqueId` to provide true global uniqueness
 * using Node.js's `randomBytes` from the crypto module. Unlike lodash's counter-based
 * implementation, this ensures IDs are unique across multiple test runs and processes.
 *
 * @param prefix - Optional string prefix to prepend to the random hex string
 * @returns A unique string in the format: `{prefix}{random-hex-string}`
 *
 * @example
 * ```ts
 * uniqueId('lib-') // => 'lib-a1b2c3d4e5f6a7b8'
 * uniqueId()       // => 'a1b2c3d4e5f6a7b8'
 * ```
 */
export function uniqueId(prefix = ''): string {
  // Generate 8 random bytes and convert to hex string (16 characters)
  // Limited to 16 characters to prevent generating paths that are too long
  const randomHex = randomBytes(8).toString('hex');
  return `${prefix}${randomHex}`;
}
