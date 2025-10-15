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

Benchmarks are **optional** and not required for CI to pass. They can be run:

1. **Manually** - Run locally during development or when investigating performance
2. **On-demand** - Trigger via workflow_dispatch on a dedicated benchmark workflow
3. **Scheduled** - Run weekly/monthly to track performance trends over time

**Not recommended** for every PR/commit as they:

- Add ~5-10 seconds to test execution time
- Results can vary based on runner load
- Are informational rather than pass/fail checks

### Example: Optional Benchmark Workflow

You can create `.github/workflows/benchmarks.yml` for on-demand benchmark runs:

```yaml
name: Benchmarks

on:
  workflow_dispatch:
  schedule:
    - cron: '0 0 * * 0' # Weekly on Sunday

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: ./.github/actions/setup-node-and-install
      - name: Run benchmarks
        run: npx nx test workspace --testPathPattern='\.bench\.spec\.ts$' --verbose
      - name: Upload results
        if: always()
        run: echo "Store results in artifacts or comment on commit"
```

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
