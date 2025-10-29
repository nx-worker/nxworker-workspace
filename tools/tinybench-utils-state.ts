/**
 * Internal state management for tinybench-utils.
 *
 * ⚠️ **INTERNAL MODULE:** Do not import this in production code!
 * This module is only for internal use by tinybench-utils and its tests.
 *
 * @internal
 */

import type { BenchOptions, Fn, FnOptions, Task } from 'tinybench';

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
 * **Hook Types:**
 * - `setupSuiteHooks`/`teardownSuiteHooks`: Suite-level hooks (Jest context, no Task/mode)
 * - `setupHooks`/`teardownHooks`: Task cycle hooks (Tinybench context with Task/mode)
 * - `beforeAllHooks`/`afterAllHooks`: Iteration group hooks (Tinybench context with Task/mode)
 * - `beforeEachHooks`/`afterEachHooks`: Per-iteration hooks (Tinybench context with Task/mode)
 *
 * @internal
 */
export interface DescribeBlock {
  name: string;
  benchmarks: RegisteredBenchmark[];
  /** beforeAllIterations hooks - receive Task and mode parameters */
  beforeAllHooks: Array<
    (task?: Task, mode?: 'run' | 'warmup') => void | Promise<void>
  >;
  /** afterAllIterations hooks - receive Task and mode parameters */
  afterAllHooks: Array<
    (task?: Task, mode?: 'run' | 'warmup') => void | Promise<void>
  >;
  /** beforeEachIteration hooks - receive Task and mode parameters */
  beforeEachHooks: Array<
    (task?: Task, mode?: 'run' | 'warmup') => void | Promise<void>
  >;
  /** afterEachIteration hooks - receive Task and mode parameters */
  afterEachHooks: Array<
    (task?: Task, mode?: 'run' | 'warmup') => void | Promise<void>
  >;
  /** setupTask hooks - receive Task and mode parameters */
  setupHooks: Array<
    (task?: Task, mode?: 'run' | 'warmup') => void | Promise<void>
  >;
  /** teardownTask hooks - receive Task and mode parameters */
  teardownHooks: Array<
    (task?: Task, mode?: 'run' | 'warmup') => void | Promise<void>
  >;
  /** beforeAll (suite-level) hooks - Jest context, no Task/mode parameters */
  setupSuiteHooks: HookWithTimeout[];
  /** afterAll (suite-level) hooks - Jest context, no Task/mode parameters */
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

/**
 * FOR TESTING ONLY: Allows tests to manually set the insideItCallback flag
 * to test validation logic without executing benchmarks.
 *
 * ⚠️ **TEST-ONLY API:** This function exists solely for testing the hook
 * validation logic. It should NEVER be used in production code.
 *
 * Use case: Testing that hooks properly throw errors when called inside
 * it() callbacks, without needing to actually execute async benchmarks.
 *
 * @param value - The value to set for the insideItCallback flag
 *
 * @internal
 */
export function __test_setInsideItCallback(value: boolean): void {
  insideItCallback = value;
}
