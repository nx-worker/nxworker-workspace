/// <reference types="jest" />
/* eslint-env jest */
import { Bench, BenchOptions, Fn, FnOptions } from 'tinybench';

/**
 * Context object passed to each benchmark callback
 */
interface BenchmarkContext {
  /**
   * Define the benchmark function. Must be called exactly once.
   */
  bench: (fn: Fn) => void;
  /**
   * Hook that runs once before all iterations of this benchmark
   */
  beforeAll: (fn: () => void | Promise<void>) => void;
  /**
   * Hook that runs once after all iterations of this benchmark
   */
  afterAll: (fn: () => void | Promise<void>) => void;
  /**
   * Hook that runs before each iteration of this benchmark
   */
  beforeEach: (fn: () => void | Promise<void>) => void;
  /**
   * Hook that runs after each iteration of this benchmark
   */
  afterEach: (fn: () => void | Promise<void>) => void;
  /**
   * Benchmark-level setup hook (runs once before benchmark)
   */
  setup: (fn: () => void | Promise<void>) => void;
  /**
   * Benchmark-level teardown hook (runs once after benchmark)
   */
  teardown: (fn: () => void | Promise<void>) => void;
}

/**
 * Callback function for defining a benchmark
 */
type BenchmarkCallback = (context: BenchmarkContext) => void;

/**
 * Internal representation of a registered benchmark
 */
interface RegisteredBenchmark {
  name: string;
  callback: BenchmarkCallback;
  options?: Omit<BenchOptions, 'name'>;
}

/**
 * Global registry for benchmarks (scoped to current suite)
 */
let currentSuiteBenchmarks: RegisteredBenchmark[] = [];

/**
 * Registers a benchmark within a benchmark suite.
 * Must be called inside a benchmarkSuite factory function.
 *
 * @example
 * ```ts
 * benchmarkSuite('My Suite', () => {
 *   let suiteScoped: string;
 *
 *   benchmark('Simple benchmark', ({ bench }) => {
 *     bench(() => {
 *       doWork(suiteScoped);
 *     });
 *   });
 *
 *   benchmark('With hooks', ({ bench, beforeAll, beforeEach }) => {
 *     let benchmarkScoped: number;
 *
 *     beforeAll(() => {
 *       benchmarkScoped = 0;
 *     });
 *
 *     beforeEach(() => {
 *       benchmarkScoped++;
 *     });
 *
 *     bench(() => {
 *       doWork(benchmarkScoped);
 *     });
 *   }, { iterations: 10, warmup: true });
 * });
 * ```
 *
 * @param name - The name of the benchmark
 * @param callback - Callback function that receives the benchmark context
 * @param options - Optional BenchOptions for this benchmark (iterations, warmup, etc.)
 */
export function benchmark(
  name: string,
  callback: BenchmarkCallback,
  options?: Omit<BenchOptions, 'name'>,
): void {
  currentSuiteBenchmarks.push({ name, callback, options });
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

/**
 * Runs a benchmark suite using tinybench and outputs results in jest-bench format.
 * This wrapper provides Jest-compatible benchmark testing while outputting
 * results compatible with benchmark-action/github-action-benchmark.
 *
 * @example
 * ```ts
 * benchmarkSuite('My Suite', () => {
 *   let suiteScoped: string;
 *
 *   benchmark('Benchmark', ({ bench }) => {
 *     bench(() => {
 *       doWork(suiteScoped);
 *     });
 *   });
 *
 *   benchmark('With hooks', ({ bench, beforeAll, setup }) => {
 *     let benchmarkScoped: string;
 *
 *     beforeAll(() => { benchmarkScoped = 'foo'; });
 *     setup(() => { benchmarkScoped = 'bar'; });
 *
 *     bench(() => {
 *       doWork(suiteScoped, benchmarkScoped);
 *     });
 *   }, { iterations: 10, warmup: true });
 * });
 * ```
 *
 * @param suiteName - The name of the benchmark suite
 * @param suiteFactory - Factory function that registers benchmarks using the `benchmark()` function
 */
export function benchmarkSuite(
  suiteName: string,
  suiteFactory: () => void,
): void {
  // Clear the benchmark registry for this suite
  currentSuiteBenchmarks = [];

  // Execute the factory to register benchmarks
  suiteFactory();

  // Get the registered benchmarks
  const benchmarksToRun = [...currentSuiteBenchmarks];

  // Clear registry after capturing
  currentSuiteBenchmarks = [];

  describe(suiteName, () => {
    let summary: string;

    beforeAll(() => {
      summary = '';
    });

    afterAll(() => {
      console.log(summary);
    });

    for (const registered of benchmarksToRun) {
      it(registered.name, async () => {
        let benchFn: Fn | undefined;
        const beforeAllCallbacks: Array<() => void | Promise<void>> = [];
        const afterAllCallbacks: Array<() => void | Promise<void>> = [];
        const beforeEachCallbacks: Array<() => void | Promise<void>> = [];
        const afterEachCallbacks: Array<() => void | Promise<void>> = [];
        const setupCallbacks: Array<() => void | Promise<void>> = [];
        const teardownCallbacks: Array<() => void | Promise<void>> = [];

        const context: BenchmarkContext = {
          bench: (fn: Fn) => {
            if (benchFn !== undefined) {
              throw new Error(
                `bench() can only be called once in benchmark "${registered.name}"`,
              );
            }
            benchFn = fn;
          },
          beforeAll: (fn) => beforeAllCallbacks.push(fn),
          afterAll: (fn) => afterAllCallbacks.push(fn),
          beforeEach: (fn) => beforeEachCallbacks.push(fn),
          afterEach: (fn) => afterEachCallbacks.push(fn),
          setup: (fn) => setupCallbacks.push(fn),
          teardown: (fn) => teardownCallbacks.push(fn),
        };

        // Execute the benchmark callback to collect the bench function and hooks
        registered.callback(context);

        // Validate that bench() was called
        if (benchFn === undefined) {
          throw new Error(
            `bench() must be called in benchmark "${registered.name}"`,
          );
        }

        // Build FnOptions from collected hooks
        const fnOptions: FnOptions = {};

        if (beforeAllCallbacks.length > 0) {
          fnOptions.beforeAll = async () => {
            for (const cb of beforeAllCallbacks) {
              await cb();
            }
          };
        }

        if (afterAllCallbacks.length > 0) {
          fnOptions.afterAll = async () => {
            for (const cb of afterAllCallbacks) {
              await cb();
            }
          };
        }

        if (beforeEachCallbacks.length > 0) {
          fnOptions.beforeEach = async () => {
            for (const cb of beforeEachCallbacks) {
              await cb();
            }
          };
        }

        if (afterEachCallbacks.length > 0) {
          fnOptions.afterEach = async () => {
            for (const cb of afterEachCallbacks) {
              await cb();
            }
          };
        }

        // Build BenchOptions from setup/teardown and registered options
        const benchOptions: BenchOptions = {
          name: suiteName,
          ...registered.options,
        };

        if (setupCallbacks.length > 0) {
          benchOptions.setup = async (task, mode) => {
            for (const cb of setupCallbacks) {
              await cb();
            }
          };
        }

        if (teardownCallbacks.length > 0) {
          benchOptions.teardown = async (task, mode) => {
            for (const cb of teardownCallbacks) {
              await cb();
            }
          };
        }

        // Create and run the benchmark
        const bench = new Bench(benchOptions);
        bench.add(registered.name, benchFn, fnOptions);

        const tasks = await bench.run();

        for (const task of tasks) {
          const taskResult = task.result;

          if (!taskResult) {
            throw new Error(
              `[${suiteName}] ${task.name} did not produce a result`,
            );
          }

          if (taskResult.error) {
            throw new Error(
              `[${suiteName}] ${task.name} failed: ${taskResult.error.message}`,
              {
                cause: taskResult.error,
              },
            );
          }

          summary +=
            formatBenchmarkResult(
              `[${suiteName}] ${task.name}`,
              taskResult.throughput.mean,
              taskResult.latency.rme,
              taskResult.latency.samples.length,
            ) + '\n';
        }
      });
    }
  });
}
