/**
 * Network Utilities
 *
 * HTTP request utilities for e2e test scenarios.
 */

import { get } from 'node:http';
import { logger } from '@nx/devkit';

/**
 * HTTP GET response
 */
export interface HttpGetResponse {
  /** HTTP status code */
  statusCode: number;
  /** Response body as string */
  body: string;
  /** Response headers */
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Options for HTTP GET requests
 */
export interface HttpGetOptions {
  /** Timeout in milliseconds (default: 5000) */
  timeout?: number;
  /** Number of retry attempts on failure (default: 0) */
  retries?: number;
  /** Delay between retries in milliseconds (default: 1000) */
  retryDelay?: number;
}

/**
 * Makes an HTTP GET request
 *
 * Performs an HTTP GET request to the specified URL and returns the response.
 * Supports timeout, retry logic, and comprehensive error handling.
 *
 * @param url - The URL to request
 * @param options - Optional configuration for the request
 * @returns Promise resolving to the HTTP response
 * @throws Error if the request fails or returns a non-2xx status code
 *
 * @example
 * ```typescript
 * // Simple GET request
 * const response = await httpGet('http://localhost:4873/-/ping');
 * console.log(response.statusCode); // 200
 * console.log(response.body); // Response body
 *
 * // With timeout and retries
 * const response = await httpGet(
 *   'http://localhost:4873/@nxworker/workspace',
 *   { timeout: 10000, retries: 3, retryDelay: 2000 }
 * );
 * const packageData = JSON.parse(response.body);
 * ```
 */
export async function httpGet(
  url: string,
  options: HttpGetOptions = {},
): Promise<HttpGetResponse> {
  const { timeout = 5000, retries = 0, retryDelay = 1000 } = options;

  let lastError: Error | null = null;
  let attempts = 0;

  while (attempts <= retries) {
    try {
      return await executeHttpGet(url, timeout);
    } catch (error) {
      lastError = error as Error;
      attempts++;

      if (attempts <= retries) {
        logger.verbose(
          `HTTP GET failed (attempt ${attempts}/${retries + 1}): ${url}. Retrying after ${retryDelay}ms...`,
        );
        await sleep(retryDelay);
      }
    }
  }

  throw new Error(
    `HTTP GET failed after ${attempts} attempt(s): ${lastError?.message}`,
  );
}

/**
 * Executes a single HTTP GET request
 * @param url - The URL to request
 * @param timeout - Request timeout in milliseconds
 * @returns Promise resolving to the HTTP response
 */
function executeHttpGet(
  url: string,
  timeout: number,
): Promise<HttpGetResponse> {
  return new Promise((resolve, reject) => {
    const request = get(url, (res) => {
      // Validate status code is in 2xx range
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        reject(
          new Error(
            `HTTP request failed: ${url} returned ${res.statusCode || 'unknown status'}`,
          ),
        );
        return;
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          body: data,
          headers: res.headers as Record<string, string | string[] | undefined>,
        });
      });
    });

    // Set timeout
    request.setTimeout(timeout, () => {
      request.destroy();
      reject(new Error(`HTTP request timed out after ${timeout}ms: ${url}`));
    });

    // Handle network errors
    request.on('error', (err) => {
      reject(new Error(`HTTP request failed: ${err.message}`));
    });
  });
}

/**
 * Helper function to sleep for a specified duration
 * @param ms Milliseconds to sleep
 * @returns Promise that resolves after the specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
