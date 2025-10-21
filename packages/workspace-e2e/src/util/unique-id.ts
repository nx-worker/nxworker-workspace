import { randomUUID } from 'node:crypto';

/**
 * Create a globally unique ID with an optional prefix.
 *
 * @param prefix Optional prefix to the returned ID
 * @returns A unique string ID
 */
export function uniqueId(prefix = ''): string {
  return `${prefix}${randomUUID()}`;
}
