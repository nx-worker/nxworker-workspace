/**
 * Unit tests for Retry Utilities
 */

import { withRetry } from './retry-utils';

describe('withRetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should succeed on first attempt', async () => {
    const mockFn = jest.fn().mockResolvedValue('success');

    const result = await withRetry(mockFn, {
      maxAttempts: 3,
      operationName: 'test operation',
    });

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should retry and succeed on second attempt', async () => {
    const mockFn = jest
      .fn()
      .mockRejectedValueOnce(new Error('First attempt failed'))
      .mockResolvedValue('success');

    const result = await withRetry(mockFn, {
      maxAttempts: 3,
      delayMs: 10, // Short delay for testing
      operationName: 'test operation',
    });

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should retry and succeed on third attempt', async () => {
    const mockFn = jest
      .fn()
      .mockRejectedValueOnce(new Error('First attempt failed'))
      .mockRejectedValueOnce(new Error('Second attempt failed'))
      .mockResolvedValue('success');

    const result = await withRetry(mockFn, {
      maxAttempts: 3,
      delayMs: 10,
      operationName: 'test operation',
    });

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should throw error after max attempts exceeded', async () => {
    const error = new Error('Operation failed');
    const mockFn = jest.fn().mockRejectedValue(error);

    await expect(
      withRetry(mockFn, {
        maxAttempts: 3,
        delayMs: 10,
        operationName: 'test operation',
      }),
    ).rejects.toThrow('Operation failed');

    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should use exponential backoff by default', async () => {
    const mockFn = jest
      .fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValue('success');

    const startTime = Date.now();

    await withRetry(mockFn, {
      maxAttempts: 3,
      delayMs: 100,
      exponentialBackoff: true,
      operationName: 'test operation',
    });

    const elapsed = Date.now() - startTime;

    // With exponential backoff: delay 1 = 100ms, delay 2 = 200ms
    // Total should be at least 300ms
    expect(elapsed).toBeGreaterThanOrEqual(290); // Allow 10ms tolerance
  });

  it('should use constant delay when exponential backoff is disabled', async () => {
    const mockFn = jest
      .fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValue('success');

    const startTime = Date.now();

    await withRetry(mockFn, {
      maxAttempts: 3,
      delayMs: 100,
      exponentialBackoff: false,
      operationName: 'test operation',
    });

    const elapsed = Date.now() - startTime;

    // With constant delay: delay 1 = 100ms, delay 2 = 100ms
    // Total should be at least 200ms but less than 300ms
    expect(elapsed).toBeGreaterThanOrEqual(190);
    expect(elapsed).toBeLessThan(300);
  });

  it('should use default options when not provided', async () => {
    const mockFn = jest.fn().mockResolvedValue('success');

    const result = await withRetry(mockFn);

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should handle custom maxAttempts', async () => {
    const error = new Error('Operation failed');
    const mockFn = jest.fn().mockRejectedValue(error);

    await expect(
      withRetry(mockFn, {
        maxAttempts: 5,
        delayMs: 10,
        operationName: 'test operation',
      }),
    ).rejects.toThrow('Operation failed');

    expect(mockFn).toHaveBeenCalledTimes(5);
  });

  it('should preserve return value type', async () => {
    const mockFn = jest.fn().mockResolvedValue({ data: 'test', count: 42 });

    const result = await withRetry(mockFn, {
      maxAttempts: 3,
      operationName: 'test operation',
    });

    expect(result).toEqual({ data: 'test', count: 42 });
    expect(typeof result.count).toBe('number');
  });

  it('should handle async functions that throw synchronously', async () => {
    const error = new Error('Sync error');
    const mockFn = jest.fn().mockImplementation(() => {
      throw error;
    });

    await expect(
      withRetry(mockFn, {
        maxAttempts: 2,
        delayMs: 10,
        operationName: 'test operation',
      }),
    ).rejects.toThrow('Sync error');

    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should handle void return type', async () => {
    const mockFn = jest.fn().mockResolvedValue(undefined);

    const result = await withRetry(mockFn, {
      maxAttempts: 3,
      operationName: 'test operation',
    });

    expect(result).toBeUndefined();
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should retry with different error types', async () => {
    const mockFn = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('Type error'))
      .mockRejectedValueOnce(new RangeError('Range error'))
      .mockResolvedValue('success');

    const result = await withRetry(mockFn, {
      maxAttempts: 3,
      delayMs: 10,
      operationName: 'test operation',
    });

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(3);
  });
});
