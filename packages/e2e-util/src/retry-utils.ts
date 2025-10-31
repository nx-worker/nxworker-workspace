/**
 * Retry Utilities
 *
 * Provides retry logic for operations that may fail transiently,
 * such as network requests or external service calls.
 */

import { logger } from '@nx/devkit';

export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number;
  /** Base delay between retries in milliseconds (default: 1000) */
  delayMs?: number;
  /** Whether to use exponential backoff (default: true) */
  exponentialBackoff?: boolean;
  /** Description of the operation for logging (default: 'operation') */
  operationName?: string;
}

/**
 * Executes a function with automatic retry logic
 *
 * Features:
 * - Configurable retry attempts and delays
 * - Exponential backoff support
 * - Detailed logging for debugging
 * - Type-safe return values
 *
 * @param fn - Async function to execute with retries
 * @param options - Retry configuration
 * @returns Promise resolving to the function's return value
 * @throws The last error if all attempts fail
 *
 * @example
 * ```typescript
 * // Retry a network operation with exponential backoff
 * const data = await withRetry(
 *   async () => fetch('https://api.example.com/data').then(r => r.json()),
 *   {
 *     maxAttempts: 3,
 *     delayMs: 1000,
 *     operationName: 'fetch API data',
 *   }
 * );
 * ```
 *
 * @example
 * ```typescript
 * // Retry an exec operation
 * await withRetry(
 *   async () => {
 *     execSync('npm install package', { stdio: 'pipe' });
 *   },
 *   {
 *     maxAttempts: 5,
 *     delayMs: 2000,
 *     operationName: 'npm install',
 *   }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    exponentialBackoff = true,
    operationName = 'operation',
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.verbose(
        `[RETRY] Attempting ${operationName} (attempt ${attempt}/${maxAttempts})`,
      );
      const result = await fn();
      if (attempt > 1) {
        logger.verbose(
          `[RETRY] ${operationName} succeeded on attempt ${attempt}`,
        );
      }
      return result;
    } catch (error) {
      if (attempt === maxAttempts) {
        logger.error(
          `[RETRY] ${operationName} failed after ${maxAttempts} attempts`,
        );
        throw error;
      }

      const delay = exponentialBackoff ? delayMs * attempt : delayMs;
      logger.verbose(
        `[RETRY] ${operationName} failed on attempt ${attempt}, retrying in ${delay}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('Unreachable');
}
