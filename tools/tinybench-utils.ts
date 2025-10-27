/// <reference types="jest" />
/* eslint-env jest */
import { Bench, BenchOptions, Fn, FnOptions } from 'tinybench';

// Custom types that extend tinybench to support context passing
type FnWithContext = (context: any) => any;
type FnHookWithContext = (
  context: any,
  mode?: 'run' | 'warmup',
) => Promise<void> | void;

interface FnOptionsWithContext {
  beforeAll?: FnHookWithContext;
  beforeEach?: FnHookWithContext;
  afterEach?: FnHookWithContext;
  afterAll?: FnHookWithContext;
}

interface FnWithOptions extends Omit<BenchOptions, 'name'> {
  readonly fn: Fn | FnWithContext;
  readonly fnOptions?: FnOptions | FnOptionsWithContext;
}

function isFnWithOptions(value: unknown): value is FnWithOptions {
  return isObject(value) && 'fn' in value && typeof value['fn'] === 'function';
}

function isObject(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === 'object';
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
 * @param suiteName - The name of the benchmark suite
 * @param benchmarks - Object mapping benchmark names to functions to benchmark
 * @param suiteOptions - Optional tinybench configuration
 */
export function benchmarkSuite(
  suiteName: string,
  benchmarks: Record<string, Fn | FnWithContext | FnWithOptions>,
  suiteOptions: Omit<BenchOptions, 'name'> & {
    readonly teardownSuite?: Parameters<typeof afterAll>[0];
    readonly teardownSuiteTimeout?: Parameters<typeof afterAll>[1];
    readonly setupSuite?: Parameters<typeof beforeAll>[0];
    readonly setupSuiteTimeout?: Parameters<typeof beforeAll>[1];
  } = {},
): void {
  describe(suiteName, () => {
    let summary: string;
    let context: unknown;

    beforeAll(() => {
      summary = '';
    });

    if (suiteOptions.setupSuite) {
      beforeAll(async () => {
        context = await suiteOptions.setupSuite!.call(undefined);
      }, suiteOptions.setupSuiteTimeout);
    }

    if (suiteOptions.teardownSuite) {
      afterAll(suiteOptions.teardownSuite, suiteOptions.teardownSuiteTimeout);
    }

    afterAll(() => {
      console.log(summary);
    });

    it.each(Object.entries(benchmarks))(
      '%s',
      async (benchmarkName, benchmark) => {
        const benchmarkFn = isFnWithOptions(benchmark)
          ? benchmark.fn
          : benchmark;
        let options = { ...suiteOptions };
        let fnOptions: FnOptions | undefined;

        if (isFnWithOptions(benchmark)) {
          const { fn, ...benchmarkOptions } = benchmark;
          // Override suite options with benchmark-specific options
          options = { ...options, ...benchmarkOptions };
          fnOptions = benchmark.fnOptions;
        }

        const bench = new Bench({ name: suiteName, ...options });

        // Wrap the benchmark function to pass context
        const wrappedFn = () => (benchmarkFn as any).call(context, context);

        // Wrap fnOptions hooks to pass context
        const wrappedFnOptions: FnOptions | undefined = fnOptions
          ? {
              beforeAll: fnOptions.beforeAll
                ? function (this: unknown, mode?: 'run' | 'warmup') {
                    return (fnOptions.beforeAll as any)!.call(
                      context,
                      context,
                      mode,
                    );
                  }
                : undefined,
              beforeEach: fnOptions.beforeEach
                ? function (this: unknown, mode?: 'run' | 'warmup') {
                    return (fnOptions.beforeEach as any)!.call(
                      context,
                      context,
                      mode,
                    );
                  }
                : undefined,
              afterEach: fnOptions.afterEach
                ? function (this: unknown, mode?: 'run' | 'warmup') {
                    return (fnOptions.afterEach as any)!.call(
                      context,
                      context,
                      mode,
                    );
                  }
                : undefined,
              afterAll: fnOptions.afterAll
                ? function (this: unknown, mode?: 'run' | 'warmup') {
                    return (fnOptions.afterAll as any)!.call(
                      context,
                      context,
                      mode,
                    );
                  }
                : undefined,
            }
          : undefined;

        bench.add(benchmarkName, wrappedFn, wrappedFnOptions);

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
