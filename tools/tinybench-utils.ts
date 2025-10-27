/// <reference types="jest" />
/* eslint-env jest */
import { Bench, BenchOptions, Fn, FnOptions } from 'tinybench';

interface FnWithOptions extends Omit<BenchOptions, 'name'> {
  readonly fn: Fn;
  readonly fnOptions?: FnOptions;
}

/**
 * Suite configuration with hooks
 */
interface SuiteConfig {
  readonly teardownSuite?: Parameters<typeof afterAll>[0];
  readonly teardownSuiteTimeout?: Parameters<typeof afterAll>[1];
  readonly setupSuite?: Parameters<typeof beforeAll>[0];
  readonly setupSuiteTimeout?: Parameters<typeof beforeAll>[1];
}

/**
 * Benchmark value that can be:
 * - A simple function
 * - A function with options (FnWithOptions)
 * - A factory function that returns a simple function
 * - A factory function that returns FnWithOptions
 */
type BenchmarkValue = Fn | FnWithOptions | BenchmarkFactory;

/**
 * Factory function for a single benchmark.
 * Can return either a simple function or FnWithOptions.
 */
type BenchmarkFactory = () => Fn | FnWithOptions;

/**
 * Suite factory function that returns benchmark configuration.
 */
type SuiteFactory = () => {
  readonly benchmarks: Record<string, BenchmarkValue>;
} & Omit<BenchOptions, 'name'> &
  SuiteConfig;

/**
 * Second parameter to benchmarkSuite can be either:
 * - A record of benchmarks (original API)
 * - A factory function that returns suite configuration
 */
type BenchmarksOrFactory = Record<string, BenchmarkValue> | SuiteFactory;

function isFnWithOptions(value: unknown): value is FnWithOptions {
  return isObject(value) && 'fn' in value && typeof value['fn'] === 'function';
}

function isObject(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === 'object';
}

function isSuiteFactory(value: BenchmarksOrFactory): value is SuiteFactory {
  return typeof value === 'function';
}

function isBenchmarkFactory(value: BenchmarkValue): value is BenchmarkFactory {
  // A BenchmarkFactory is a function that's not already identified as Fn or FnWithOptions
  // We distinguish it by checking if calling it returns another function or FnWithOptions
  return typeof value === 'function' && !isFnWithOptions(value);
}

/**
 * Resolves a BenchmarkValue to either Fn or FnWithOptions.
 * If it's a factory, calls it and returns the result.
 */
function resolveBenchmarkValue(value: BenchmarkValue): Fn | FnWithOptions {
  if (isBenchmarkFactory(value)) {
    const result = value();
    // The factory should return either Fn or FnWithOptions
    return result;
  }
  return value;
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
 * Supports two main patterns:
 *
 * 1. Original API with benchmarks object:
 * ```ts
 * benchmarkSuite('Suite', {
 *   'Benchmark': () => { ... },
 * }, { setupSuite: ... });
 * ```
 *
 * 2. Factory function API for shared scope:
 * ```ts
 * benchmarkSuite('Suite', () => {
 *   let sharedState;
 *   return {
 *     benchmarks: {
 *       'Benchmark': () => { ... },
 *     },
 *     setupSuite: () => { sharedState = ...; },
 *   };
 * });
 * ```
 *
 * Individual benchmarks can also be factory functions:
 * ```ts
 * benchmarkSuite('Suite', {
 *   'Benchmark': () => {
 *     let localState;
 *     return () => { localState++; };
 *   },
 * });
 * ```
 *
 * @param suiteName - The name of the benchmark suite
 * @param benchmarksOrFactory - Benchmarks object or factory function
 * @param suiteOptions - Optional tinybench configuration (ignored if using factory)
 */
export function benchmarkSuite(
  suiteName: string,
  benchmarksOrFactory: BenchmarksOrFactory,
  suiteOptions: Omit<BenchOptions, 'name'> & SuiteConfig = {},
): void {
  // Resolve factory if provided
  let benchmarks: Record<string, BenchmarkValue>;
  let resolvedSuiteOptions: Omit<BenchOptions, 'name'> & SuiteConfig;

  if (isSuiteFactory(benchmarksOrFactory)) {
    const config = benchmarksOrFactory();
    const { benchmarks: factoryBenchmarks, ...factoryOptions } = config;
    benchmarks = factoryBenchmarks;
    resolvedSuiteOptions = factoryOptions;
  } else {
    benchmarks = benchmarksOrFactory;
    resolvedSuiteOptions = suiteOptions;
  }

  describe(suiteName, () => {
    let summary: string;

    beforeAll(() => {
      summary = '';
    });

    if (resolvedSuiteOptions.setupSuite) {
      beforeAll(
        resolvedSuiteOptions.setupSuite,
        resolvedSuiteOptions.setupSuiteTimeout,
      );
    }

    if (resolvedSuiteOptions.teardownSuite) {
      afterAll(
        resolvedSuiteOptions.teardownSuite,
        resolvedSuiteOptions.teardownSuiteTimeout,
      );
    }

    afterAll(() => {
      console.log(summary);
    });

    it.each(Object.entries(benchmarks))(
      '%s',
      async (benchmarkName, benchmarkValue) => {
        // Resolve benchmark factory if needed
        const benchmark = resolveBenchmarkValue(benchmarkValue);

        const benchmarkFn = isFnWithOptions(benchmark)
          ? benchmark.fn
          : benchmark;
        let options = { ...resolvedSuiteOptions };
        let fnOptions: FnOptions | undefined;

        if (isFnWithOptions(benchmark)) {
          const { fn, ...benchmarkOptions } = benchmark;
          // Override suite options with benchmark-specific options
          options = { ...options, ...benchmarkOptions };
          fnOptions = benchmark.fnOptions;
        }

        const bench = new Bench({ name: suiteName, ...options });

        bench.add(benchmarkName, benchmarkFn, fnOptions);

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
      },
    );
  });
}
