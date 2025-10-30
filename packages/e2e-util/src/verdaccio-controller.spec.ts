/**
 * Unit tests for Verdaccio Controller
 *
 * Note: These tests focus on the public API and basic functionality.
 * Port availability checking is tested through integration tests.
 */

import { stopLocalRegistry } from './verdaccio-controller';

// Mock @nx/devkit logger
jest.mock('@nx/devkit', () => ({
  logger: {
    verbose: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Verdaccio Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('stopLocalRegistry', () => {
    it('should stop a running registry', async () => {
      const stopFn = jest.fn();

      await stopLocalRegistry(stopFn);

      expect(stopFn).toHaveBeenCalled();
    });

    it('should handle stopping with undefined function gracefully', async () => {
      await expect(
        stopLocalRegistry(undefined as unknown as () => void),
      ).resolves.not.toThrow();
    });

    it('should handle stopping with null function gracefully', async () => {
      await expect(
        stopLocalRegistry(null as unknown as () => void),
      ).resolves.not.toThrow();
    });

    it('should not throw when stop function is provided', async () => {
      const stopFn = jest.fn();

      await expect(stopLocalRegistry(stopFn)).resolves.not.toThrow();
      expect(stopFn).toHaveBeenCalled();
    });
  });

  describe('Configuration types', () => {
    it('should export VerdaccioConfig type', () => {
      // This is a compile-time test
      // If the types are not exported correctly, this file won't compile
      const config: import('./verdaccio-controller').VerdaccioConfig = {
        port: 4873,
        maxFallbackAttempts: 3,
        storage: './test-storage',
        localRegistryTarget: 'test:target',
        verbose: true,
      };

      expect(config).toBeDefined();
      expect(config.port).toBe(4873);
    });

    it('should export StopRegistryFn type', () => {
      // This is a compile-time test
      const stopFn: import('./verdaccio-controller').StopRegistryFn = jest.fn();

      expect(stopFn).toBeDefined();
    });
  });
});
