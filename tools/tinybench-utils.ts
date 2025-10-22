/// <reference types="jest" />
/* eslint-env jest */
import { Bench, BenchOptions } from 'tinybench';

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
 * @param options - Optional tinybench configuration
 */
export function benchmarkSuite(
  suiteName: string,
  benchmarks: Record<string, () => void | Promise<void>>,
  options?: BenchOptions,
): void {
  describe(suiteName, () => {
    let summary = '';

    afterAll(() => {
      console.log(summary);
    });

    it.each(Object.entries(benchmarks))('%s', async (name, benchmark) => {
      const bench = new Bench(options);
      bench.add(name, benchmark);

      const tasks = await bench.run();

      for (const task of tasks) {
        if (task.result) {
          summary +=
            formatBenchmarkResult(
              `[${suiteName}] ${task.name}`,
              task.result.throughput.mean,
              task.result.latency.rme,
              task.result.latency.samples.length,
            ) + '\n';
        }
      }
    });
  });
}
