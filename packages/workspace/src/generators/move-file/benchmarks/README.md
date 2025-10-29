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

1. Runs all benchmark tests using tinybench via Jest
2. Parses benchmark results (ops/sec) in benchmark.js format
3. **Always compares against the last successful benchmark from `main` branch**
4. Fails the PR if regressions exceed 130% threshold (30% degradation)
5. Posts a comment showing which benchmarks regressed
6. Provides a job summary with visual comparison

**Important:** Benchmarks always compare against the `main` branch baseline, not against previous commits on the PR branch. This ensures cumulative performance regressions across multiple commits are detected.

#### Benchmark Tracking (Main Branch)

On pushes to `main`:

1. Runs all benchmarks
2. Stores results in external JSON file (`benchmarks/workspace/benchmark.json`)
3. Updates the main branch baseline for future PR comparisons
4. Fails on any regression exceeding 115% threshold to prevent degradation on main

**If a regression is detected:**

The github-action-benchmark will automatically:

- Post a comment on the PR with details
- Show the benchmark comparison in the job summary
- Fail the CI check

**To accept a performance degradation:**

If you need to accept a performance regression (e.g., trading performance for correctness, maintainability, or new features):

1. Add the `override-benchmark-threshold` label to your PR
2. Document the trade-off in the PR description
3. The benchmark check will still run and comment, but won't fail the PR
4. Reviewers can see the impact and approve the change
5. The new baseline will be established when merged to `main`

**Note:** This label only works for PRs. Pushes to `main` will always fail on regression to prevent degradation from sneaking into the main branch.

## Benchmark Implementation

Benchmarks use the [tinybench](https://www.npmjs.com/package/tinybench) library ([API reference](https://tinylibs.github.io/tinybench/)), which provides:

- Jest-like API with `describe()` and `it()` functions
- Fast and accurate benchmarking with statistical rigor
- Multiple iterations with automatic warmup
- Standard deviation and margin of error calculation
- Standard ops/sec reporting compatible with github-action-benchmark

Each benchmark file uses the Jest-like API from `tools/tinybench-utils` with familiar `describe()` and `it()` syntax.

## Interpreting Results

tinybench reports results in operations per second (ops/sec) in benchmark.js format:

```
Cache hit x 623 ops/sec ±0.42% (90 runs sampled)
Cache miss x 4,595 ops/sec ±0.28% (93 runs sampled)
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

- **cache-operations.bench.ts**: Benchmarks cache hit/miss performance, cache invalidation, and project source file caching
- **path-resolution.bench.ts**: Benchmarks path manipulation, glob pattern building, and import specifier generation
- **import-updates.bench.ts**: Benchmarks import detection, import path updates, and AST transformations
- **export-management.bench.ts**: Benchmarks export detection, export statement addition/removal, and entrypoint management
- **validation.bench.ts**: Benchmarks relative import detection and validation operations for file moves

## Related Documentation

- [BENCHMARK_RESULTS.md](../../../../../BENCHMARK_RESULTS.md)
- [Performance Optimization Guide](../../../../../docs/performance-optimization.md)
- [End-to-End Performance Tests](../../../../workspace-e2e/src/performance-benchmark.spec.ts)
