/**
 * Unit tests for Cleanup Utilities
 */

import { cleanupWorkspace, clearNxCache } from './cleanup-utils';
import { rmSync, existsSync } from 'node:fs';

// Mock node:fs
jest.mock('node:fs');

// Mock @nx/devkit logger
jest.mock('@nx/devkit', () => ({
  logger: {
    verbose: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const mockRmSync = rmSync as jest.MockedFunction<typeof rmSync>;
const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;

describe('Cleanup Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('cleanupWorkspace', () => {
    it('should remove workspace directory successfully', async () => {
      mockExistsSync.mockReturnValue(true);
      mockRmSync.mockImplementation(() => undefined);

      await cleanupWorkspace('/test/workspace');

      expect(mockRmSync).toHaveBeenCalledWith('/test/workspace', {
        recursive: true,
        force: true,
      });
    });

    it('should skip cleanup if directory does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      await cleanupWorkspace('/test/nonexistent');

      expect(mockRmSync).not.toHaveBeenCalled();
    });

    it('should retry on EBUSY error (Windows file locking)', async () => {
      mockExistsSync.mockReturnValue(true);
      let attempts = 0;
      mockRmSync.mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          const error: NodeJS.ErrnoException = new Error('EBUSY');
          error.code = 'EBUSY';
          throw error;
        }
        return undefined;
      });

      await cleanupWorkspace('/test/workspace', 5, 10);

      expect(mockRmSync).toHaveBeenCalledTimes(3);
    });

    it('should retry on ENOTEMPTY error', async () => {
      mockExistsSync.mockReturnValue(true);
      let attempts = 0;
      mockRmSync.mockImplementation(() => {
        attempts++;
        if (attempts < 2) {
          const error: NodeJS.ErrnoException = new Error('ENOTEMPTY');
          error.code = 'ENOTEMPTY';
          throw error;
        }
        return undefined;
      });

      await cleanupWorkspace('/test/workspace', 5, 10);

      expect(mockRmSync).toHaveBeenCalledTimes(2);
    });

    it('should throw immediately on non-retryable errors', async () => {
      mockExistsSync.mockReturnValue(true);
      const error = new Error('EACCES: permission denied');
      mockRmSync.mockImplementation(() => {
        throw error;
      });

      await expect(cleanupWorkspace('/test/workspace')).rejects.toThrow(
        'EACCES: permission denied',
      );

      expect(mockRmSync).toHaveBeenCalledTimes(1);
    });

    it('should throw after exhausting max attempts', async () => {
      mockExistsSync.mockReturnValue(true);
      mockRmSync.mockImplementation(() => {
        const error: NodeJS.ErrnoException = new Error('EBUSY');
        error.code = 'EBUSY';
        throw error;
      });

      await expect(cleanupWorkspace('/test/workspace', 3, 10)).rejects.toThrow(
        'Failed to cleanup workspace after 3 attempts',
      );

      expect(mockRmSync).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff for retries', async () => {
      mockExistsSync.mockReturnValue(true);
      const delays: number[] = [];
      let attempts = 0;

      mockRmSync.mockImplementation(() => {
        attempts++;
        if (attempts < 4) {
          const error: NodeJS.ErrnoException = new Error('EBUSY');
          error.code = 'EBUSY';
          throw error;
        }
        return undefined;
      });

      // Mock setTimeout to capture delays
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = jest.fn((callback, delay) => {
        delays.push(delay as number);
        return originalSetTimeout(callback as () => void, 0);
      }) as unknown as typeof setTimeout;

      try {
        await cleanupWorkspace('/test/workspace', 5, 100);

        // Verify exponential backoff: 100ms, 200ms, 400ms
        expect(delays.length).toBeGreaterThan(0);
        expect(delays[0]).toBe(100);
        if (delays.length > 1) {
          expect(delays[1]).toBe(200);
        }
        if (delays.length > 2) {
          expect(delays[2]).toBe(400);
        }
      } finally {
        global.setTimeout = originalSetTimeout;
      }
    });

    it('should accept custom maxAttempts parameter', async () => {
      mockExistsSync.mockReturnValue(true);
      mockRmSync.mockImplementation(() => {
        const error: NodeJS.ErrnoException = new Error('EBUSY');
        error.code = 'EBUSY';
        throw error;
      });

      await expect(cleanupWorkspace('/test/workspace', 2, 10)).rejects.toThrow(
        'Failed to cleanup workspace after 2 attempts',
      );

      expect(mockRmSync).toHaveBeenCalledTimes(2);
    });

    it('should accept custom delay parameter', async () => {
      mockExistsSync.mockReturnValue(true);
      let attempts = 0;
      mockRmSync.mockImplementation(() => {
        attempts++;
        if (attempts < 2) {
          const error: NodeJS.ErrnoException = new Error('EBUSY');
          error.code = 'EBUSY';
          throw error;
        }
        return undefined;
      });

      const delays: number[] = [];
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = jest.fn((callback, delay) => {
        delays.push(delay as number);
        return originalSetTimeout(callback as () => void, 0);
      }) as unknown as typeof setTimeout;

      try {
        await cleanupWorkspace('/test/workspace', 5, 50);

        expect(delays[0]).toBe(50);
      } finally {
        global.setTimeout = originalSetTimeout;
      }
    });
  });

  describe('clearNxCache', () => {
    it('should clear Nx cache directory successfully', async () => {
      mockExistsSync.mockReturnValue(true);
      mockRmSync.mockImplementation(() => undefined);

      await clearNxCache();

      expect(mockRmSync).toHaveBeenCalledWith(
        expect.stringContaining('.nx/cache'),
        {
          recursive: true,
          force: true,
        },
      );
    });

    it('should skip if cache directory does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      await clearNxCache();

      expect(mockRmSync).not.toHaveBeenCalled();
    });

    it('should throw error if cache clearing fails', async () => {
      mockExistsSync.mockReturnValue(true);
      const error = new Error('Failed to remove cache');
      mockRmSync.mockImplementation(() => {
        throw error;
      });

      await expect(clearNxCache()).rejects.toThrow('Failed to remove cache');
    });

    it('should use correct cache path relative to cwd', async () => {
      mockExistsSync.mockReturnValue(true);
      const originalCwd = process.cwd();

      try {
        // Mock process.cwd to verify path construction
        process.cwd = jest.fn(() => '/test/project');

        await clearNxCache();

        expect(mockRmSync).toHaveBeenCalledWith('/test/project/.nx/cache', {
          recursive: true,
          force: true,
        });
      } finally {
        process.cwd = originalCwd as () => string;
      }
    });
  });

  describe('sleep helper', () => {
    it('should resolve after specified duration', async () => {
      // This is tested indirectly through cleanupWorkspace retries
      // We verify that setTimeout is called with correct delays
      mockExistsSync.mockReturnValue(true);
      let attempts = 0;
      mockRmSync.mockImplementation(() => {
        attempts++;
        if (attempts < 2) {
          const error: NodeJS.ErrnoException = new Error('EBUSY');
          error.code = 'EBUSY';
          throw error;
        }
        return undefined;
      });

      const timeoutCalls: number[] = [];
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = jest.fn((callback, delay) => {
        timeoutCalls.push(delay as number);
        return originalSetTimeout(callback as () => void, 0);
      }) as unknown as typeof setTimeout;

      try {
        await cleanupWorkspace('/test/workspace', 5, 100);

        expect(timeoutCalls.length).toBeGreaterThan(0);
        expect(timeoutCalls[0]).toBe(100);
      } finally {
        global.setTimeout = originalSetTimeout;
      }
    });
  });
});
