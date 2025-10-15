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
# Run all benchmarks (includes both benchmarks and regular tests)
npx nx test workspace --testPathPattern=benchmarks

# Run only benchmark files
npx nx test workspace --testPathPattern='\.bench\.spec\.ts$'

# Run specific benchmark suite
npx nx test workspace --testPathPattern=cache-operations.bench.spec
npx nx test workspace --testPathPattern=path-resolution.bench.spec
npx nx test workspace --testPathPattern=import-updates.bench.spec
npx nx test workspace --testPathPattern=export-management.bench.spec

# Run benchmarks with verbose output
npx nx test workspace --testPathPattern='\.bench\.spec\.ts$' --verbose
```

### CI Integration

The benchmarks use [github-action-benchmark](https://github.com/benchmark-action/github-action-benchmark) for automated regression detection.

#### Regression Detection (Pull Requests)

**Automated**: Benchmark regression detection runs on all pull requests!

The CI system:

1. Runs all benchmark tests using benchmark.js
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

Benchmarks use the [benchmark.js](https://benchmarkjs.com/) library, which provides:

- Statistical analysis with multiple iterations
- Automatic calibration of test duration
- Detection of performance outliers
- Standard deviation and margin of error calculation

Each benchmark file exports a Jest test suite that runs benchmark.js suites.

## Interpreting Results

Benchmark.js reports results in operations per second (ops/sec):

```
Cache hit x 132,000,000 ops/sec ±4.44% (81 runs sampled)
```

- **ops/sec**: Higher is better (more operations per second = faster)
- **±%**: Margin of error (lower is better = more consistent)
- **runs sampled**: Number of test iterations completed

### Performance Guidelines

- **> 1,000,000 ops/sec**: Excellent (sub-microsecond operations)
- **100,000 - 1,000,000 ops/sec**: Good (single-digit microseconds)
- **10,000 - 100,000 ops/sec**: Acceptable (tens of microseconds)
- **< 10,000 ops/sec**: May need optimization (hundreds of microseconds+)

## Benchmark Files

- **cache-operations.bench.spec.ts**: Benchmarks cache hit/miss performance, cache invalidation, and project source file caching
- **path-resolution.bench.spec.ts**: Benchmarks path manipulation, glob pattern building, and import specifier generation
- **import-updates.bench.spec.ts**: Benchmarks import detection, import path updates, and AST transformations
- **export-management.bench.spec.ts**: Benchmarks export detection, export statement addition/removal, and entrypoint management

## Related Documentation

- [BENCHMARK_RESULTS.md](../../../../../BENCHMARK_RESULTS.md)
- [Performance Optimization Guide](../../../../../docs/performance-optimization.md)
- [End-to-End Performance Tests](../../../../workspace-e2e/src/performance-benchmark.spec.ts)
