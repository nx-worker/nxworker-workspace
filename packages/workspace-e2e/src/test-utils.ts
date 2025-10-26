import { randomUUID } from 'node:crypto';

/**
 * Generate a unique ID with optional prefix.
 * Uses crypto.randomUUID() for true uniqueness.
 *
 * @param prefix - Optional prefix to prepend to the UUID
 * @returns A unique identifier string
 */
export function uniqueId(prefix = ''): string {
  return prefix + randomUUID();
}
