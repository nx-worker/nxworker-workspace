# Performance Baselines

Last updated: 2025-10-15

## Overview

This document establishes baseline performance metrics for the move-file generator's modular functions after the Phase 1-9 refactoring.

## Benchmark Results

### Cache Operations

| Operation | Average Time | Notes |
| --- | --- | --- |
| Cache hit | ~0.0001ms | File existence check with warm cache |
| Cache miss | ~0.013ms | First-time file existence check |
| Get source files (cached) | ~0.0001ms | Retrieve cached project source files |
| Update cache | ~0.0002ms | Single cache entry update |

**Environment**: Node.js 22.x, Ubuntu Linux (GitHub Actions runner)

**Analysis**: Cache operations are extremely fast, with warm cache hits measured at < 0.001ms. This validates the effectiveness of caching for file existence checks and project source file lookups.

### Path Resolution

| Operation                  | Average Time | Notes                          |
| -------------------------- | ------------ | ------------------------------ |
| buildFileNames             | ~0.0013ms    | Generate file name variants    |
| buildPatterns (100 files)  | ~0.015ms     | Build glob patterns for batch  |
| getRelativeImportSpecifier | ~0.004ms     | Calculate relative import path |
| toAbsoluteWorkspacePath    | ~0.0006ms    | Normalize path to absolute     |
| removeSourceFileExtension  | ~0.0002ms    | Strip file extension           |

**Analysis**: Path operations are very fast due to being pure string manipulation with no I/O. All operations complete in well under 1ms, with most under 0.01ms.

### Import Updates

| Operation | Average Time | Notes |
| --- | --- | --- |
| Update imports (single file) | ~0.016ms | AST parse + transform |
| Update imports (10 files) | ~0.003ms | Batch import updates |
| AST transformation | ~0.015ms | Complex file with multiple imports |

**Analysis**: Import update operations are remarkably fast due to efficient AST caching and transformation. Even complex files with multiple imports complete in under 0.02ms.

### Export Management

| Operation                  | Average Time | Notes                     |
| -------------------------- | ------------ | ------------------------- |
| Export detection           | ~0.15ms      | Check if file is exported |
| Export addition            | ~0.22ms      | Add export statement      |
| Export removal             | ~0.27ms      | Remove export statement   |
| Bulk operations (20 files) | ~3.3ms       | Add 20 export statements  |

**Analysis**: Export management operations are slightly slower due to file I/O and content parsing, but still very fast. Bulk operations scale linearly as expected.

## Key Findings

1. **Excellent cache performance**: Sub-millisecond cache operations validate the caching strategy
2. **Fast path operations**: Pure string manipulation completes in microseconds
3. **Efficient AST operations**: Import updates benefit from AST caching, completing much faster than expected
4. **Reasonable I/O performance**: Export management operations complete quickly despite file I/O overhead
5. **Linear scaling**: Bulk operations scale linearly with the number of files as expected

## Performance Trends

### Optimization Impact

The Phase 1-9 refactoring focused on maintainability and testability, with performance as a secondary consideration. Key observations:

- **Cache operations**: Excellent performance with sub-millisecond cache hits
- **Path operations**: Very fast due to string manipulation (no I/O)
- **Import updates**: Limited by AST parsing/transformation (inherent complexity)
- **Export management**: Reasonable performance for file I/O operations

### Scaling Characteristics

- **Cache operations**: O(1) with hash-based lookups
- **Path operations**: O(1) or O(n) where n is path length (typically < 100 chars)
- **Import updates**: O(n × m) where n = files, m = imports per file
- **Export management**: O(n) where n = existing exports in entrypoint

## Performance Regression Detection

### Automated Checks

Benchmark tests can be run in CI to detect regressions:

```bash
npx nx test workspace --testPathPattern=benchmarks
```

### Regression Thresholds

A regression is flagged if:

- Cache operations slow by > 50% (e.g., 0.1ms → 0.15ms)
- Path operations slow by > 25% (e.g., 1ms → 1.25ms)
- Import updates slow by > 20% (e.g., 10ms → 12ms)
- Export operations slow by > 20% (e.g., 10ms → 12ms)

### Investigation Process

If regression detected:

1. Identify which benchmark(s) are slower
2. Review recent commits for changes to affected modules
3. Profile the slow function to identify bottleneck
4. Consider optimization or accept trade-off (e.g., for better maintainability)

## Future Optimization Opportunities

Based on benchmark results, potential optimizations:

1. **Import updates**: Consider caching parsed ASTs to avoid re-parsing
2. **Export management**: Batch export operations to reduce file I/O
3. **Path operations**: Memoize frequently-used path calculations
4. **Cache operations**: Consider LRU eviction for memory-constrained environments

## Related Documentation

- [Existing End-to-End Benchmarks](../../../../workspace-e2e/src/performance-benchmark.spec.ts)
- [Glob Performance Benchmark](../../../../../tools/benchmark-glob-performance.js)
- [Performance Results](../../../../../BENCHMARK_RESULTS.md)
- [Lazy Project Graph Results](../../../../../LAZY_PROJECT_GRAPH_PERFORMANCE_RESULTS.md)
