import { Bench, BenchOptions, Fn, FnOptions, Task } from 'tinybench';
import {
  getCurrentDescribeBlock,
  getRootDescribeBlock,
  getInsideItCallback,
  setCurrentDescribeBlock,
  setRootDescribeBlock,
  setInsideItCallback,
  type DescribeBlock,
} from './tinybench-utils-state';

// Access Jest functions dynamically so tests can mock them
const getJestDescribe = () => globalThis.describe;
const getJestIt = () => globalThis.it;
const getJestBeforeAll = () => globalThis.beforeAll;
const getJestAfterAll = () => globalThis.afterAll;

/**
 * @fileoverview
 *
 * ## Hook Execution Order
 *
 * ⚠️ IMPORTANT: Hooks execute in a specific order that may be counter-intuitive!
 *
 * **This execution order is defined by Tinybench**, not by this wrapper library.
 * We preserve Tinybench's semantics to maintain compatibility with existing benchmarks.
 * For Tinybench's rationale, see: https://github.com/tinylibs/tinybench
 *
 * ### Complete Execution Sequence (Determined by Tinybench)
 *
 * 1. **setupSuite()** - Runs ONCE before any benchmarks in the suite
 *    - Registered as Jest beforeAll (first)
 *    - Use for shared state initialization across all benchmarks
 *    - Available in: setupSuite hooks, and all subsequent hooks/benchmarks
 *
 * 2. **Benchmark Execution** (all benchmarks run in a single Jest beforeAll)
 *    For EACH benchmark in the suite:
 *
 *    a. **setup()** - Runs ONCE before benchmark starts (before warmup)
 *       - ⚠️ RUNS BEFORE beforeAll() - this is counter-intuitive!
 *       - Use for expensive initialization that beforeAll/beforeEach need
 *       - Available in: setup, beforeAll, beforeEach, afterEach, afterAll, teardown
 *
 *    b. **beforeAll()** - Runs ONCE before all iterations (warmup + measured)
 *       - Use for per-benchmark initialization
 *       - Can access state from setupSuite() and setup()
 *       - Available in: beforeAll, beforeEach, afterEach, afterAll, teardown
 *
 *    c. **WARMUP PHASE** (if warmup is enabled)
 *       - beforeEach() → benchmark function → afterEach()
 *       - Repeated for warmup iterations (typically 5)
 *       - Results are NOT measured/recorded
 *       - ⚠️ beforeEach/afterEach run during warmup too!
 *
 *    d. **MEASUREMENT PHASE**
 *       - beforeEach() → benchmark function → afterEach()
 *       - Repeated for measured iterations (typically hundreds/thousands)
 *       - Results ARE measured and recorded
 *
 *    e. **afterAll()** - Runs ONCE after all iterations (warmup + measured)
 *       - Use for per-benchmark cleanup
 *       - Available in: afterAll, teardown
 *
 *    f. **teardown()** - Runs ONCE after benchmark completes
 *       - Use to clean up resources from setup()
 *       - Available in: teardown only
 *
 * 3. **teardownSuite()** - Runs ONCE after all benchmarks complete
 *    - Registered as Jest afterAll (last)
 *    - Use to clean up resources from setupSuite()
 *
 * ### Common Pitfalls
 *
 * ❌ **WRONG:** Initializing shared state in beforeAll() that setup() needs
 * ```ts
 * beforeAll(() => { sharedState = init(); }); // Runs AFTER setup!
 * setup(() => { use(sharedState); }); // ERROR: sharedState not initialized yet!
 * ```
 *
 * ✅ **CORRECT:** Initialize in setupSuite() or setup()
 * ```ts
 * setupSuite(() => { sharedState = init(); }); // Runs FIRST
 * setup(() => { use(sharedState); }); // OK: sharedState is initialized
 * ```
 *
 * ❌ **WRONG:** Expensive initialization in beforeEach()
 * ```ts
 * beforeEach(() => { expensiveInit(); }); // Runs THOUSANDS of times!
 * ```
 *
 * ✅ **CORRECT:** Use setup() or beforeAll()
 * ```ts
 * setup(() => { expensiveInit(); }); // Runs ONCE before benchmark
 * ```
 */

/**
 * Validates a timeout value for Jest hooks.
 *
 * @param timeout - The timeout value to validate
 * @param hookName - The name of the hook (for error messages)
 * @throws {Error} If timeout is not a positive number
 */
function validateTimeout(timeout: number | undefined, hookName: string): void {
  if (timeout !== undefined) {
    if (typeof timeout !== 'number') {
      throw new Error(
        `${hookName} timeout must be a number, got: ${typeof timeout}`,
      );
    }
    if (timeout < 0) {
      throw new Error(
        `${hookName} timeout must be a positive number, got: ${timeout}`,
      );
    }
    if (!Number.isFinite(timeout)) {
      throw new Error(
        `${hookName} timeout must be a finite number, got: ${timeout}`,
      );
    }
  }
}

/**
 * Registers a hook that runs once before all iterations of benchmarks in the current describe block.
 *
 * ⚠️ **TINYBENCH BEHAVIOR - EXECUTION ORDER WARNING:** Tinybench executes this AFTER setup() hooks!
 * This is Tinybench's design, not a choice of this wrapper library.
 * See the "Hook Execution Order" section at the top of this file for details.
 *
 * This corresponds to tinybench's FnOptions.beforeAll - a function that runs once before all
 * benchmark iterations.
 *
 * **Execution Order:**
 * 1. setupSuite() - runs first
 * 2. setup() - runs before this hook ⚠️
 * 3. **beforeAll() - YOU ARE HERE**
 * 4. WARMUP PHASE (if enabled):
 *    - beforeEach() → benchmark → afterEach()
 * 5. MEASUREMENT PHASE:
 *    - beforeEach() → benchmark → afterEach()
 * 6. afterAll() - after all iterations
 * 7. teardown() - cleanup
 * 8. teardownSuite() - runs last
 *
 * **State Availability:** Can safely access state initialized in setupSuite() and setup()
 *
 * @param fn - The function to run before all benchmark iterations
 *
 * @throws {Error} If called outside a describe() block
 * @throws {Error} If called inside an it() callback
 *
 * @example
 * ```ts
 * describe('My Suite', () => {
 *   let expensiveData;
 *
 *   beforeAll(() => {
 *     // ✅ SAFE: Can access state from setupSuite() and setup()
 *     expensiveData = loadExpensiveData();
 *   });
 *
 *   it('should process data', () => {
 *     processData(expensiveData);
 *   });
 * });
 * ```
 */
export function beforeAll(fn: () => void | Promise<void>): void {
  const currentBlock = getCurrentDescribeBlock();
  if (!currentBlock) {
    throw new Error('beforeAll() must be called inside a describe() block');
  }
  if (getInsideItCallback()) {
    throw new Error('beforeAll() cannot be called inside an it() callback');
  }
  currentBlock.beforeAllHooks.push(fn);
}

/**
 * Registers a hook that runs once after all iterations of benchmarks in the current describe block.
 *
 * This corresponds to tinybench's FnOptions.afterAll - a function that runs once after all
 * benchmark iterations complete.
 *
 * @param fn - The function to run after all benchmark iterations
 *
 * @throws {Error} If called outside a describe() block
 * @throws {Error} If called inside an it() callback
 *
 * @example
 * ```ts
 * describe('My Suite', () => {
 *   afterAll(() => {
 *     cleanupResources();
 *   });
 *
 *   it('should use resources', () => {
 *     useResources();
 *   });
 * });
 * ```
 */
export function afterAll(fn: () => void | Promise<void>): void {
  const currentBlock = getCurrentDescribeBlock();
  if (!currentBlock) {
    throw new Error('afterAll() must be called inside a describe() block');
  }
  if (getInsideItCallback()) {
    throw new Error('afterAll() cannot be called inside an it() callback');
  }
  currentBlock.afterAllHooks.push(fn);
}

/**
 * Registers a hook that runs before each benchmark iteration in the current describe block.
 *
 * ⚠️ **PERFORMANCE WARNING:** This hook runs THOUSANDS of times (once per iteration)!
 * ⚠️ **WARMUP WARNING:** This runs during WARMUP iterations too (not just measured iterations)!
 * Avoid expensive operations here - use setup() or beforeAll() instead.
 * See the "Hook Execution Order" section at the top of this file for details.
 *
 * This corresponds to tinybench's FnOptions.beforeEach - a function that runs before each
 * iteration of the benchmark (both warmup and measured iterations).
 *
 * **Execution Order:**
 * 1. setupSuite() - runs first
 * 2. setup() - per benchmark
 * 3. beforeAll() - per benchmark
 * 4. WARMUP PHASE (if enabled):
 *    - **beforeEach() - YOU ARE HERE** ⚠️ Runs during warmup!
 *    - benchmark function
 *    - afterEach()
 * 5. MEASUREMENT PHASE:
 *    - **beforeEach() - YOU ARE HERE** ⚠️ Runs THOUSANDS of times!
 *    - benchmark function
 *    - afterEach()
 * 6. afterAll() - per benchmark
 * 7. teardown() - per benchmark
 * 8. teardownSuite() - runs last
 *
 * **State Availability:** Can access state from setupSuite(), setup(), and beforeAll()
 *
 * **Common Use Case:** Reset mutable state between iterations (NOT expensive initialization!)
 *
 * @param fn - The function to run before each iteration
 *
 * @throws {Error} If called outside a describe() block
 * @throws {Error} If called inside an it() callback
 *
 * @example
 * ✅ **CORRECT:** Light-weight per-iteration setup
 * ```ts
 * describe('My Suite', () => {
 *   let counter;
 *
 *   beforeAll(() => {
 *     // ✅ Expensive setup happens ONCE
 *     initializeExpensiveResource();
 *   });
 *
 *   beforeEach(() => {
 *     // ✅ Light-weight reset happens per iteration
 *     counter = 0;
 *   });
 *
 *   it('should process data', () => {
 *     counter++;
 *     processData();
 *   });
 * });
 * ```
 *
 * @example
 * ❌ **WRONG:** Expensive operations in beforeEach
 * ```ts
 * beforeEach(() => {
 *   // ❌ BAD: This runs THOUSANDS of times!
 *   expensiveResource = initializeExpensiveResource();
 * });
 * ```
 *
 * ✅ **CORRECT:** Move expensive operations to setup() or beforeAll()
 * ```ts
 * setup(() => {
 *   // ✅ GOOD: This runs ONCE per benchmark
 *   expensiveResource = initializeExpensiveResource();
 * });
 * ```
 */
export function beforeEach(fn: () => void | Promise<void>): void {
  const currentBlock = getCurrentDescribeBlock();
  if (!currentBlock) {
    throw new Error('beforeEach() must be called inside a describe() block');
  }
  if (getInsideItCallback()) {
    throw new Error('beforeEach() cannot be called inside an it() callback');
  }
  currentBlock.beforeEachHooks.push(fn);
}

/**
 * Registers a hook that runs after each benchmark iteration in the current describe block.
 *
 * ⚠️ **PERFORMANCE WARNING:** This hook runs THOUSANDS of times (once per iteration)!
 * ⚠️ **WARMUP WARNING:** This runs during WARMUP iterations too (not just measured iterations)!
 *
 * This corresponds to tinybench's FnOptions.afterEach - a function that runs after each
 * iteration of the benchmark (both warmup and measured iterations).
 *
 * @param fn - The function to run after each iteration
 *
 * @throws {Error} If called outside a describe() block
 * @throws {Error} If called inside an it() callback
 *
 * @example
 * ```ts
 * describe('My Suite', () => {
 *   afterEach(() => {
 *     cleanupIterationData();
 *   });
 *
 *   it('should process data', () => {
 *     processData();
 *   });
 * });
 * ```
 */
export function afterEach(fn: () => void | Promise<void>): void {
  const currentBlock = getCurrentDescribeBlock();
  if (!currentBlock) {
    throw new Error('afterEach() must be called inside a describe() block');
  }
  if (getInsideItCallback()) {
    throw new Error('afterEach() cannot be called inside an it() callback');
  }
  currentBlock.afterEachHooks.push(fn);
}

/**
 * Registers a benchmark-level setup hook that runs once before the benchmark starts.
 *
 * ⚠️ **TINYBENCH BEHAVIOR - COUNTER-INTUITIVE:** Tinybench executes setup() BEFORE beforeAll()!
 * This is Tinybench's design, not a choice of this wrapper library.
 * See the "Hook Execution Order" section at the top of this file for details.
 *
 * This corresponds to tinybench's BenchOptions.setup - a function that runs before the
 * benchmark starts (before warmup). Use this for expensive initialization that other hooks
 * depend on.
 *
 * **Execution Order:**
 * 1. setupSuite() - runs first
 * 2. **setup() - YOU ARE HERE** ⚠️ Runs BEFORE beforeAll AND before warmup!
 * 3. beforeAll() - runs after this hook
 * 4. WARMUP PHASE (if enabled):
 *    - beforeEach() → benchmark → afterEach()
 * 5. MEASUREMENT PHASE:
 *    - beforeEach() → benchmark → afterEach()
 * 6. afterAll() - after all iterations
 * 7. teardown() - cleanup
 * 8. teardownSuite() - runs last
 *
 * **State Availability:** Can safely access state initialized in setupSuite()
 *
 * **Common Use Case:** Initialize expensive resources that beforeAll/beforeEach will use
 *
 * @param fn - The function to run before the benchmark starts
 *
 * @throws {Error} If called outside a describe() block
 * @throws {Error} If called inside an it() callback
 *
 * @example
 * ```ts
 * describe('My Suite', () => {
 *   let expensiveResource;
 *
 *   setup(() => {
 *     // ✅ Runs FIRST (after setupSuite)
 *     expensiveResource = initializeExpensiveResource();
 *   });
 *
 *   beforeAll(() => {
 *     // ✅ SAFE: Can use expensiveResource here since setup runs BEFORE beforeAll
 *     configureResource(expensiveResource);
 *   });
 *
 *   it('should use resource', () => {
 *     useResource(expensiveResource);
 *   });
 * });
 * ```
 *
 * @example
 * ❌ **WRONG:** Don't try to use state from beforeAll in setup
 * ```ts
 * let config;
 * beforeAll(() => { config = loadConfig(); }); // Runs AFTER setup!
 * setup(() => { useConfig(config); }); // ERROR: config is undefined!
 * ```
 */
export function setup(fn: () => void | Promise<void>): void {
  const currentBlock = getCurrentDescribeBlock();
  if (!currentBlock) {
    throw new Error('setup() must be called inside a describe() block');
  }
  if (getInsideItCallback()) {
    throw new Error('setup() cannot be called inside an it() callback');
  }
  currentBlock.setupHooks.push(fn);
}

/**
 * Registers a benchmark-level teardown hook that runs once after the benchmark completes.
 *
 * This corresponds to tinybench's BenchOptions.teardown - a function that runs after the
 * benchmark completes. Use this to clean up resources created in setup().
 *
 * @param fn - The function to run after the benchmark completes
 *
 * @throws {Error} If called outside a describe() block
 * @throws {Error} If called inside an it() callback
 *
 * @example
 * ```ts
 * describe('My Suite', () => {
 *   let tempFile;
 *
 *   setup(() => {
 *     tempFile = createTempFile();
 *   });
 *
 *   teardown(() => {
 *     deleteTempFile(tempFile);
 *   });
 *
 *   it('should use temp file', () => {
 *     writeToFile(tempFile);
 *   });
 * });
 * ```
 */
export function teardown(fn: () => void | Promise<void>): void {
  const currentBlock = getCurrentDescribeBlock();
  if (!currentBlock) {
    throw new Error('teardown() must be called inside a describe() block');
  }
  if (getInsideItCallback()) {
    throw new Error('teardown() cannot be called inside an it() callback');
  }
  currentBlock.teardownHooks.push(fn);
}

/**
 * Registers a suite-level setup hook that runs once before all benchmarks in the describe block.
 *
 * ✅ **RUNS FIRST:** This is the first hook to execute in the entire suite!
 * See the "Hook Execution Order" section at the top of this file for details.
 *
 * This runs before any benchmark tasks are created. Use this for one-time initialization
 * that should be shared across all benchmarks in the suite.
 *
 * **Execution Order:**
 * 1. **setupSuite() - YOU ARE HERE** ✅ Runs FIRST!
 * 2. setup() - per benchmark
 * 3. beforeAll() - per benchmark
 * 4. beforeEach() - per iteration
 * 5. benchmark function - per iteration
 * 6. afterEach() - per iteration
 * 7. afterAll() - per benchmark
 * 8. teardown() - per benchmark
 * 9. teardownSuite() - runs last
 *
 * **State Availability:** State initialized here is available to ALL subsequent hooks
 *
 * **Common Use Case:** Initialize expensive shared resources used across multiple benchmarks
 *
 * @param fn - The function to run before all benchmarks in the suite
 * @param timeout - Optional timeout in milliseconds for the hook (must be positive)
 *
 * @throws {Error} If called outside a describe() block
 * @throws {Error} If called inside an it() callback
 * @throws {Error} If timeout is not a positive number
 *
 * @example
 * ```ts
 * describe('My Suite', () => {
 *   let sharedState;
 *
 *   setupSuite(() => {
 *     // ✅ Runs FIRST - all other hooks can use sharedState
 *     sharedState = initializeSharedState();
 *   });
 *
 *   // With timeout for long-running setup
 *   setupSuite(async () => {
 *     sharedState = await initializeExpensiveResource();
 *   }, 30000); // 30 second timeout
 *
 *   describe('Group 1', () => {
 *     it('should use shared state', () => {
 *       // ✅ SAFE: sharedState initialized in setupSuite
 *       processSharedState(sharedState);
 *     });
 *   });
 *
 *   describe('Group 2', () => {
 *     it('should also use shared state', () => {
 *       // ✅ SAFE: sharedState initialized in setupSuite
 *       processSharedState(sharedState);
 *     });
 *   });
 * });
 * ```
 */
export function setupSuite(
  fn: () => void | Promise<void>,
  timeout?: number,
): void {
  const currentBlock = getCurrentDescribeBlock();
  if (!currentBlock) {
    throw new Error('setupSuite() must be called inside a describe() block');
  }
  if (getInsideItCallback()) {
    throw new Error('setupSuite() cannot be called inside an it() callback');
  }
  validateTimeout(timeout, 'setupSuite');
  currentBlock.setupSuiteHooks.push({ fn, timeout });
}

/**
 * Registers a suite-level teardown hook that runs once after all benchmarks in the describe block.
 *
 * This runs after all benchmark tasks have completed. Use this for cleanup of resources
 * initialized in setupSuite().
 *
 * @param fn - The function to run after all benchmarks in the suite
 * @param timeout - Optional timeout in milliseconds for the hook (must be positive)
 *
 * @throws {Error} If called outside a describe() block
 * @throws {Error} If called inside an it() callback
 * @throws {Error} If timeout is not a positive number
 *
 * @example
 * ```ts
 * describe('My Suite', () => {
 *   let sharedState;
 *
 *   setupSuite(() => {
 *     sharedState = initializeSharedState();
 *   });
 *
 *   teardownSuite(() => {
 *     cleanupSharedState(sharedState);
 *   });
 *
 *   // With timeout for long-running cleanup
 *   teardownSuite(async () => {
 *     await cleanupExpensiveResource(sharedState);
 *   }, 15000); // 15 second timeout
 *
 *   it('should use shared state', () => {
 *     processSharedState(sharedState);
 *   });
 * });
 * ```
 */
export function teardownSuite(
  fn: () => void | Promise<void>,
  timeout?: number,
): void {
  const currentBlock = getCurrentDescribeBlock();
  if (!currentBlock) {
    throw new Error('teardownSuite() must be called inside a describe() block');
  }
  if (getInsideItCallback()) {
    throw new Error('teardownSuite() cannot be called inside an it() callback');
  }
  validateTimeout(timeout, 'teardownSuite');
  currentBlock.teardownSuiteHooks.push({ fn, timeout });
}

/**
 * Options for the it() function, extending tinybench's BenchOptions
 * with test runner timeout control.
 */
interface ItOptions extends Omit<BenchOptions, 'name'> {
  /**
   * Optional timeout in milliseconds for the test runner (Jest/Vitest).
   * This controls how long the test runner waits before marking the test as failed.
   *
   * Note: This is different from tinybench's `time` option:
   * - `time`: Controls how long tinybench runs the benchmark
   * - `itTimeout`: Controls the maximum time before the test runner fails
   *
   * Must be a positive, finite number.
   */
  itTimeout?: number;

  /**
   * Optional flag to suppress performance warnings for this benchmark.
   * When true, warnings about slow beforeEach/afterEach hooks will not be displayed.
   *
   * Defaults to false (warnings enabled).
   * If not specified, inherits from the parent describe block's quiet setting.
   */
  quiet?: boolean;
}

/**
 * Defines a benchmark task within a describe block.
 *
 * Each `it()` call creates a benchmark task that will be measured. The function provided
 * will be executed thousands of times to measure its performance.
 *
 * @param name - The name of the benchmark task
 * @param fn - The function to benchmark (will be executed many times)
 * @param options - Optional benchmark options (iterations, warmup, itTimeout, quiet, etc.)
 *
 * @throws {Error} If called outside a describe() block
 * @throws {Error} If called inside an it() callback
 * @throws {Error} If itTimeout is not a positive number
 *
 * @example
 * ```ts
 * describe('My Suite', () => {
 *   it('should do work', () => {
 *     doWork();
 *   });
 *
 *   it('should do more work with options', () => {
 *     doMoreWork();
 *   }, { iterations: 100, warmup: true });
 *
 *   // With custom timeout for long-running benchmarks
 *   it('expensive benchmark', () => {
 *     expensiveWork();
 *   }, {
 *     time: 10000,      // Run benchmark for 10 seconds
 *     iterations: 1000, // Run 1000 iterations
 *     itTimeout: 60000  // Allow 60 seconds before test fails
 *   });
 *
 *   // Suppress performance warnings for a specific benchmark
 *   it('benchmark with intentionally slow beforeEach', () => {
 *     doWork();
 *   }, {
 *     quiet: true  // No warnings about slow hooks
 *   });
 * });
 * ```
 */
export function it(name: string, fn: Fn, options?: ItOptions): void {
  const currentBlock = getCurrentDescribeBlock();
  if (!currentBlock) {
    throw new Error('it() must be called inside a describe() block');
  }
  if (getInsideItCallback()) {
    throw new Error('it() cannot be called inside an it() callback');
  }

  // Extract and validate itTimeout and quiet options
  const { itTimeout, quiet, ...benchOptionsWithoutTimeout } = options || {};
  validateTimeout(itTimeout, 'it');

  // Determine quiet flag: explicit option > parent describe quiet > default (false)
  const effectiveQuiet = quiet ?? currentBlock.quiet ?? false;

  // Collect hooks from current block and all ancestors
  const beforeAllHooks: Array<() => void | Promise<void>> = [];
  const afterAllHooks: Array<() => void | Promise<void>> = [];
  const beforeEachHooks: Array<() => void | Promise<void>> = [];
  const afterEachHooks: Array<() => void | Promise<void>> = [];
  const setupHooks: Array<() => void | Promise<void>> = [];
  const teardownHooks: Array<() => void | Promise<void>> = [];

  let block: DescribeBlock | undefined = currentBlock;
  const blocks: DescribeBlock[] = [];

  // Collect all blocks from current to root
  while (block) {
    blocks.unshift(block);
    block = block.parent;
  }

  // Collect hooks in order from root to current
  for (const b of blocks) {
    beforeAllHooks.push(...b.beforeAllHooks);
    afterAllHooks.push(...b.afterAllHooks);
    beforeEachHooks.push(...b.beforeEachHooks);
    afterEachHooks.push(...b.afterEachHooks);
    setupHooks.push(...b.setupHooks);
    teardownHooks.push(...b.teardownHooks);
  }

  const fnOptions: FnOptions = {};

  if (beforeAllHooks.length > 0) {
    fnOptions.beforeAll = async () => {
      for (const hook of beforeAllHooks) {
        await hook();
      }
    };
  }

  if (afterAllHooks.length > 0) {
    fnOptions.afterAll = async () => {
      for (const hook of afterAllHooks) {
        await hook();
      }
    };
  }

  if (beforeEachHooks.length > 0) {
    fnOptions.beforeEach = async () => {
      // ⚠️ WARNING: This runs THOUSANDS of times per benchmark (warmup + measured iterations)!
      // Slow operations here will severely impact benchmark accuracy.

      // Only measure performance if warnings are enabled (not quiet)
      const startTime = effectiveQuiet ? 0 : performance.now();

      for (const hook of beforeEachHooks) {
        await hook();
      }

      // Warn if beforeEach takes too long (indicates expensive operations)
      // Only measure and warn if quiet flag is not set
      if (!effectiveQuiet) {
        const duration = performance.now() - startTime;
        if (duration > 10) {
          // More than 10ms is suspiciously slow for per-iteration setup
          console.warn(
            `⚠️ Performance Warning: beforeEach hook took ${duration.toFixed(2)}ms. ` +
              `This runs THOUSANDS of times (including warmup iterations) and may impact benchmark accuracy. ` +
              `Consider moving expensive operations to setup() or beforeAll().`,
          );
        }
      }
    };
  }

  if (afterEachHooks.length > 0) {
    fnOptions.afterEach = async () => {
      for (const hook of afterEachHooks) {
        await hook();
      }
    };
  }

  // Add setup/teardown as bench options if present
  let benchOptions = benchOptionsWithoutTimeout;
  if (setupHooks.length > 0 || teardownHooks.length > 0) {
    benchOptions = { ...benchOptionsWithoutTimeout };
    if (setupHooks.length > 0) {
      benchOptions.setup = async () => {
        // ⚠️ TINYBENCH EXECUTION ORDER: Tinybench calls setup() BEFORE beforeAll()
        // This is counter-intuitive but is how Tinybench works internally!
        // We cannot change this order - it's defined by Tinybench's implementation.
        // State initialized here IS available in beforeAll/beforeEach.
        for (const hook of setupHooks) {
          await hook();
        }
      };
    }
    if (teardownHooks.length > 0) {
      benchOptions.teardown = async () => {
        // Runs AFTER afterAll() to clean up resources from setup()
        for (const hook of teardownHooks) {
          await hook();
        }
      };
    }
  }

  /**
   * CRITICAL FIX: Wrap the benchmark function to track execution context
   *
   * This wrapper sets the `insideItCallback` flag to true when the benchmark
   * function executes, preventing hooks (beforeAll, afterAll, etc.) from being
   * called inside the benchmark. Without this wrapper, the validation in hook
   * functions would never trigger because the flag would never be set to true.
   *
   * This prevents users from accidentally calling hooks inside it() callbacks,
   * which would cause those hooks to execute during every benchmark iteration
   * instead of once per benchmark, producing incorrect benchmark results.
   *
   * The wrapper handles both synchronous and asynchronous benchmark functions:
   * - For sync functions: Sets flag → executes → resets flag → returns result
   * - For async functions: Sets flag → executes → returns Promise with finally() to reset flag
   * - For errors: Always resets flag before re-throwing to prevent flag leakage
   */
  const wrappedFn: Fn = () => {
    setInsideItCallback(true);
    try {
      const result = fn();
      // If it's a promise, chain the cleanup
      if (
        result &&
        typeof result === 'object' &&
        typeof (result as any).then === 'function'
      ) {
        return (result as Promise<any>).finally(() => {
          setInsideItCallback(false);
        });
      }
      // Otherwise, clean up immediately
      setInsideItCallback(false);
      return result;
    } catch (error) {
      setInsideItCallback(false);
      throw error;
    }
  };

  currentBlock.benchmarks.push({
    name,
    fn: wrappedFn,
    fnOptions,
    benchOptions,
    itTimeout,
    quiet: effectiveQuiet,
  });
}

/**
 * Options for the describe() function.
 */
interface DescribeOptions {
  /**
   * Optional flag to suppress performance warnings for all benchmarks in this suite.
   * When true, warnings about slow beforeEach/afterEach hooks will not be displayed
   * for any benchmarks in this describe block (unless overridden per-benchmark).
   *
   * Defaults to false (warnings enabled).
   * Child describe blocks inherit this setting from their parent.
   */
  quiet?: boolean;
}

/**
 * Defines a benchmark suite or group of benchmarks.
 *
 * `describe()` blocks can be nested to create hierarchical organization. Each inner describe
 * creates its own Bench instance with hooks and options inherited from parent describes.
 *
 * Variables declared in a describe block's scope are shared across all benchmarks and nested
 * describes within that block, providing a clean alternative to module-level variables.
 *
 * @param name - The name of the benchmark suite
 * @param callback - The function that registers benchmarks and nested describes
 * @param options - Optional configuration for the describe block
 *
 * @example
 * ```ts
 * describe('Path Resolution', () => {
 *   let sharedState;
 *
 *   setupSuite(() => {
 *     sharedState = initialize();
 *   });
 *
 *   describe('buildFileNames', () => {
 *     it('should build file names correctly', () => {
 *       buildFileNames(['index', 'main'], sharedState);
 *     });
 *   });
 *
 *   describe('buildPatterns', () => {
 *     let patterns;
 *
 *     beforeAll(() => {
 *       patterns = ['*.ts', '*.js'];
 *     });
 *
 *     it('should build patterns correctly', () => {
 *       buildPatterns(patterns, sharedState);
 *     });
 *   });
 * });
 * ```
 *
 * @example
 * Suppress performance warnings for a suite:
 * ```ts
 * describe('Performance Tests', () => {
 *   // Warnings suppressed for all benchmarks in this suite
 *   it('benchmark with expected slow beforeEach', () => {
 *     doWork();
 *   });
 * }, { quiet: true });
 * ```
 */
export function describe(
  name: string,
  callback: () => void,
  options?: DescribeOptions,
): void {
  const currentBlock = getCurrentDescribeBlock();
  // Determine quiet flag: explicit option > parent quiet > default (false)
  const effectiveQuiet = options?.quiet ?? currentBlock?.quiet ?? false;

  const block: DescribeBlock = {
    name,
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
    parent: currentBlock,
    quiet: effectiveQuiet,
  };

  if (currentBlock) {
    currentBlock.children.push(block);
  } else {
    // This is the root describe block
    setRootDescribeBlock(block);
  }

  const previousBlock = currentBlock;
  setCurrentDescribeBlock(block);

  // Execute the callback to register benchmarks and nested describes
  callback();

  setCurrentDescribeBlock(previousBlock);

  // If this was the root describe, run the benchmarks
  if (!getCurrentDescribeBlock() && getRootDescribeBlock() === block) {
    runDescribeBlock(block);
    setRootDescribeBlock(undefined);
  }
}

/**
 * Runs a describe block as a Jest describe with its benchmarks and nested describes
 */
function runDescribeBlock(block: DescribeBlock): void {
  getJestDescribe()(block.name, () => {
    let summaryLines: string[];
    let bench: Bench;
    let taskResults: Map<string, Task>;

    /**
     * HOOK EXECUTION ORDER (DEFINED BY TINYBENCH):
     *
     * The order in steps 2.a-2.f is determined by Tinybench's implementation,
     * not by this wrapper. We simply register hooks according to Tinybench's API.
     *
     * 1. setupSuite() - registered as Jest beforeAll (runs FIRST)
     * 2. Benchmark execution - registered as Jest beforeAll (runs SECOND)
     *    - For each benchmark (Tinybench controls this order):
     *      a. setup() - BenchOptions.setup (⚠️ Tinybench runs this BEFORE beforeAll!)
     *      b. beforeAll() - FnOptions.beforeAll
     *      c. WARMUP PHASE (if warmup enabled):
     *         - beforeEach() → benchmark function → afterEach()
     *         - Repeated for warmup iterations (typically 5)
     *         - ⚠️ beforeEach/afterEach run during warmup!
     *      d. MEASUREMENT PHASE:
     *         - beforeEach() → benchmark function → afterEach()
     *         - Repeated for measured iterations (hundreds/thousands)
     *      e. afterAll() - FnOptions.afterAll
     *      f. teardown() - BenchOptions.teardown
     * 3. teardownSuite() - registered as Jest afterAll (runs LAST)
     */

    // STEP 1: Run setupSuite hooks (registered FIRST)
    for (const hook of block.setupSuiteHooks) {
      const timeout = hook.timeout;
      if (timeout !== undefined) {
        validateTimeout(timeout, 'setupSuite');
        getJestBeforeAll()(hook.fn, timeout);
      } else {
        getJestBeforeAll()(hook.fn);
      }
    }

    // STEP 2: Run all benchmarks (registered AFTER setupSuite hooks)
    getJestBeforeAll()(async () => {
      summaryLines = [];

      // Create ONE Bench instance for all benchmarks in this describe block
      if (block.benchmarks.length > 0) {
        const benchOptions: BenchOptions = {
          name: block.name,
          // Use the common benchOptions if they exist on the first benchmark
          // (in practice, per-benchmark options will be merged into each task)
          ...block.benchmarks[0].benchOptions,
        };

        bench = new Bench(benchOptions);

        // Add ALL benchmarks as tasks to the same Bench instance
        for (const benchmark of block.benchmarks) {
          // Merge fnOptions and benchmark-specific benchOptions for each task
          bench.add(benchmark.name, benchmark.fn, {
            ...benchmark.fnOptions,
            ...benchmark.benchOptions,
          });
        }

        // Run the Bench ONCE with all tasks
        const tasks = await bench.run();
        taskResults = new Map(tasks.map((task) => [task.name, task]));
      }
    });

    // STEP 3: Run teardownSuite hooks (registered AFTER benchmark hook)
    for (const hook of block.teardownSuiteHooks) {
      const timeout = hook.timeout;
      if (timeout !== undefined) {
        validateTimeout(timeout, 'teardownSuite');
        getJestAfterAll()(hook.fn, timeout);
      } else {
        getJestAfterAll()(hook.fn);
      }
    }

    // STEP 4: Print summary and cleanup (registered LAST)
    getJestAfterAll()(() => {
      if (summaryLines.length > 0) {
        console.log(summaryLines.join('\n'));
      }

      // Cleanup: remove all tasks from the Bench instance
      if (bench) {
        for (const benchmark of block.benchmarks) {
          bench.remove(benchmark.name);
        }
      }
    });

    // Each benchmark gets its own Jest it() that reports pre-computed results
    for (const benchmark of block.benchmarks) {
      const testFn = () => {
        const task = taskResults.get(benchmark.name);

        if (!task) {
          throw new Error(
            `[${block.name}] ${benchmark.name} task not found in results`,
          );
        }

        const taskResult = task.result;

        if (!taskResult) {
          throw new Error(
            `[${block.name}] ${benchmark.name} did not produce a result`,
          );
        }

        if (taskResult.error) {
          const error = new Error(
            `[${block.name}] ${benchmark.name} failed: ${taskResult.error.message}`,
          );
          (error as any).cause = taskResult.error;
          throw error;
        }

        summaryLines.push(
          formatBenchmarkResult(
            `[${block.name}] ${benchmark.name}`,
            taskResult.throughput.mean,
            taskResult.latency.rme,
            taskResult.latency.samples.length,
          ),
        );
      };

      // Still supports per-benchmark itTimeout for test runner
      const itTimeout = benchmark.itTimeout;
      if (itTimeout !== undefined) {
        validateTimeout(itTimeout, 'it');
        getJestIt()(benchmark.name, testFn, itTimeout);
      } else {
        getJestIt()(benchmark.name, testFn);
      }
    }

    // Recursively run nested describe blocks
    // Recursion depth matches describe block nesting, which is typically 2-4 levels
    // in practice, well within stack limits. Keeping recursive for code clarity.
    for (const child of block.children) {
      runDescribeBlock(child);
    }
  });
}

/**
 * Formats benchmark results in jest-bench format for compatibility with
 * benchmark-action/github-action-benchmark.
 *
 * Output format: "name  ops/sec  time ± percent %  (runs runs sampled)"
 * Example: "Cache hit  623 ops/sec   1.60 ms ±  0.42 %  (90 runs sampled)"
 */
export function formatBenchmarkResult(
  name: string,
  opsPerSec: number,
  rme: number,
  samples: number,
): string {
  // Format ops/sec with commas for thousands and up to 2 decimal places for less than 100 ops/sec
  const formattedOpsPerSec = opsPerSec.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: opsPerSec < 100 ? 2 : 0,
  });
  // Format percentage with 2 decimal places
  const formattedRme = rme.toFixed(2);

  const formattedRunsSampled = `${samples} run${samples === 1 ? '' : 's'} sampled`;

  // Example:
  // RegExp.test x 1,234,567 ops/sec ±1.23% (89 runs sampled)
  return `${name} x ${formattedOpsPerSec} ops/sec ±${formattedRme}% (${formattedRunsSampled})`;
}
