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

#### Regression Detection (Pull Requests)

**NEW**: Benchmark regression detection runs automatically on all pull requests!

The CI system:

1. Runs all benchmark tests
2. Compares results against stored baselines
3. Fails the PR if regressions exceed thresholds
4. Shows which benchmarks regressed and by how much

**Regression Thresholds:**

- Cache operations: 50% slower
- Path operations: 25% slower
- Import/Export operations: 20% slower

**If a regression is detected:**

```bash
# If the regression is unintentional, fix the code
# If the regression is intentional (e.g., trade-off for maintainability):
npx tsx tools/scripts/capture-benchmark-baselines.ts
git add packages/workspace/src/generators/move-file/benchmarks/baselines.json
git commit -m "perf(workspace): update benchmark baselines"
```

See [Benchmark Regression Detection Guide](../../../../../tools/scripts/README-benchmark-regression.md) for details.

#### Benchmark Runs (Main Branch)

Full benchmarks run on push to `main` and `workflow_dispatch`:

1. **Micro-benchmarks** - Unit-level performance tests
2. **E2E benchmarks** - End-to-end performance tests

These runs validate that benchmarks still pass after merging.

## Benchmark Structure

Each benchmark file follows this pattern:

1. **Setup**: Create test fixtures and data
2. **Warmup**: Run functions once to ensure JIT compilation
3. **Measurement**: Run operations multiple times and measure execution time
4. **Reporting**: Output results with averages and percentiles

## Interpreting Results

- **< 1ms**: Excellent performance for micro-operations
- **1-10ms**: Good performance for moderate operations
- **10-50ms**: Acceptable for complex operations
- **> 50ms**: May need optimization (context-dependent)

## Benchmark Files

- **cache-operations.bench.spec.ts**: Benchmarks cache hit/miss performance, cache invalidation, and project source file caching
- **path-resolution.bench.spec.ts**: Benchmarks path manipulation, glob pattern building, and import specifier generation
- **import-updates.bench.spec.ts**: Benchmarks import detection, import path updates, and AST transformations
- **export-management.bench.spec.ts**: Benchmarks export detection, export statement addition/removal, and entrypoint management

## Related Documentation

- [BENCHMARK_RESULTS.md](../../../../../BENCHMARK_RESULTS.md)
- [Performance Optimization Guide](../../../../../docs/performance-optimization.md)
- [End-to-End Performance Tests](../../../../workspace-e2e/src/performance-benchmark.spec.ts)
