/// <reference types="jest" />
/* eslint-env jest */
/**
 * Unit tests for tinybench-utils-state module.
 *
 * Tests the internal state management functions used by tinybench-utils.
 * These tests verify that state getters, setters, and reset functionality
 * work correctly in isolation.
 */

// eslint-disable-next-line @nx/enforce-module-boundaries -- Testing internal state management
import {
  getCurrentDescribeBlock,
  getRootDescribeBlock,
  getInsideItCallback,
  setCurrentDescribeBlock,
  setRootDescribeBlock,
  setInsideItCallback,
  resetGlobalState,
  __test_setInsideItCallback,
  type DescribeBlock,
} from '../../../../tools/tinybench-utils-state';

describe('tinybench-utils-state', () => {
  beforeEach(() => {
    // Reset state before each test
    resetGlobalState();
  });

  afterEach(() => {
    // Clean up after each test
    resetGlobalState();
  });

  describe('currentDescribeBlock state', () => {
    it('should initialize as undefined', () => {
      expect(getCurrentDescribeBlock()).toBeUndefined();
    });

    it('should set and get currentDescribeBlock', () => {
      const mockBlock: DescribeBlock = {
        name: 'Test Suite',
        benchmarks: [],
        beforeAllHooks: [],
        afterAllHooks: [],
        beforeEachHooks: [],
        afterEachHooks: [],
        setupHooks: [],
        teardownHooks: [],
        setupSuiteHooks: [],
        teardownSuiteHooks: [],
        children: [],
      };

      setCurrentDescribeBlock(mockBlock);
      expect(getCurrentDescribeBlock()).toBe(mockBlock);
    });

    it('should allow setting currentDescribeBlock to undefined', () => {
      const mockBlock: DescribeBlock = {
        name: 'Test Suite',
        benchmarks: [],
        beforeAllHooks: [],
        afterAllHooks: [],
        beforeEachHooks: [],
        afterEachHooks: [],
        setupHooks: [],
        teardownHooks: [],
        setupSuiteHooks: [],
        teardownSuiteHooks: [],
        children: [],
      };

      setCurrentDescribeBlock(mockBlock);
      expect(getCurrentDescribeBlock()).toBe(mockBlock);

      setCurrentDescribeBlock(undefined);
      expect(getCurrentDescribeBlock()).toBeUndefined();
    });

    it('should update currentDescribeBlock multiple times', () => {
      const block1: DescribeBlock = {
        name: 'Suite 1',
        benchmarks: [],
        beforeAllHooks: [],
        afterAllHooks: [],
        beforeEachHooks: [],
        afterEachHooks: [],
        setupHooks: [],
        teardownHooks: [],
        setupSuiteHooks: [],
        teardownSuiteHooks: [],
        children: [],
      };

      const block2: DescribeBlock = {
        name: 'Suite 2',
        benchmarks: [],
        beforeAllHooks: [],
        afterAllHooks: [],
        beforeEachHooks: [],
        afterEachHooks: [],
        setupHooks: [],
        teardownHooks: [],
        setupSuiteHooks: [],
        teardownSuiteHooks: [],
        children: [],
      };

      setCurrentDescribeBlock(block1);
      expect(getCurrentDescribeBlock()).toBe(block1);

      setCurrentDescribeBlock(block2);
      expect(getCurrentDescribeBlock()).toBe(block2);
    });
  });

  describe('rootDescribeBlock state', () => {
    it('should initialize as undefined', () => {
      expect(getRootDescribeBlock()).toBeUndefined();
    });

    it('should set and get rootDescribeBlock', () => {
      const mockBlock: DescribeBlock = {
        name: 'Root Suite',
        benchmarks: [],
        beforeAllHooks: [],
        afterAllHooks: [],
        beforeEachHooks: [],
        afterEachHooks: [],
        setupHooks: [],
        teardownHooks: [],
        setupSuiteHooks: [],
        teardownSuiteHooks: [],
        children: [],
      };

      setRootDescribeBlock(mockBlock);
      expect(getRootDescribeBlock()).toBe(mockBlock);
    });

    it('should allow setting rootDescribeBlock to undefined', () => {
      const mockBlock: DescribeBlock = {
        name: 'Root Suite',
        benchmarks: [],
        beforeAllHooks: [],
        afterAllHooks: [],
        beforeEachHooks: [],
        afterEachHooks: [],
        setupHooks: [],
        teardownHooks: [],
        setupSuiteHooks: [],
        teardownSuiteHooks: [],
        children: [],
      };

      setRootDescribeBlock(mockBlock);
      expect(getRootDescribeBlock()).toBe(mockBlock);

      setRootDescribeBlock(undefined);
      expect(getRootDescribeBlock()).toBeUndefined();
    });
  });

  describe('insideItCallback flag', () => {
    it('should initialize as false', () => {
      expect(getInsideItCallback()).toBe(false);
    });

    it('should set and get insideItCallback to true', () => {
      setInsideItCallback(true);
      expect(getInsideItCallback()).toBe(true);
    });

    it('should set and get insideItCallback to false', () => {
      setInsideItCallback(true);
      expect(getInsideItCallback()).toBe(true);

      setInsideItCallback(false);
      expect(getInsideItCallback()).toBe(false);
    });

    it('should toggle insideItCallback multiple times', () => {
      expect(getInsideItCallback()).toBe(false);

      setInsideItCallback(true);
      expect(getInsideItCallback()).toBe(true);

      setInsideItCallback(false);
      expect(getInsideItCallback()).toBe(false);

      setInsideItCallback(true);
      expect(getInsideItCallback()).toBe(true);
    });
  });

  describe('resetGlobalState', () => {
    it('should reset all state to initial values', () => {
      const mockBlock: DescribeBlock = {
        name: 'Test Suite',
        benchmarks: [],
        beforeAllHooks: [],
        afterAllHooks: [],
        beforeEachHooks: [],
        afterEachHooks: [],
        setupHooks: [],
        teardownHooks: [],
        setupSuiteHooks: [],
        teardownSuiteHooks: [],
        children: [],
      };

      // Set all state
      setCurrentDescribeBlock(mockBlock);
      setRootDescribeBlock(mockBlock);
      setInsideItCallback(true);

      // Verify state is set
      expect(getCurrentDescribeBlock()).toBe(mockBlock);
      expect(getRootDescribeBlock()).toBe(mockBlock);
      expect(getInsideItCallback()).toBe(true);

      // Reset state
      resetGlobalState();

      // Verify all state is reset
      expect(getCurrentDescribeBlock()).toBeUndefined();
      expect(getRootDescribeBlock()).toBeUndefined();
      expect(getInsideItCallback()).toBe(false);
    });

    it('should be idempotent', () => {
      const mockBlock: DescribeBlock = {
        name: 'Test Suite',
        benchmarks: [],
        beforeAllHooks: [],
        afterAllHooks: [],
        beforeEachHooks: [],
        afterEachHooks: [],
        setupHooks: [],
        teardownHooks: [],
        setupSuiteHooks: [],
        teardownSuiteHooks: [],
        children: [],
      };

      setCurrentDescribeBlock(mockBlock);
      setRootDescribeBlock(mockBlock);
      setInsideItCallback(true);

      resetGlobalState();
      resetGlobalState(); // Call twice

      // State should still be reset
      expect(getCurrentDescribeBlock()).toBeUndefined();
      expect(getRootDescribeBlock()).toBeUndefined();
      expect(getInsideItCallback()).toBe(false);
    });
  });

  describe('__test_setInsideItCallback', () => {
    it('should set insideItCallback flag to true', () => {
      expect(getInsideItCallback()).toBe(false);

      __test_setInsideItCallback(true);
      expect(getInsideItCallback()).toBe(true);
    });

    it('should set insideItCallback flag to false', () => {
      setInsideItCallback(true);
      expect(getInsideItCallback()).toBe(true);

      __test_setInsideItCallback(false);
      expect(getInsideItCallback()).toBe(false);
    });

    it('should behave identically to setInsideItCallback', () => {
      // Both functions should produce the same result
      setInsideItCallback(true);
      const result1 = getInsideItCallback();

      resetGlobalState();

      __test_setInsideItCallback(true);
      const result2 = getInsideItCallback();

      expect(result1).toBe(result2);
      expect(result1).toBe(true);
    });
  });

  describe('nested describe blocks', () => {
    it('should support parent-child relationships', () => {
      const parentBlock: DescribeBlock = {
        name: 'Parent Suite',
        benchmarks: [],
        beforeAllHooks: [],
        afterAllHooks: [],
        beforeEachHooks: [],
        afterEachHooks: [],
        setupHooks: [],
        teardownHooks: [],
        setupSuiteHooks: [],
        teardownSuiteHooks: [],
        children: [],
      };

      const childBlock: DescribeBlock = {
        name: 'Child Suite',
        benchmarks: [],
        beforeAllHooks: [],
        afterAllHooks: [],
        beforeEachHooks: [],
        afterEachHooks: [],
        setupHooks: [],
        teardownHooks: [],
        setupSuiteHooks: [],
        teardownSuiteHooks: [],
        children: [],
        parent: parentBlock,
      };

      parentBlock.children.push(childBlock);

      setCurrentDescribeBlock(childBlock);
      setRootDescribeBlock(parentBlock);

      expect(getCurrentDescribeBlock()).toBe(childBlock);
      expect(getCurrentDescribeBlock()?.parent).toBe(parentBlock);
      expect(getRootDescribeBlock()).toBe(parentBlock);
      expect(getRootDescribeBlock()?.children).toContain(childBlock);
    });

    it('should support deeply nested hierarchies', () => {
      const level1: DescribeBlock = {
        name: 'Level 1',
        benchmarks: [],
        beforeAllHooks: [],
        afterAllHooks: [],
        beforeEachHooks: [],
        afterEachHooks: [],
        setupHooks: [],
        teardownHooks: [],
        setupSuiteHooks: [],
        teardownSuiteHooks: [],
        children: [],
      };

      const level2: DescribeBlock = {
        name: 'Level 2',
        benchmarks: [],
        beforeAllHooks: [],
        afterAllHooks: [],
        beforeEachHooks: [],
        afterEachHooks: [],
        setupHooks: [],
        teardownHooks: [],
        setupSuiteHooks: [],
        teardownSuiteHooks: [],
        children: [],
        parent: level1,
      };

      const level3: DescribeBlock = {
        name: 'Level 3',
        benchmarks: [],
        beforeAllHooks: [],
        afterAllHooks: [],
        beforeEachHooks: [],
        afterEachHooks: [],
        setupHooks: [],
        teardownHooks: [],
        setupSuiteHooks: [],
        teardownSuiteHooks: [],
        children: [],
        parent: level2,
      };

      level1.children.push(level2);
      level2.children.push(level3);

      setCurrentDescribeBlock(level3);
      setRootDescribeBlock(level1);

      expect(getCurrentDescribeBlock()).toBe(level3);
      expect(getCurrentDescribeBlock()?.parent).toBe(level2);
      expect(getCurrentDescribeBlock()?.parent?.parent).toBe(level1);
      expect(getRootDescribeBlock()).toBe(level1);
    });
  });

  describe('quiet flag', () => {
    it('should store quiet flag on describe block', () => {
      const quietBlock: DescribeBlock = {
        name: 'Quiet Suite',
        benchmarks: [],
        beforeAllHooks: [],
        afterAllHooks: [],
        beforeEachHooks: [],
        afterEachHooks: [],
        setupHooks: [],
        teardownHooks: [],
        setupSuiteHooks: [],
        teardownSuiteHooks: [],
        children: [],
        quiet: true,
      };

      setCurrentDescribeBlock(quietBlock);
      expect(getCurrentDescribeBlock()?.quiet).toBe(true);
    });

    it('should support undefined quiet flag', () => {
      const normalBlock: DescribeBlock = {
        name: 'Normal Suite',
        benchmarks: [],
        beforeAllHooks: [],
        afterAllHooks: [],
        beforeEachHooks: [],
        afterEachHooks: [],
        setupHooks: [],
        teardownHooks: [],
        setupSuiteHooks: [],
        teardownSuiteHooks: [],
        children: [],
      };

      setCurrentDescribeBlock(normalBlock);
      expect(getCurrentDescribeBlock()?.quiet).toBeUndefined();
    });
  });
});
