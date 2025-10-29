/// <reference types="jest" />
/* eslint-env jest */
/**
 * Integration tests for tinybench-utils hook registration.
 *
 * These tests validate that suite-level beforeAll and afterAll hooks are properly
 * registered with Jest's beforeAll and afterAll hooks.
 *
 * This test suite uses a different mocking strategy from tinybench-utils.spec.ts
 * to capture hook registration arguments without affecting the main test suite.
 */

// eslint-disable-next-line @nx/enforce-module-boundaries -- Testing tools from workspace root
import {
  describe as benchDescribe,
  it as benchIt,
  beforeAll as benchBeforeAll,
  afterAll as benchAfterAll,
} from '../../../../tools/tinybench-utils';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Testing internal state management
import { resetGlobalState } from '../../../../tools/tinybench-utils-state';

describe('tinybench-utils hook registration', () => {
  let originalBeforeAll: typeof globalThis.beforeAll;
  let originalAfterAll: typeof globalThis.afterAll;
  let originalDescribe: typeof globalThis.describe;
  let originalIt: typeof globalThis.it;

  // Arrays to capture registered hooks
  let registeredBeforeAllHooks: Array<() => void | Promise<void>>;
  let registeredAfterAllHooks: Array<() => void | Promise<void>>;

  beforeEach(() => {
    // Reset global state
    resetGlobalState();

    // Store originals
    originalBeforeAll = globalThis.beforeAll;
    originalAfterAll = globalThis.afterAll;
    originalDescribe = globalThis.describe;
    originalIt = globalThis.it;

    // Reset captured hooks
    registeredBeforeAllHooks = [];
    registeredAfterAllHooks = [];

    // Mock Jest functions to capture hook registration
    globalThis.beforeAll = jest.fn((fn: () => void | Promise<void>) => {
      registeredBeforeAllHooks.push(fn);
    }) as typeof globalThis.beforeAll;

    globalThis.afterAll = jest.fn((fn: () => void | Promise<void>) => {
      registeredAfterAllHooks.push(fn);
    }) as typeof globalThis.afterAll;

    // Mock describe to execute callback immediately
    globalThis.describe = jest.fn((name: string, callback: () => void) => {
      callback();
    }) as typeof globalThis.describe;

    // Mock it to capture registration without executing
    globalThis.it = jest.fn() as typeof globalThis.it;
  });

  afterEach(() => {
    // Restore originals
    globalThis.beforeAll = originalBeforeAll;
    globalThis.afterAll = originalAfterAll;
    globalThis.describe = originalDescribe;
    globalThis.it = originalIt;
  });

  describe('beforeAll hook registration', () => {
    it('should register beforeAll hook as Jest beforeAll', () => {
      const setupHook = jest.fn();

      benchDescribe('Test Suite', () => {
        benchBeforeAll(setupHook);
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
        benchIt('test', () => {});
      });

      // Verify the user's hook was registered
      // Note: tinybench-utils also registers internal hooks for benchmark execution,
      // so we just verify that our hook is present in the array
      expect(registeredBeforeAllHooks).toContain(setupHook);
    });

    it('should register multiple beforeAll hooks in order', () => {
      const hook1 = jest.fn();
      const hook2 = jest.fn();
      const hook3 = jest.fn();

      benchDescribe('Test Suite', () => {
        benchBeforeAll(hook1);
        benchBeforeAll(hook2);
        benchBeforeAll(hook3);
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
        benchIt('test', () => {});
      });

      // Verify all user hooks were registered
      expect(registeredBeforeAllHooks).toContain(hook1);
      expect(registeredBeforeAllHooks).toContain(hook2);
      expect(registeredBeforeAllHooks).toContain(hook3);

      // Verify they appear in order
      const hook1Index = registeredBeforeAllHooks.indexOf(hook1);
      const hook2Index = registeredBeforeAllHooks.indexOf(hook2);
      const hook3Index = registeredBeforeAllHooks.indexOf(hook3);
      expect(hook1Index).toBeLessThan(hook2Index);
      expect(hook2Index).toBeLessThan(hook3Index);
    });

    it('should register beforeAll hooks in nested describe blocks', () => {
      const outerHook = jest.fn();
      const innerHook = jest.fn();

      benchDescribe('Outer Suite', () => {
        benchBeforeAll(outerHook);
        benchDescribe('Inner Suite', () => {
          benchBeforeAll(innerHook);
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      });

      // Both hooks should be registered
      expect(registeredBeforeAllHooks).toContain(outerHook);
      expect(registeredBeforeAllHooks).toContain(innerHook);
    });
  });

  describe('afterAll hook registration', () => {
    it('should register afterAll hook as Jest afterAll', () => {
      const teardownHook = jest.fn();

      benchDescribe('Test Suite', () => {
        benchAfterAll(teardownHook);
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
        benchIt('test', () => {});
      });

      // Verify the user's hook was registered
      expect(registeredAfterAllHooks).toContain(teardownHook);
    });

    it('should register multiple afterAll hooks in order', () => {
      const hook1 = jest.fn();
      const hook2 = jest.fn();

      benchDescribe('Test Suite', () => {
        benchAfterAll(hook1);
        benchAfterAll(hook2);
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
        benchIt('test', () => {});
      });

      // Verify all user hooks were registered
      expect(registeredAfterAllHooks).toContain(hook1);
      expect(registeredAfterAllHooks).toContain(hook2);

      // Verify they appear in order
      const hook1Index = registeredAfterAllHooks.indexOf(hook1);
      const hook2Index = registeredAfterAllHooks.indexOf(hook2);
      expect(hook1Index).toBeLessThan(hook2Index);
    });

    it('should register afterAll hooks in nested describe blocks', () => {
      const outerHook = jest.fn();
      const innerHook = jest.fn();

      benchDescribe('Outer Suite', () => {
        benchAfterAll(outerHook);
        benchDescribe('Inner Suite', () => {
          benchAfterAll(innerHook);
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      });

      // Both hooks should be registered
      expect(registeredAfterAllHooks).toContain(outerHook);
      expect(registeredAfterAllHooks).toContain(innerHook);
    });
  });

  describe('combined beforeAll and afterAll', () => {
    it('should register both setup and teardown hooks', () => {
      const setupHook = jest.fn();
      const teardownHook = jest.fn();

      benchDescribe('Test Suite', () => {
        benchBeforeAll(setupHook);
        benchAfterAll(teardownHook);
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
        benchIt('test', () => {});
      });

      // Verify both user hooks were registered
      expect(registeredBeforeAllHooks).toContain(setupHook);
      expect(registeredAfterAllHooks).toContain(teardownHook);
    });

    it('should register multiple setup and teardown hooks', () => {
      const setup1 = jest.fn();
      const setup2 = jest.fn();
      const teardown1 = jest.fn();
      const teardown2 = jest.fn();

      benchDescribe('Test Suite', () => {
        benchBeforeAll(setup1);
        benchBeforeAll(setup2);
        benchAfterAll(teardown1);
        benchAfterAll(teardown2);
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
        benchIt('test', () => {});
      });

      // Verify all user hooks were registered
      expect(registeredBeforeAllHooks).toContain(setup1);
      expect(registeredBeforeAllHooks).toContain(setup2);
      expect(registeredAfterAllHooks).toContain(teardown1);
      expect(registeredAfterAllHooks).toContain(teardown2);

      // Verify order
      const setup1Index = registeredBeforeAllHooks.indexOf(setup1);
      const setup2Index = registeredBeforeAllHooks.indexOf(setup2);
      const teardown1Index = registeredAfterAllHooks.indexOf(teardown1);
      const teardown2Index = registeredAfterAllHooks.indexOf(teardown2);
      expect(setup1Index).toBeLessThan(setup2Index);
      expect(teardown1Index).toBeLessThan(teardown2Index);
    });
  });
});
