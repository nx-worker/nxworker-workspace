/**
 * Benchmark utilities for comparing regex vs AST-based import detection
 */

export interface BenchmarkResult {
  name: string;
  executionTimeMs: number;
  iterations: number;
  averageTimeMs: number;
}

/**
 * Measures execution time of a function over multiple iterations
 */
export function benchmark(
  name: string,
  fn: () => void,
  iterations = 100,
): BenchmarkResult {
  const startTime = performance.now();

  for (let i = 0; i < iterations; i++) {
    fn();
  }

  const endTime = performance.now();
  const executionTimeMs = endTime - startTime;
  const averageTimeMs = executionTimeMs / iterations;

  return {
    name,
    executionTimeMs,
    iterations,
    averageTimeMs,
  };
}

/**
 * Compares two benchmark results and returns a report
 */
export function compareBenchmarks(
  baseline: BenchmarkResult,
  current: BenchmarkResult,
): string {
  const speedup = baseline.averageTimeMs / current.averageTimeMs;
  const percentChange =
    ((current.averageTimeMs - baseline.averageTimeMs) /
      baseline.averageTimeMs) *
    100;

  let comparison = '';
  if (speedup > 1) {
    comparison = `${speedup.toFixed(2)}x faster`;
  } else if (speedup < 1) {
    comparison = `${(1 / speedup).toFixed(2)}x slower`;
  } else {
    comparison = 'same speed';
  }

  return `
Benchmark Comparison:
--------------------
Baseline: ${baseline.name}
  - Average time: ${baseline.averageTimeMs.toFixed(3)}ms
  - Total time: ${baseline.executionTimeMs.toFixed(2)}ms (${baseline.iterations} iterations)

Current: ${current.name}
  - Average time: ${current.averageTimeMs.toFixed(3)}ms
  - Total time: ${current.executionTimeMs.toFixed(2)}ms (${current.iterations} iterations)

Result: ${comparison} (${percentChange > 0 ? '+' : ''}${percentChange.toFixed(2)}% change)
  `;
}
