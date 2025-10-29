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
 * Detects if running in a CI environment.
 * Checks for common CI environment variables.
 */
function isCI(): boolean {
  return Boolean(
    process.env['CI'] || // Generic CI indicator
      process.env['CONTINUOUS_INTEGRATION'] || // Alternative CI indicator
      process.env['GITHUB_ACTIONS'] || // GitHub Actions
      process.env['GITLAB_CI'] || // GitLab CI
      process.env['CIRCLECI'] || // CircleCI
      process.env['TRAVIS'] || // Travis CI
      process.env['JENKINS_HOME'] || // Jenkins
      process.env['BUILDKITE'] || // Buildkite
      process.env['TF_BUILD'], // Azure Pipelines
  );
}

/**
 * Gets the default performance warning threshold based on environment.
 * Returns 50ms in CI environments (where performance may be more variable),
 * and 10ms in local development environments.
 */
function getDefaultPerformanceThreshold(): number {
  return isCI() ? 50 : 10;
}

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
 * 1. **beforeAll()** - Runs ONCE before any benchmarks in the suite (suite-level)
 *    - Registered as Jest beforeAll (first)
 *    - Use for shared state initialization across all benchmarks
 *    - Available in: all subsequent hooks/benchmarks
 *    - **Lifecycle:** Once per describe block
 *    - **Context:** Jest context (no Task or mode parameters)
 *
 * 2. **Benchmark Execution** (all benchmarks run in a single Jest beforeAll)
 *    For EACH benchmark in the suite:
 *
 *    a. **beforeCycle()** - Runs per benchmark cycle (before warmup, before run)
 *       - Maps to Tinybench's `BenchOptions.setup`
 *       - ⚠️ RUNS BEFORE beforeAllIterations() - this is counter-intuitive!
 *       - Use for expensive initialization that beforeAllIterations/beforeEachIteration need
 *       - **Lifecycle:** 1-2 times per benchmark (warmup cycle if enabled + run cycle)
 *       - **Context:** Tinybench context (receives Task and mode parameters)
 *
 *    b. **beforeAllIterations()** - Runs per cycle before iterations begin
 *       - Maps to Tinybench's `FnOptions.beforeAll`
 *       - Use for per-cycle initialization
 *       - Can access state from beforeAll() (suite) and beforeCycle()
 *       - **Lifecycle:** 1-2 times per benchmark (once per cycle: warmup if enabled, run)
 *       - **Context:** Tinybench context (receives Task and mode parameters)
 *
 *    c. **WARMUP PHASE** (if warmup is enabled, mode = 'warmup')
 *       - beforeEachIteration() → benchmark function → afterEachIteration()
 *       - Repeated for warmup iterations (typically ~16)
 *       - Results are NOT measured/recorded
 *       - ⚠️ beforeEachIteration/afterEachIteration run during warmup too!
 *       - **Lifecycle:** ~16 times per benchmark (warmup only)
 *       - **Context:** Tinybench context (receives Task and mode='warmup')
 *
 *    d. **MEASUREMENT PHASE** (mode = 'run')
 *       - beforeEachIteration() → benchmark function → afterEachIteration()
 *       - Repeated for measured iterations (typically ~1000)
 *       - Results ARE measured and recorded
 *       - **Lifecycle:** ~1000 times per benchmark (measurement only)
 *       - **Context:** Tinybench context (receives Task and mode='run')
 *
 *    e. **afterAllIterations()** - Runs per cycle after iterations complete
 *       - Maps to Tinybench's `FnOptions.afterAll`
 *       - Use for per-cycle cleanup
 *       - **Lifecycle:** 1-2 times per benchmark (once per cycle: warmup if enabled, run)
 *       - **Context:** Tinybench context (receives Task and mode parameters)
 *
 *    f. **afterCycle()** - Runs per benchmark cycle after all iterations
 *       - Maps to Tinybench's `BenchOptions.teardown`
 *       - Use to clean up resources from beforeCycle()
 *       - **Lifecycle:** 1-2 times per benchmark (warmup cycle if enabled + run cycle)
 *       - **Context:** Tinybench context (receives Task and mode parameters)
 *
 * 3. **afterAll()** - Runs ONCE after all benchmarks complete (suite-level)
 *    - Registered as Jest afterAll (last)
 *    - Use to clean up resources from beforeAll() (suite)
 *    - **Lifecycle:** Once per describe block
 *    - **Context:** Jest context (no Task or mode parameters)
 *
 * ### Visual Execution Flow
 *
 * Here's what actually happens when you run a benchmark suite with 2 benchmarks:
 *
 * ```
 * describe('Suite', () => { ... })
 * │
 * ├─ beforeAll()                          ← Runs ONCE (suite-level, Jest context)
 * │
 * ├─ Benchmark 1: it('first', ...)
 * │  │
 * │  ├─ WARMUP CYCLE (mode='warmup')      ← Cycle 1 of 2
 * │  │  ├─ beforeCycle()                  ← Once per cycle
 * │  │  ├─ beforeAllIterations()          ← Once per cycle
 * │  │  ├─ iterations (~16×)              ← Many times
 * │  │  │  ├─ beforeEachIteration()      ← Per iteration
 * │  │  │  ├─ [benchmark function]       ← Per iteration
 * │  │  │  └─ afterEachIteration()       ← Per iteration
 * │  │  ├─ afterAllIterations()           ← Once per cycle
 * │  │  └─ afterCycle()                   ← Once per cycle
 * │  │
 * │  └─ RUN CYCLE (mode='run')            ← Cycle 2 of 2
 * │     ├─ beforeCycle()                  ← Once per cycle
 * │     ├─ beforeAllIterations()          ← Once per cycle
 * │     ├─ iterations (~1000×)            ← Many times (measured)
 * │     │  ├─ beforeEachIteration()      ← Per iteration
 * │     │  ├─ [benchmark function]       ← Per iteration (measured)
 * │     │  └─ afterEachIteration()       ← Per iteration
 * │     ├─ afterAllIterations()           ← Once per cycle
 * │     └─ afterCycle()                   ← Once per cycle
 * │
 * ├─ Benchmark 2: it('second', ...)      ← Same structure as Benchmark 1
 * │  └─ ... (warmup cycle + run cycle)
 * │
 * └─ afterAll()                           ← Runs ONCE (suite-level, Jest context)
 * ```
 *
 * **Key Observations:**
 * - `beforeAll`/`afterAll` run ONCE for the entire suite
 * - Each benchmark runs TWO cycles: warmup + run
 * - `beforeCycle`/`afterCycle` run TWICE per benchmark (once per cycle)
 * - `beforeAllIterations`/`afterAllIterations` run TWICE per benchmark (once per cycle)
 * - `beforeEachIteration`/`afterEachIteration` run THOUSANDS of times (~1016 per benchmark)
 * - The benchmark function itself runs ~1016 times, but only ~1000 are measured
 *
 * ### Common Pitfalls
 *
 * ❌ **WRONG:** Initializing shared state in beforeAllIterations() that beforeCycle() needs
 * ```ts
 * beforeAllIterations(() => { sharedState = init(); }); // Runs AFTER beforeCycle!
 * beforeCycle(() => { use(sharedState); }); // ERROR: sharedState not initialized yet!
 * ```
 *
 * ✅ **CORRECT:** Initialize in beforeAll() (suite) or beforeCycle()
 * ```ts
 * beforeAll(() => { sharedState = init(); }); // Runs FIRST
 * beforeCycle(() => { use(sharedState); }); // OK: sharedState is initialized
 * ```
 *
 * ❌ **WRONG:** Expensive initialization in beforeEachIteration()
 * ```ts
 * beforeEachIteration(() => { expensiveInit(); }); // Runs THOUSANDS of times!
 * ```
 *
 * ✅ **CORRECT:** Use beforeCycle() or beforeAllIterations()
 * ```ts
 * beforeCycle(() => { expensiveInit(); }); // Runs TWICE per benchmark (per cycle)
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
 * Registers a hook that runs once before all iterations of a benchmark in the current describe block.
 *
 * **Lifecycle:** Executes once per benchmark cycle (warmup cycle and run cycle), before iterations begin
 * **Frequency:** Runs **1-2 times per benchmark** (once before warmup iterations if enabled, once before run iterations)
 * **Context:** Tinybench cycle context with Task instance and mode parameter
 *
 * ⚠️ **TINYBENCH BEHAVIOR - EXECUTION ORDER WARNING:** Tinybench executes this AFTER setupTask() hooks!
 * This is Tinybench's design, not a choice of this wrapper library.
 * See the "Hook Execution Order" section at the top of this file for details.
 *
 * This corresponds to tinybench's FnOptions.beforeAll - a function that runs once before all
 * benchmark iterations in a cycle.
 *
 * **Execution Order:**
 * 1. beforeAll() - suite-level (runs first)
 * 2. beforeCycle() - runs before this hook ⚠️
 * 3. **beforeAllIterations() - YOU ARE HERE**
 * 4. WARMUP PHASE (if enabled):
 *    - beforeEachIteration() → benchmark → afterEachIteration()
 * 5. MEASUREMENT PHASE:
 *    - beforeEachIteration() → benchmark → afterEachIteration()
 * 6. afterAllIterations() - after all iterations in cycle
 * 7. afterCycle() - cleanup
 * 8. afterAll() - suite-level (runs last)
 *
 * **State Availability:** Can safely access state initialized in beforeAll() (suite) and beforeCycle()
 *
 * @param fn - Callback receiving Task instance and mode ('warmup' or 'run'). Parameters are optional for backward compatibility.
 * @param timeout - Optional timeout in milliseconds
 *
 * @throws {Error} If called outside a describe() block
 * @throws {Error} If called inside an it() callback
 *
 * @example
 * ```ts
 * describe('My Suite', () => {
 *   let expensiveData;
 *
 *   beforeAllIterations((task, mode) => {
 *     // ✅ SAFE: Can access state from beforeAll() (suite) and beforeCycle()
 *     expensiveData = loadExpensiveData();
 *     console.log(`Starting ${mode} phase for ${task.name}`);
 *   });
 *
 *   it('should process data', () => {
 *     processData(expensiveData);
 *   });
 * });
 * ```
 */
export function beforeAllIterations(
  fn: (task?: Task, mode?: 'run' | 'warmup') => void | Promise<void>,
  timeout?: number,
): void {
  const currentBlock = getCurrentDescribeBlock();
  if (!currentBlock) {
    throw new Error(
      'beforeAllIterations() must be called inside a describe() block',
    );
  }
  if (getInsideItCallback()) {
    throw new Error(
      'beforeAllIterations() cannot be called inside an it() callback',
    );
  }
  validateTimeout(timeout, 'beforeAllIterations');
  currentBlock.beforeAllHooks.push(fn);
}

/**
 * Registers a hook that runs once after all iterations of a benchmark in the current describe block.
 *
 * **Lifecycle:** Executes once per benchmark cycle (warmup cycle and run cycle), after all iterations complete
 * **Frequency:** Runs **1-2 times per benchmark** (once after warmup iterations if enabled, once after run iterations)
 * **Context:** Tinybench cycle context with Task instance and mode parameter
 *
 * This corresponds to tinybench's FnOptions.afterAll - a function that runs once after all
 * benchmark iterations in a cycle complete.
 *
 * @param fn - Callback receiving Task instance and mode ('warmup' or 'run'). Parameters are optional for backward compatibility.
 * @param timeout - Optional timeout in milliseconds
 *
 * @throws {Error} If called outside a describe() block
 * @throws {Error} If called inside an it() callback
 *
 * @example
 * ```ts
 * describe('My Suite', () => {
 *   afterAllIterations((task, mode) => {
 *     cleanupResources();
 *     console.log(`Completed ${mode} phase for ${task.name}`);
 *   });
 *
 *   it('should use resources', () => {
 *     useResources();
 *   });
 * });
 * ```
 */
export function afterAllIterations(
  fn: (task?: Task, mode?: 'run' | 'warmup') => void | Promise<void>,
  timeout?: number,
): void {
  const currentBlock = getCurrentDescribeBlock();
  if (!currentBlock) {
    throw new Error(
      'afterAllIterations() must be called inside a describe() block',
    );
  }
  if (getInsideItCallback()) {
    throw new Error(
      'afterAllIterations() cannot be called inside an it() callback',
    );
  }
  validateTimeout(timeout, 'afterAllIterations');
  currentBlock.afterAllHooks.push(fn);
}

/**
 * Registers a hook that runs before each benchmark iteration in the current describe block.
 *
 * **Lifecycle:** Executes before every single iteration of the benchmark function during both warmup and measurement phases
 * **Frequency:** Runs thousands of times per benchmark (~16 warmup + ~1000 measurement iterations = ~1016 times per benchmark)
 * **Context:** Tinybench iteration context with Task instance and mode parameter
 * **⚠️ Performance Warning:** This hook runs very frequently. Keep logic minimal to avoid skewing benchmark results.
 *
 * ⚠️ **WARMUP WARNING:** This runs during WARMUP iterations too (not just measured iterations)!
 * Avoid expensive operations here - use beforeCycle() or beforeAllIterations() instead.
 * See the "Hook Execution Order" section at the top of this file for details.
 *
 * This corresponds to tinybench's FnOptions.beforeEach - a function that runs before each
 * iteration of the benchmark (both warmup and measured iterations).
 *
 * **Execution Order:**
 * 1. beforeAll() - suite-level (runs first)
 * 2. beforeCycle() - per benchmark cycle
 * 3. beforeAllIterations() - per benchmark cycle
 * 4. WARMUP PHASE (if enabled):
 *    - **beforeEachIteration() - YOU ARE HERE** ⚠️ Runs during warmup!
 *    - benchmark function
 *    - afterEachIteration()
 * 5. MEASUREMENT PHASE:
 *    - **beforeEachIteration() - YOU ARE HERE** ⚠️ Runs THOUSANDS of times!
 *    - benchmark function
 *    - afterEachIteration()
 * 6. afterAllIterations() - per benchmark cycle
 * 7. afterCycle() - per benchmark cycle
 * 8. afterAll() - suite-level (runs last)
 *
 * **State Availability:** Can access state from beforeAll(), beforeCycle(), and beforeAllIterations()
 *
 * **Common Use Case:** Reset mutable state between iterations (NOT expensive initialization!)
 *
 * @param fn - Callback receiving Task instance and mode ('warmup' or 'run'). Parameters are optional for backward compatibility.
 * @param timeout - Optional timeout in milliseconds
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
 *   beforeAllIterations(() => {
 *     // ✅ Expensive setup happens ONCE per cycle
 *     initializeExpensiveResource();
 *   });
 *
 *   beforeEachIteration((task, mode) => {
 *     // ✅ Light-weight reset happens per iteration
 *     counter = 0;
 *     if (mode === 'warmup') {
 *       // Optional: Different behavior during warmup
 *     }
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
 * ❌ **WRONG:** Expensive operations in beforeEachIteration
 * ```ts
 * beforeEachIteration(() => {
 *   // ❌ BAD: This runs THOUSANDS of times!
 *   expensiveResource = initializeExpensiveResource();
 * });
 * ```
 *
 * ✅ **CORRECT:** Move expensive operations to beforeCycle() or beforeAllIterations()
 * ```ts
 * beforeCycle(() => {
 *   // ✅ GOOD: This runs 1-2 times per benchmark (once per cycle: warmup if enabled, run)
 *   expensiveResource = initializeExpensiveResource();
 * });
 * ```
 */
export function beforeEachIteration(
  fn: (task?: Task, mode?: 'run' | 'warmup') => void | Promise<void>,
  timeout?: number,
): void {
  const currentBlock = getCurrentDescribeBlock();
  if (!currentBlock) {
    throw new Error(
      'beforeEachIteration() must be called inside a describe() block',
    );
  }
  if (getInsideItCallback()) {
    throw new Error(
      'beforeEachIteration() cannot be called inside an it() callback',
    );
  }
  validateTimeout(timeout, 'beforeEachIteration');
  currentBlock.beforeEachHooks.push(fn);
}

/**
 * Registers a hook that runs after each benchmark iteration in the current describe block.
 *
 * **Lifecycle:** Executes after every single iteration of the benchmark function during both warmup and measurement phases
 * **Frequency:** Runs thousands of times per benchmark (~16 warmup + ~1000 measurement iterations = ~1016 times per benchmark)
 * **Context:** Tinybench iteration context with Task instance and mode parameter
 * **⚠️ Performance Warning:** This hook runs very frequently. Keep logic minimal to avoid skewing benchmark results.
 *
 * ⚠️ **WARMUP WARNING:** This runs during WARMUP iterations too (not just measured iterations)!
 *
 * This corresponds to tinybench's FnOptions.afterEach - a function that runs after each
 * iteration of the benchmark (both warmup and measured iterations).
 *
 * @param fn - Callback receiving Task instance and mode ('warmup' or 'run'). Parameters are optional for backward compatibility.
 * @param timeout - Optional timeout in milliseconds
 *
 * @throws {Error} If called outside a describe() block
 * @throws {Error} If called inside an it() callback
 *
 * @example
 * ```ts
 * describe('My Suite', () => {
 *   afterEachIteration((task, mode) => {
 *     cleanupIterationData();
 *     if (mode === 'warmup') {
 *       // Optional: Different behavior during warmup
 *     }
 *   });
 *
 *   it('should process data', () => {
 *     processData();
 *   });
 * });
 * ```
 */
export function afterEachIteration(
  fn: (task?: Task, mode?: 'run' | 'warmup') => void | Promise<void>,
  timeout?: number,
): void {
  const currentBlock = getCurrentDescribeBlock();
  if (!currentBlock) {
    throw new Error(
      'afterEachIteration() must be called inside a describe() block',
    );
  }
  if (getInsideItCallback()) {
    throw new Error(
      'afterEachIteration() cannot be called inside an it() callback',
    );
  }
  validateTimeout(timeout, 'afterEachIteration');
  currentBlock.afterEachHooks.push(fn);
}

/**
 * Registers a cycle-level setup hook that runs once before each benchmark cycle starts.
 *
 * **Tinybench Mapping:** This corresponds to Tinybench's `BenchOptions.setup` hook.
 *
 * **Lifecycle:** Executes once per benchmark cycle (warmup cycle and run cycle), before beforeAllIterations()
 * **Frequency:** Runs **1-2 times per benchmark** (once before warmup cycle if enabled, once before run cycle)
 * **Context:** Tinybench cycle context with Task instance and mode parameter
 *
 * ⚠️ **TINYBENCH BEHAVIOR - COUNTER-INTUITIVE:** Tinybench executes beforeCycle() (setup) BEFORE beforeAllIterations()!
 * This is Tinybench's design, not a choice of this wrapper library.
 * See the "Hook Execution Order" section at the top of this file for details.
 *
 * Use this for expensive initialization that other hooks depend on.
 *
 * **Execution Order (per benchmark):**
 * 1. beforeAll() - suite-level (runs first, once per suite)
 * 2. **beforeCycle() - YOU ARE HERE** ⚠️ Runs 1-2 times (before warmup if enabled, before run)
 * 3. beforeAllIterations() - runs after this hook (1-2 times)
 * 4. WARMUP PHASE (if enabled):
 *    - beforeEachIteration() → benchmark → afterEachIteration()
 * 5. MEASUREMENT PHASE:
 *    - beforeEachIteration() → benchmark → afterEachIteration()
 * 6. afterAllIterations() - after all iterations (1-2 times)
 * 7. afterCycle() - cleanup (1-2 times)
 * 8. afterAll() - suite-level (runs last, once per suite)
 *
 * **State Availability:** Can safely access state initialized in beforeAll() (suite)
 *
 * **Common Use Case:** Initialize expensive resources per benchmark cycle that beforeAllIterations/beforeEachIteration will use
 *
 * @param fn - Callback receiving Task instance and mode ('warmup' or 'run'). Parameters are optional for backward compatibility.
 * @param timeout - Optional timeout in milliseconds
 *
 * @throws {Error} If called outside a describe() block
 * @throws {Error} If called inside an it() callback
 *
 * @example
 * ```ts
 * describe('My Suite', () => {
 *   let expensiveResource;
 *
 *   beforeCycle((task, mode) => {
 *     // ✅ Runs 1-2 times per benchmark (before warmup if enabled, before run)
 *     expensiveResource = initializeExpensiveResource();
 *     console.log(`Setting up ${task.name} for ${mode} cycle`);
 *   });
 *
 *   beforeAllIterations(() => {
 *     // ✅ SAFE: Can use expensiveResource here since beforeCycle runs BEFORE beforeAllIterations
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
 * ❌ **WRONG:** Don't try to use state from beforeAllIterations in beforeCycle
 * ```ts
 * let config;
 * beforeAllIterations(() => { config = loadConfig(); }); // Runs AFTER beforeCycle!
 * beforeCycle(() => { useConfig(config); }); // ERROR: config is undefined!
 * ```
 */
export function beforeCycle(
  fn: (task?: Task, mode?: 'run' | 'warmup') => void | Promise<void>,
  timeout?: number,
): void {
  const currentBlock = getCurrentDescribeBlock();
  if (!currentBlock) {
    throw new Error('beforeCycle() must be called inside a describe() block');
  }
  if (getInsideItCallback()) {
    throw new Error('beforeCycle() cannot be called inside an it() callback');
  }
  validateTimeout(timeout, 'beforeCycle');
  currentBlock.setupHooks.push(fn);
}

/**
 * Registers a cycle-level teardown hook that runs once after each benchmark cycle completes.
 *
 * **Tinybench Mapping:** This corresponds to Tinybench's `BenchOptions.teardown` hook.
 *
 * **Lifecycle:** Executes once per benchmark cycle (warmup cycle and run cycle), after afterAllIterations()
 * **Frequency:** Runs **1-2 times per benchmark** (once after warmup cycle if enabled, once after run cycle)
 * **Context:** Tinybench cycle context with Task instance and mode parameter
 *
 * Use this to clean up resources created in beforeCycle().
 *
 * @param fn - Callback receiving Task instance and mode ('warmup' or 'run'). Parameters are optional for backward compatibility.
 * @param timeout - Optional timeout in milliseconds
 *
 * @throws {Error} If called outside a describe() block
 * @throws {Error} If called inside an it() callback
 *
 * @example
 * ```ts
 * describe('My Suite', () => {
 *   let tempFile;
 *
 *   beforeCycle((task, mode) => {
 *     // ✅ Runs 1-2 times per benchmark (before warmup if enabled, before run)
 *     tempFile = createTempFile();
 *     console.log(`Created temp file for ${task.name} ${mode} cycle`);
 *   });
 *
 *   afterCycle((task, mode) => {
 *     // ✅ Runs 1-2 times per benchmark (after warmup if enabled, after run)
 *     deleteTempFile(tempFile);
 *     console.log(`Cleaned up ${task.name} ${mode} cycle`);
 *   });
 *
 *   it('should use temp file', () => {
 *     writeToFile(tempFile);
 *   });
 * });
 * ```
 */
export function afterCycle(
  fn: (task?: Task, mode?: 'run' | 'warmup') => void | Promise<void>,
  timeout?: number,
): void {
  const currentBlock = getCurrentDescribeBlock();
  if (!currentBlock) {
    throw new Error('afterCycle() must be called inside a describe() block');
  }
  if (getInsideItCallback()) {
    throw new Error('afterCycle() cannot be called inside an it() callback');
  }
  validateTimeout(timeout, 'afterCycle');
  currentBlock.teardownHooks.push(fn);
}

/**
 * Registers a suite-level setup hook that runs once before all benchmarks in the describe block.
 *
 * **Lifecycle:** Executes once before any benchmarks in the suite begin
 * **Frequency:** Runs once per describe block (before all benchmarks and their cycles)
 * **Context:** Jest context (runs outside Tinybench, no Task or mode parameters)
 *
 * ✅ **RUNS FIRST:** This is the first hook to execute in the entire suite!
 * See the "Hook Execution Order" section at the top of this file for details.
 *
 * This runs before any benchmark tasks are created. Use this for one-time initialization
 * that should be shared across all benchmarks in the suite.
 *
 * **Execution Order:**
 * 1. **beforeAll() - YOU ARE HERE** ✅ Runs FIRST!
 * 2. beforeCycle() - per benchmark cycle
 * 3. beforeAllIterations() - per benchmark cycle
 * 4. beforeEachIteration() - per iteration
 * 5. benchmark function - per iteration
 * 6. afterEachIteration() - per iteration
 * 7. afterAllIterations() - per benchmark cycle
 * 8. afterCycle() - per benchmark cycle
 * 9. afterAll() - runs last
 *
 * **State Availability:** State initialized here is available to ALL subsequent hooks
 *
 * **Common Use Case:** Initialize expensive shared resources used across multiple benchmarks
 *
 * @param fn - The function to run before all benchmarks in the suite. Follows Jest's beforeAll pattern with optional done callback.
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
 *   beforeAll(() => {
 *     // ✅ Runs FIRST - all other hooks can use sharedState
 *     sharedState = initializeSharedState();
 *   });
 *
 *   // With timeout for long-running setup
 *   beforeAll(async () => {
 *     sharedState = await initializeExpensiveResource();
 *   }, 30000); // 30 second timeout
 *
 *   describe('Group 1', () => {
 *     it('should use shared state', () => {
 *       // ✅ SAFE: sharedState initialized in beforeAll
 *       processSharedState(sharedState);
 *     });
 *   });
 *
 *   describe('Group 2', () => {
 *     it('should also use shared state', () => {
 *       // ✅ SAFE: sharedState initialized in beforeAll
 *       processSharedState(sharedState);
 *     });
 *   });
 * });
 * ```
 */
export function beforeAll(
  fn: () => void | Promise<void>,
  timeout?: number,
): void {
  const currentBlock = getCurrentDescribeBlock();
  if (!currentBlock) {
    throw new Error('beforeAll() must be called inside a describe() block');
  }
  if (getInsideItCallback()) {
    throw new Error('beforeAll() cannot be called inside an it() callback');
  }
  validateTimeout(timeout, 'beforeAll');
  currentBlock.setupSuiteHooks.push({ fn, timeout });
}

/**
 * Registers a suite-level teardown hook that runs once after all benchmarks in the describe block.
 *
 * **Lifecycle:** Executes once after all benchmarks in the suite complete
 * **Frequency:** Runs once per describe block (after all benchmarks and their cycles)
 * **Context:** Jest context (runs outside Tinybench, no Task or mode parameters)
 *
 * This runs after all benchmark tasks have completed. Use this for cleanup of resources
 * initialized in beforeAll().
 *
 * @param fn - The function to run after all benchmarks in the suite. Follows Jest's afterAll pattern with optional done callback.
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
 *   beforeAll(() => {
 *     sharedState = initializeSharedState();
 *   });
 *
 *   afterAll(() => {
 *     cleanupSharedState(sharedState);
 *   });
 *
 *   // With timeout for long-running cleanup
 *   afterAll(async () => {
 *     await cleanupExpensiveResource(sharedState);
 *   }, 15000); // 15 second timeout
 *
 *   it('should use shared state', () => {
 *     processSharedState(sharedState);
 *   });
 * });
 * ```
 */
export function afterAll(
  fn: () => void | Promise<void>,
  timeout?: number,
): void {
  const currentBlock = getCurrentDescribeBlock();
  if (!currentBlock) {
    throw new Error('afterAll() must be called inside a describe() block');
  }
  if (getInsideItCallback()) {
    throw new Error('afterAll() cannot be called inside an it() callback');
  }
  validateTimeout(timeout, 'afterAll');
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

  /**
   * Optional threshold in milliseconds for beforeEachIteration hook performance warnings.
   * If beforeEachIteration hooks take longer than this threshold, a warning will be displayed.
   *
   * Note: This only monitors hook performance, not the benchmark function itself.
   * The benchmark function is expected to be fast - that's what we're measuring.
   *
   * Defaults to 10ms locally, 50ms in CI environments (auto-detected).
   * If not specified, inherits from the parent describe block's setting.
   *
   * Set to 0 to disable hook performance warnings (or use quiet: true).
   */
  hookPerformanceThreshold?: number;
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
 *
 *   // Custom threshold for beforeEachIteration hook warnings
 *   it('benchmark with relaxed hook threshold', () => {
 *     doWork();
 *   }, {
 *     hookPerformanceThreshold: 100  // Only warn if beforeEachIteration hooks take >100ms
 *   });
 *
 *   // Disable beforeEachIteration hook warnings
 *   it('benchmark with hook warnings disabled', () => {
 *     doWork();
 *   }, {
 *     hookPerformanceThreshold: 0  // Never warn about slow hooks
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

  // Extract and validate itTimeout, quiet, and hookPerformanceThreshold options
  const {
    itTimeout,
    quiet,
    hookPerformanceThreshold,
    ...benchOptionsWithoutTimeout
  } = options || {};
  validateTimeout(itTimeout, 'it');

  // Determine quiet flag: explicit option > parent describe quiet > default (false)
  const effectiveQuiet = quiet ?? currentBlock.quiet ?? false;

  // Determine performance threshold: explicit option > parent threshold > environment default
  const effectiveThreshold =
    hookPerformanceThreshold ??
    currentBlock.hookPerformanceThreshold ??
    getDefaultPerformanceThreshold();

  // Collect hooks from current block and all ancestors
  const beforeAllIterationsHooks: Array<
    (task?: Task, mode?: 'run' | 'warmup') => void | Promise<void>
  > = [];
  const afterAllIterationsHooks: Array<
    (task?: Task, mode?: 'run' | 'warmup') => void | Promise<void>
  > = [];
  const beforeEachIterationHooks: Array<
    (task?: Task, mode?: 'run' | 'warmup') => void | Promise<void>
  > = [];
  const afterEachIterationHooks: Array<
    (task?: Task, mode?: 'run' | 'warmup') => void | Promise<void>
  > = [];
  const setupTaskHooks: Array<
    (task?: Task, mode?: 'run' | 'warmup') => void | Promise<void>
  > = [];
  const teardownTaskHooks: Array<
    (task?: Task, mode?: 'run' | 'warmup') => void | Promise<void>
  > = [];

  let block: DescribeBlock | undefined = currentBlock;
  const blocks: DescribeBlock[] = [];

  // Collect all blocks from current to root
  while (block) {
    blocks.unshift(block);
    block = block.parent;
  }

  // Collect hooks in order from root to current
  for (const b of blocks) {
    beforeAllIterationsHooks.push(...b.beforeAllHooks);
    afterAllIterationsHooks.push(...b.afterAllHooks);
    beforeEachIterationHooks.push(...b.beforeEachHooks);
    afterEachIterationHooks.push(...b.afterEachHooks);
    setupTaskHooks.push(...b.setupHooks);
    teardownTaskHooks.push(...b.teardownHooks);
  }

  const fnOptions: FnOptions = {};

  if (beforeAllIterationsHooks.length > 0) {
    fnOptions.beforeAll = async function (this: Task, mode?: 'run' | 'warmup') {
      for (const hook of beforeAllIterationsHooks) {
        await hook(this, mode);
      }
    };
  }

  if (afterAllIterationsHooks.length > 0) {
    fnOptions.afterAll = async function (this: Task, mode?: 'run' | 'warmup') {
      for (const hook of afterAllIterationsHooks) {
        await hook(this, mode);
      }
    };
  }

  if (beforeEachIterationHooks.length > 0) {
    fnOptions.beforeEach = async function (
      this: Task,
      mode?: 'run' | 'warmup',
    ) {
      // ⚠️ WARNING: This runs THOUSANDS of times per benchmark (warmup + measured iterations)!
      // Slow operations here will severely impact benchmark accuracy.

      // Only measure performance if warnings are enabled (not quiet)
      const startTime = effectiveQuiet ? 0 : performance.now();

      for (const hook of beforeEachIterationHooks) {
        await hook(this, mode);
      }

      // Warn if beforeEachIteration takes too long (indicates expensive operations)
      // Only measure and warn if quiet flag is not set and threshold is positive
      if (!effectiveQuiet && effectiveThreshold > 0) {
        const duration = performance.now() - startTime;
        if (duration > effectiveThreshold) {
          // Duration exceeds the configured threshold
          console.warn(
            `⚠️ Performance Warning: beforeEachIteration hook took ${duration.toFixed(2)}ms ` +
              `(threshold: ${effectiveThreshold}ms). ` +
              `This runs THOUSANDS of times (including warmup iterations) and may impact benchmark accuracy. ` +
              `Consider moving expensive operations to beforeCycle() or beforeAllIterations().`,
          );
        }
      }
    };
  }

  if (afterEachIterationHooks.length > 0) {
    fnOptions.afterEach = async function (this: Task, mode?: 'run' | 'warmup') {
      for (const hook of afterEachIterationHooks) {
        await hook(this, mode);
      }
    };
  }

  // Add beforeCycle/afterCycle as bench options if present
  let benchOptions = benchOptionsWithoutTimeout;
  if (setupTaskHooks.length > 0 || teardownTaskHooks.length > 0) {
    benchOptions = { ...benchOptionsWithoutTimeout };
    if (setupTaskHooks.length > 0) {
      benchOptions.setup = async (task?: Task, mode?: 'run' | 'warmup') => {
        // ⚠️ TINYBENCH EXECUTION ORDER: Tinybench calls setup (beforeCycle) BEFORE beforeAllIterations()
        // This is counter-intuitive but is how Tinybench works internally!
        // We cannot change this order - it's defined by Tinybench's implementation.
        // State initialized here IS available in beforeAllIterations/beforeEachIteration.
        for (const hook of setupTaskHooks) {
          await hook(task, mode);
        }
      };
    }
    if (teardownTaskHooks.length > 0) {
      benchOptions.teardown = async (task?: Task, mode?: 'run' | 'warmup') => {
        // Runs AFTER afterAllIterations() to clean up resources from beforeCycle()
        for (const hook of teardownTaskHooks) {
          await hook(task, mode);
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

  /**
   * Optional threshold in milliseconds for beforeEachIteration hook performance warnings.
   * If beforeEachIteration hooks take longer than this threshold, a warning will be displayed.
   *
   * Note: This only monitors hook performance, not benchmark functions.
   * Slow hooks can distort benchmark results by adding overhead to every iteration.
   *
   * Defaults to 10ms locally, 50ms in CI environments (auto-detected via CI env var).
   * Child describe blocks inherit this setting from their parent.
   *
   * Set to 0 to disable hook performance warnings (or use quiet: true).
   */
  hookPerformanceThreshold?: number;
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
 *
 * @example
 * Custom threshold for beforeEachIteration hook warnings:
 * ```ts
 * // In CI environments, use a more relaxed threshold for hook warnings
 * describe('CI Performance Tests', () => {
 *   it('benchmark', () => {
 *     doWork();
 *   });
 * }, { hookPerformanceThreshold: 100 });  // Only warn if beforeEachIteration hooks take >100ms
 *
 * // Disable hook performance warnings completely
 * describe('No Hook Warning Tests', () => {
 *   it('benchmark', () => {
 *     doWork();
 *   });
 * }, { hookPerformanceThreshold: 0 });  // Never warn about slow hooks
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

  // Determine performance threshold: explicit option > parent threshold > environment default
  const effectiveThreshold =
    options?.hookPerformanceThreshold ??
    currentBlock?.hookPerformanceThreshold ??
    getDefaultPerformanceThreshold();

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
    hookPerformanceThreshold: effectiveThreshold,
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
 * Builds the full path of describe block names from root to current block.
 * For example, if we have:
 * describe('Suite', () => {
 *   describe('Group', () => { ... })
 * })
 * This returns 'Suite > Group'
 *
 * @param block - The describe block to build the path for
 * @returns The full path as a string with " > " separator
 */
function buildDescribeBlockPath(block: DescribeBlock): string {
  const names: string[] = [];
  let current: DescribeBlock | undefined = block;

  while (current) {
    names.unshift(current.name);
    current = current.parent;
  }

  return names.join(' > ');
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
     * 1. beforeAll() [suite-level] - registered as Jest beforeAll (runs FIRST)
     * 2. Benchmark execution - registered as Jest beforeAll (runs SECOND)
     *    - For each benchmark (Tinybench controls this order):
     *      a. beforeCycle() - BenchOptions.setup (⚠️ Tinybench runs this BEFORE beforeAllIterations!)
     *      b. beforeAllIterations() - FnOptions.beforeAll
     *      c. WARMUP PHASE (if warmup enabled, mode='warmup'):
     *         - beforeEachIteration() → benchmark function → afterEachIteration()
     *         - Repeated for warmup iterations (typically ~16)
     *         - ⚠️ beforeEachIteration/afterEachIteration run during warmup!
     *      d. MEASUREMENT PHASE (mode='run'):
     *         - beforeEachIteration() → benchmark function → afterEachIteration()
     *         - Repeated for measured iterations (typically ~1000)
     *      e. afterAllIterations() - FnOptions.afterAll
     *      f. afterCycle() - BenchOptions.teardown
     * 3. afterAll() [suite-level] - registered as Jest afterAll (runs LAST)
     */

    // STEP 1: Run beforeAll (suite-level) hooks (registered FIRST)
    for (const hook of block.setupSuiteHooks) {
      const timeout = hook.timeout;
      if (timeout !== undefined) {
        validateTimeout(timeout, 'beforeAll');
        getJestBeforeAll()(hook.fn, timeout);
      } else {
        getJestBeforeAll()(hook.fn);
      }
    }

    // STEP 2: Run all benchmarks (registered AFTER suite-level beforeAll hooks)
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

    // STEP 3: Run afterAll (suite-level) hooks (registered AFTER benchmark hook)
    for (const hook of block.teardownSuiteHooks) {
      const timeout = hook.timeout;
      if (timeout !== undefined) {
        validateTimeout(timeout, 'afterAll');
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
            `[${buildDescribeBlockPath(block)}] ${benchmark.name}`,
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
