import { Bench } from 'tinybench';

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
  // Format ops/sec with commas for thousands
  const formattedOps = Math.round(opsPerSec).toLocaleString('en-US');
  // Format percentage with 2 decimal places
  const formattedRme = rme.toFixed(2);

  // Calculate time per operation
  const timePerOp = 1000 / opsPerSec; // in milliseconds
  let formattedTime: string;

  if (timePerOp < 0.001) {
    // Format as microseconds if less than 0.001 ms
    formattedTime = `${(timePerOp * 1000).toFixed(3)} μs`;
  } else if (timePerOp < 1) {
    // Format with 3 decimal places for small values
    formattedTime = `${timePerOp.toFixed(3)} ms`;
  } else {
    // Format with 2 decimal places for larger values
    formattedTime = `${timePerOp.toFixed(2)} ms`;
  }

  return `${name}  ${formattedOps} ops/sec  ${formattedTime} ±  ${formattedRme} %  (${samples} runs sampled)`;
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
export async function benchmarkSuite(
  suiteName: string,
  benchmarks: Record<string, () => void | Promise<void>>,
  options?: {
    time?: number;
    iterations?: number;
    warmupTime?: number;
    warmupIterations?: number;
  },
) {
  const bench = new Bench({
    time: options?.time ?? 1000,
    iterations: options?.iterations,
    warmupTime: options?.warmupTime ?? 100,
    warmupIterations: options?.warmupIterations,
  });

  // Add all benchmark tasks
  for (const [name, fn] of Object.entries(benchmarks)) {
    bench.add(name, fn);
  }

  // Run benchmarks
  await bench.run();

  // Output results in jest-bench format immediately
  // This ensures compatibility with benchmark-action/github-action-benchmark
  console.log(`\n  ${suiteName}`);

  for (const task of bench.tasks) {
    if (task.result) {
      const opsPerSec = task.result.hz ?? 0;
      const rme = task.result.rme ?? 0;
      const samples = task.result.samples?.length ?? 0;

      const result = formatBenchmarkResult(task.name, opsPerSec, rme, samples);
      console.log(`    ${result}`);
    }
  }

  // Return the bench instance for potential further inspection
  return bench;
}
