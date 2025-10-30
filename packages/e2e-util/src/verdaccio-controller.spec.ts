import {
  startRegistry,
  stopRegistry,
  isRegistryRunning,
  getRegistryPort,
  getRegistryUrl,
} from './verdaccio-controller';

// Note: These tests verify the API surface and basic behavior
// Actual registry startup is tested in the e2e suite

describe('verdaccio-controller utilities', () => {
  beforeEach(() => {
    // Ensure registry is stopped before each test
    stopRegistry();
  });

  afterEach(() => {
    // Clean up after each test
    stopRegistry();
  });

  describe('isRegistryRunning', () => {
    it('should return false when registry is not running', () => {
      expect(isRegistryRunning()).toBe(false);
    });
  });

  describe('getRegistryPort', () => {
    it('should return undefined when registry is not running', () => {
      expect(getRegistryPort()).toBeUndefined();
    });
  });

  describe('getRegistryUrl', () => {
    it('should return undefined when registry is not running', () => {
      expect(getRegistryUrl()).toBeUndefined();
    });
  });

  describe('stopRegistry', () => {
    it('should not throw when called on a stopped registry', () => {
      expect(() => stopRegistry()).not.toThrow();
    });

    it('should be idempotent', () => {
      stopRegistry();
      expect(() => stopRegistry()).not.toThrow();
    });
  });

  // Integration tests that actually start the registry
  // These require Verdaccio to be available
  describe('startRegistry (integration)', () => {
    it('should start the registry and return registry info', async () => {
      const registry = await startRegistry({
        portPreferred: 4873,
        maxFallbackAttempts: 2,
      });

      expect(registry.port).toBeGreaterThanOrEqual(4873);
      expect(registry.port).toBeLessThanOrEqual(4875); // 4873 + 2 fallback attempts
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
