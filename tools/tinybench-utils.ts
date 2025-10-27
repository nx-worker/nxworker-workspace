import { Bench, BenchOptions, Fn, FnOptions } from 'tinybench';
import {
  describe as jestDescribe,
  it as jestIt,
  beforeAll as jestBeforeAll,
  afterAll as jestAfterAll,
} from '@jest/globals';

/**
 * Internal representation of a registered benchmark
 */
interface RegisteredBenchmark {
  name: string;
  fn: Fn;
  fnOptions: FnOptions;
  benchOptions?: Omit<BenchOptions, 'name'>;
  itTimeout?: number;
}

/**
 * Hook with optional timeout configuration
 */
interface HookWithTimeout {
  fn: () => void | Promise<void>;
  timeout?: number;
}

/**
 * Represents a describe block with its benchmarks and hooks
 */
interface DescribeBlock {
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
}

/**
 * Global state for tracking current describe block
 */
let currentDescribeBlock: DescribeBlock | undefined = undefined;
let rootDescribeBlock: DescribeBlock | undefined = undefined;
let insideItCallback = false;

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
 * This corresponds to tinybench's FnOptions.beforeAll - a function that runs once before all
 * benchmark iterations.
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
  if (!currentDescribeBlock) {
    throw new Error('beforeAll() must be called inside a describe() block');
  }
  if (insideItCallback) {
    throw new Error('beforeAll() cannot be called inside an it() callback');
  }
  currentDescribeBlock.beforeAllHooks.push(fn);
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
  if (!currentDescribeBlock) {
    throw new Error('afterAll() must be called inside a describe() block');
  }
  if (insideItCallback) {
    throw new Error('afterAll() cannot be called inside an it() callback');
  }
  currentDescribeBlock.afterAllHooks.push(fn);
}

/**
 * Registers a hook that runs before each benchmark iteration in the current describe block.
 *
 * This corresponds to tinybench's FnOptions.beforeEach - a function that runs before each
 * iteration of the benchmark.
 *
 * @param fn - The function to run before each iteration
 *
 * @throws {Error} If called outside a describe() block
 * @throws {Error} If called inside an it() callback
 *
 * @example
 * ```ts
 * describe('My Suite', () => {
 *   let testData;
 *
 *   beforeEach(() => {
 *     testData = createFreshData();
 *   });
 *
 *   it('should process data', () => {
 *     processData(testData);
 *   });
 * });
 * ```
 */
export function beforeEach(fn: () => void | Promise<void>): void {
  if (!currentDescribeBlock) {
    throw new Error('beforeEach() must be called inside a describe() block');
  }
  if (insideItCallback) {
    throw new Error('beforeEach() cannot be called inside an it() callback');
  }
  currentDescribeBlock.beforeEachHooks.push(fn);
}

/**
 * Registers a hook that runs after each benchmark iteration in the current describe block.
 *
 * This corresponds to tinybench's FnOptions.afterEach - a function that runs after each
 * iteration of the benchmark.
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
  if (!currentDescribeBlock) {
    throw new Error('afterEach() must be called inside a describe() block');
  }
  if (insideItCallback) {
    throw new Error('afterEach() cannot be called inside an it() callback');
  }
  currentDescribeBlock.afterEachHooks.push(fn);
}

/**
 * Registers a benchmark-level setup hook that runs once before the benchmark starts.
 *
 * This corresponds to tinybench's BenchOptions.setup - a function that runs before the
 * benchmark starts (before warmup). Use this for expensive initialization that other hooks
 * depend on.
 *
 * **Note:** In tinybench, `setup` runs before `beforeAll`. If you have initialization that
 * other hooks need, put it in `setup`, not `beforeAll`.
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
 *     expensiveResource = initializeExpensiveResource();
 *   });
 *
 *   beforeAll(() => {
 *     // Can use expensiveResource here since setup runs first
 *     configureResource(expensiveResource);
 *   });
 *
 *   it('should use resource', () => {
 *     useResource(expensiveResource);
 *   });
 * });
 * ```
 */
export function setup(fn: () => void | Promise<void>): void {
  if (!currentDescribeBlock) {
    throw new Error('setup() must be called inside a describe() block');
  }
  if (insideItCallback) {
    throw new Error('setup() cannot be called inside an it() callback');
  }
  currentDescribeBlock.setupHooks.push(fn);
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
  if (!currentDescribeBlock) {
    throw new Error('teardown() must be called inside a describe() block');
  }
  if (insideItCallback) {
    throw new Error('teardown() cannot be called inside an it() callback');
  }
  currentDescribeBlock.teardownHooks.push(fn);
}

/**
 * Registers a suite-level setup hook that runs once before all benchmarks in the describe block.
 *
 * This runs before any benchmark tasks are created. Use this for one-time initialization
 * that should be shared across all benchmarks in the suite.
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
 *       processSharedState(sharedState);
 *     });
 *   });
 *
 *   describe('Group 2', () => {
 *     it('should also use shared state', () => {
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
  if (!currentDescribeBlock) {
    throw new Error('setupSuite() must be called inside a describe() block');
  }
  if (insideItCallback) {
    throw new Error('setupSuite() cannot be called inside an it() callback');
  }
  validateTimeout(timeout, 'setupSuite');
  currentDescribeBlock.setupSuiteHooks.push({ fn, timeout });
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
  if (!currentDescribeBlock) {
    throw new Error('teardownSuite() must be called inside a describe() block');
  }
  if (insideItCallback) {
    throw new Error('teardownSuite() cannot be called inside an it() callback');
  }
  validateTimeout(timeout, 'teardownSuite');
  currentDescribeBlock.teardownSuiteHooks.push({ fn, timeout });
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
}

/**
 * Defines a benchmark task within a describe block.
 *
 * Each `it()` call creates a benchmark task that will be measured. The function provided
 * will be executed thousands of times to measure its performance.
 *
 * @param name - The name of the benchmark task
 * @param fn - The function to benchmark (will be executed many times)
 * @param options - Optional benchmark options (iterations, warmup, itTimeout, etc.)
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
 * });
 * ```
 */
export function it(name: string, fn: Fn, options?: ItOptions): void {
  if (!currentDescribeBlock) {
    throw new Error('it() must be called inside a describe() block');
  }
  if (insideItCallback) {
    throw new Error('it() cannot be called inside an it() callback');
  }

  // Extract and validate itTimeout
  const { itTimeout, ...benchOptionsWithoutTimeout } = options || {};
  validateTimeout(itTimeout, 'it');

  // Collect hooks from current block and all ancestors
  const beforeAllHooks: Array<() => void | Promise<void>> = [];
  const afterAllHooks: Array<() => void | Promise<void>> = [];
  const beforeEachHooks: Array<() => void | Promise<void>> = [];
  const afterEachHooks: Array<() => void | Promise<void>> = [];
  const setupHooks: Array<() => void | Promise<void>> = [];
  const teardownHooks: Array<() => void | Promise<void>> = [];

  let block: DescribeBlock | undefined = currentDescribeBlock;
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
      for (const hook of beforeEachHooks) {
        await hook();
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
        for (const hook of setupHooks) {
          await hook();
        }
      };
    }
    if (teardownHooks.length > 0) {
      benchOptions.teardown = async () => {
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
    insideItCallback = true;
    try {
      const result = fn();
      // If it's a promise, chain the cleanup
      if (
        result &&
        typeof result === 'object' &&
        typeof (result as any).then === 'function'
      ) {
        return (result as Promise<any>).finally(() => {
          insideItCallback = false;
        });
      }
      // Otherwise, clean up immediately
      insideItCallback = false;
      return result;
    } catch (error) {
      insideItCallback = false;
      throw error;
    }
  };

  currentDescribeBlock.benchmarks.push({
    name,
    fn: wrappedFn,
    fnOptions,
    benchOptions,
    itTimeout,
  });
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
 */
export function describe(name: string, callback: () => void): void {
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
    parent: currentDescribeBlock,
  };

  if (currentDescribeBlock) {
    currentDescribeBlock.children.push(block);
  } else {
    // This is the root describe block
    rootDescribeBlock = block;
  }

  const previousBlock = currentDescribeBlock;
  currentDescribeBlock = block;

  // Execute the callback to register benchmarks and nested describes
  callback();

  currentDescribeBlock = previousBlock;

  // If this was the root describe, run the benchmarks
  if (!currentDescribeBlock && rootDescribeBlock === block) {
    runDescribeBlock(block);
    rootDescribeBlock = undefined;
  }
}

/**
 * Runs a describe block as a Jest describe with its benchmarks and nested describes
 */
function runDescribeBlock(block: DescribeBlock): void {
  jestDescribe(block.name, () => {
    let summary: string;

    jestBeforeAll(() => {
      summary = '';
    });

    // Run setupSuite hooks with timeout validation
    for (const hook of block.setupSuiteHooks) {
      const timeout = hook.timeout;
      if (timeout !== undefined) {
        validateTimeout(timeout, 'setupSuite');
        jestBeforeAll(hook.fn, timeout);
      } else {
        jestBeforeAll(hook.fn);
      }
    }

    // Run teardownSuite hooks with timeout validation
    for (const hook of block.teardownSuiteHooks) {
      const timeout = hook.timeout;
      if (timeout !== undefined) {
        validateTimeout(timeout, 'teardownSuite');
        jestAfterAll(hook.fn, timeout);
      } else {
        jestAfterAll(hook.fn);
      }
    }

    jestAfterAll(() => {
      if (summary) {
        console.log(summary);
      }
    });

    // Run benchmarks defined directly in this describe block
    for (const benchmark of block.benchmarks) {
      const testFn = async () => {
        const benchOptions: BenchOptions = {
          name: `${block.name}/${benchmark.name}`,
          ...benchmark.benchOptions,
        };

        const bench = new Bench(benchOptions);
        bench.add(benchmark.name, benchmark.fn, benchmark.fnOptions);

        const tasks = await bench.run();

        for (const task of tasks) {
          const taskResult = task.result;

          if (!taskResult) {
            throw new Error(
              `[${block.name}] ${task.name} did not produce a result`,
            );
          }

          if (taskResult.error) {
            const error = new Error(
              `[${block.name}] ${task.name} failed: ${taskResult.error.message}`,
            );
            (error as any).cause = taskResult.error;
            throw error;
          }

          summary +=
            formatBenchmarkResult(
              `[${block.name}] ${task.name}`,
              taskResult.throughput.mean,
              taskResult.latency.rme,
              taskResult.latency.samples.length,
            ) + '\n';
        }
      };

      // Pass itTimeout to Jest if defined
      const itTimeout = benchmark.itTimeout;
      if (itTimeout !== undefined) {
        validateTimeout(itTimeout, 'it');
        jestIt(benchmark.name, testFn, itTimeout);
      } else {
        jestIt(benchmark.name, testFn);
      }
    }

    // Recursively run nested describe blocks
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
