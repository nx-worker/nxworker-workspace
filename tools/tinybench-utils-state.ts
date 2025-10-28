/**
 * Internal state management for tinybench-utils.
 *
 * ⚠️ **INTERNAL MODULE:** Do not import this in production code!
 * This module is only for internal use by tinybench-utils and its tests.
 *
 * @internal
 */

import type { BenchOptions, Fn, FnOptions } from 'tinybench';

/**
 * Internal representation of a registered benchmark
 *
 * @internal
 */
export interface RegisteredBenchmark {
  name: string;
  fn: Fn;
  fnOptions: FnOptions;
  benchOptions?: Omit<BenchOptions, 'name'>;
  itTimeout?: number;
  quiet?: boolean;
}

/**
 * Hook with optional timeout configuration
 *
 * @internal
 */
export interface HookWithTimeout {
  fn: () => void | Promise<void>;
  timeout?: number;
}

/**
 * Represents a describe block with its benchmarks and hooks
 *
 * @internal
 */
export interface DescribeBlock {
  name: string;
  benchmarks: RegisteredBenchmark[];
  beforeAllHooks: Array<() => void | Promise<void>>;
  afterAllHooks: Array<() => void | Promise<void>>;
  beforeEachHooks: Array<() => void | Promise<void>>;
  afterEachHooks: Array<() => void | Promise<void>>;
  setupHooks: Array<() => void | Promise<void>>;
  teardownHooks: Array<() => void | Promise<void>>;
  setupSuiteHooks: HookWithTimeout[];
  teardownSuiteHooks: HookWithTimeout[];
  children: DescribeBlock[];
  parent?: DescribeBlock;
  quiet?: boolean;
}

/**
 * Global state for tracking current describe block (internal)
 *
 * @internal
 */
let currentDescribeBlock: DescribeBlock | undefined = undefined;

/**
 * Global state for tracking root describe block (internal)
 *
 * @internal
 */
let rootDescribeBlock: DescribeBlock | undefined = undefined;

/**
 * Global state for tracking if we're inside an it() callback (internal)
 *
 * @internal
 */
let insideItCallback = false;

/**
 * Getters for reading state (used by tinybench-utils.ts)
 *
 * @internal
 */
export function getCurrentDescribeBlock(): DescribeBlock | undefined {
  return currentDescribeBlock;
}

/**
 * @internal
 */
export function getRootDescribeBlock(): DescribeBlock | undefined {
  return rootDescribeBlock;
}

/**
 * @internal
 */
export function getInsideItCallback(): boolean {
  return insideItCallback;
}

/**
 * Setters for updating state (used by tinybench-utils.ts)
 *
 * @internal
 */
export function setCurrentDescribeBlock(
  block: DescribeBlock | undefined,
): void {
  currentDescribeBlock = block;
}

/**
 * @internal
 */
export function setRootDescribeBlock(block: DescribeBlock | undefined): void {
  rootDescribeBlock = block;
}

/**
 * @internal
 */
export function setInsideItCallback(value: boolean): void {
  insideItCallback = value;
}

/**
 * Resets all global state to initial values.
 *
 * ⚠️ **FOR TEST ISOLATION ONLY:** This function should only be called
 * in test setup (beforeEach) to ensure clean state between tests.
 * DO NOT call this in production code.
 *
 * Clears:
 * - currentDescribeBlock
 * - rootDescribeBlock
 * - insideItCallback flag
 *
 * @internal
 */
export function resetGlobalState(): void {
  currentDescribeBlock = undefined;
  rootDescribeBlock = undefined;
  insideItCallback = false;
}
