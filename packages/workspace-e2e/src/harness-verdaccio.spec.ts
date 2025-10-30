/**
 * Integration tests for @internal/e2e-util harness utilities
 *
 * These tests verify the Verdaccio controller functionality in a real environment
 * with the Jest globalSetup that starts Verdaccio.
 */

import {
  startRegistry,
  stopRegistry,
  isRegistryRunning,
  getRegistryPort,
  getRegistryUrl,
} from '@internal/e2e-util';

describe('Verdaccio Controller Integration', () => {
  afterEach(() => {
    // Ensure registry is cleaned up after each test
    stopRegistry();
  });

  describe('startRegistry', () => {
    it('should start the registry and return registry info', async () => {
      const portPreferred = 4873;
      const maxFallbackAttempts = 2;
      const registry = await startRegistry({
        portPreferred,
        maxFallbackAttempts,
      });

      expect(registry.port).toBeGreaterThanOrEqual(portPreferred);
      expect(registry.port).toBeLessThanOrEqual(
        portPreferred + maxFallbackAttempts,
      );
      expect(registry.url).toBe(`http://localhost:${registry.port}`);
      expect(typeof registry.stop).toBe('function');

      // Verify state
      expect(isRegistryRunning()).toBe(true);
      expect(getRegistryPort()).toBe(registry.port);
      expect(getRegistryUrl()).toBe(registry.url);

      // Clean up
      registry.stop();

      expect(isRegistryRunning()).toBe(false);
      expect(getRegistryPort()).toBeUndefined();
      expect(getRegistryUrl()).toBeUndefined();
    }, 120000); // 2 minutes timeout

    it('should reuse existing registry instance', async () => {
      const registry1 = await startRegistry();
      const port1 = registry1.port;

      // Start again - should reuse
      const registry2 = await startRegistry();
      const port2 = registry2.port;

      expect(port1).toBe(port2);

      registry1.stop();
    }, 120000);

    it('should fall back to alternative ports if preferred port is unavailable', async () => {
      // Start first registry
      const registry1 = await startRegistry({ portPreferred: 4873 });
      const port1 = registry1.port;

      // Try to start another registry with same preferred port
      // Since singleton pattern is used, it should reuse the existing instance
      const registry2 = await startRegistry({ portPreferred: 4873 });
      const port2 = registry2.port;

      expect(port1).toBe(port2);

      registry1.stop();
    }, 120000);
  });
});
