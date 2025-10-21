# Performance Benchmarks

This directory contains micro-benchmarks for the move-file generator's modular functions.

## Purpose

- Establish baseline performance metrics for critical operations
- Detect performance regressions during development
- Identify optimization opportunities
- Validate that refactoring hasn't introduced performance issues

## Running Benchmarks

### Run Locally

```bash
# Run all benchmarks using Nx task
npx nx benchmark workspace

# Run benchmarks with Jest directly
npx jest --projects jest-bench.config.ts

# Run specific benchmark suite
npx jest --projects jest-bench.config.ts --testPathPattern=cache-operations
npx jest --projects jest-bench.config.ts --testPathPattern=path-resolution
npx jest --projects jest-bench.config.ts --testPathPattern=import-updates
npx jest --projects jest-bench.config.ts --testPathPattern=export-management
npx jest --projects jest-bench.config.ts --testPathPattern=validation
```

### CI Integration

The benchmarks use [github-action-benchmark](https://github.com/benchmark-action/github-action-benchmark) for automated regression detection.

#### Regression Detection (Pull Requests)

**Automated**: Benchmark regression detection runs on all pull requests!

The CI system:

1. Runs all benchmark tests using jest-bench (powered by benchmark.js)
2. Parses benchmark results (ops/sec)
3. Compares against historical baseline data
4. Fails the PR if regressions exceed 150% threshold
5. Posts a comment showing which benchmarks regressed
6. Provides a job summary with visual comparison

#### Benchmark Tracking (Main Branch)

On pushes to `main`:

1. Runs all benchmarks
2. Stores results in GitHub Pages branch
3. Updates historical performance charts
4. Enables trend visualization over time

Visit the [benchmark dashboard](https://nx-worker.github.io/nxworker-workspace/dev/bench/) to see performance trends.

**If a regression is detected:**

The github-action-benchmark will automatically:

- Post a comment on the PR with details
- Show the benchmark comparison in the job summary
- Fail the CI check

To accept an intentional regression (e.g., trading performance for maintainability):

- Document the trade-off in the PR description
- Reviewers can approve despite the regression
- The historical baseline will update automatically when merged to `main`

## Benchmark Implementation

Benchmarks use the [jest-bench](https://www.npmjs.com/package/jest-bench) library, which provides:

- Jest integration with `benchmarkSuite` API
- Powered by benchmark.js for statistical rigor
- Multiple iterations with automatic calibration
- Detection of performance outliers
- Standard deviation and margin of error calculation
- Standard ops/sec reporting compatible with github-action-benchmark

Each benchmark file uses `benchmarkSuite` from jest-bench for clean, Jest-compatible syntax.

## Interpreting Results

jest-bench (powered by benchmark.js) reports results in operations per second (ops/sec):

```
Cache hit                    623 ops/sec   1.60 ms ±  0.42 %  (90 runs sampled)
Cache miss                 4,595 ops/sec  0.218 ms ±  0.28 %  (93 runs sampled)
```

- **ops/sec**: Higher is better (more operations per second = faster)
- **ms**: Time per operation (lower is better)
- **±%**: Margin of error (lower is better = more consistent)
- **runs sampled**: Number of test iterations completed

### Performance Guidelines

- **> 1,000,000 ops/sec**: Excellent (sub-microsecond operations)
- **100,000 - 1,000,000 ops/sec**: Good (single-digit microseconds)
- **10,000 - 100,000 ops/sec**: Acceptable (tens of microseconds)
- **< 10,000 ops/sec**: May need optimization (hundreds of microseconds+)

## Benchmark Files

- **cache-operations.bench.ts**: Benchmarks cache hit/miss performance, cache invalidation, and project source file caching
- **path-resolution.bench.ts**: Benchmarks path manipulation, glob pattern building, and import specifier generation
- **import-updates.bench.ts**: Benchmarks import detection, import path updates, and AST transformations
- **export-management.bench.ts**: Benchmarks export detection, export statement addition/removal, and entrypoint management
- **validation.bench.ts**: Benchmarks relative import detection and validation operations for file moves

## Related Documentation

- [BENCHMARK_RESULTS.md](../../../../../BENCHMARK_RESULTS.md)
- [Performance Optimization Guide](../../../../../docs/performance-optimization.md)
- [End-to-End Performance Tests](../../../../workspace-e2e/src/performance-benchmark.spec.ts)
