import { Bench } from 'tinybench';

/**
 * Formats benchmark results in benchmark.js format for compatibility with
 * benchmark-action/github-action-benchmark.
 *
 * Output format: "name x ops/sec ±percent% (runs runs sampled)"
 * Example: "Cache hit x 1,431,759 ops/sec ±0.74% (93 runs sampled)"
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
  return `${name} x ${formattedOps} ops/sec ±${formattedRme}% (${samples} runs sampled)`;
}

/**
 * Runs a benchmark suite using tinybench and outputs results in benchmark.js format.
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

  // Output results in benchmark.js format immediately
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
