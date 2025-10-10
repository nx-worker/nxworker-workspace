# Glob Performance Benchmark Tool

## Overview

This standalone benchmark tool demonstrates the performance improvement from batching glob patterns in the move-file generator.

## Related Tools

- **benchmark-glob-performance.js** - Benchmarks glob pattern batching optimization
- **benchmark-cache-performance.js** - Benchmarks file tree caching optimization

## Glob Pattern Batching Benchmark

### Usage

```bash
node tools/benchmark-glob-performance.js
```

### What It Tests

The benchmark simulates two approaches to glob pattern processing:

1. **BEFORE (Sequential):** Each glob pattern triggers a separate file tree traversal
2. **AFTER (Batched):** All glob patterns are processed in a single file tree traversal

### Test Scenarios

#### Test Case 1: 3 Patterns (Typical)

- Patterns: `api-*.ts`, `service-*.ts`, `util-*.ts`
- Files: 550
- Expected improvement: ~3× faster

#### Test Case 2: 10 Patterns (Heavy)

- Patterns: 10 different glob patterns
- Files: 550
- Expected improvement: ~9× faster

## File Tree Caching Benchmark

### Usage

```bash
node tools/benchmark-cache-performance.js
```

### What It Tests

The benchmark simulates the effect of caching file tree structure during repeated directory visits:

1. **BEFORE (No Cache):** Each directory visit requires a full file tree traversal
2. **AFTER (With Cache):** First visit populates cache, subsequent visits use cached data

### Test Scenarios

#### Test Case 1: 5 Repeated Visits (Typical)

- Scenario: Moving a file that updates imports in 5 different files
- Files: 100
- Expected improvement: ~5× faster

#### Test Case 2: 15 Repeated Visits (Heavy)

- Scenario: Moving multiple files with many cross-references
- Files: 100
- Expected improvement: ~15× faster

#### Test Case 3: 30 Repeated Visits (Stress)

- Scenario: Complex workspace with many interdependencies
- Files: 100
- Expected improvement: ~30× faster

## Sample Output (Glob Batching)

```
╔═══════════════════════════════════════════════════════════════════════╗
║  Glob Pattern Batching Performance Benchmark                         ║
║  Comparing BEFORE vs AFTER optimization                              ║
╚═══════════════════════════════════════════════════════════════════════╝

📊 Test Case 1: 3 Glob Patterns (typical use case)
   Patterns: api-*.ts, service-*.ts, util-*.ts
   Files in workspace: 550

   Running BEFORE optimization (sequential)...
   Running AFTER optimization (batched)...

   Results:
   ├─ BEFORE: 78.25ms (3 tree traversals)
   ├─ AFTER:  27.04ms (1 tree traversal)
   ├─ Files matched: 63
   ├─ Improvement: 65.4% faster
   └─ Speedup: 2.89× faster

...
```

## Sample Output (File Tree Caching)

```
╔═══════════════════════════════════════════════════════════════════════╗
║  File Tree Caching Performance Benchmark                             ║
║  Comparing BEFORE vs AFTER smart caching optimization                ║
╚═══════════════════════════════════════════════════════════════════════╝

📊 Test Case 1: 5 Repeated Directory Visits (typical use case)
   Scenario: Moving a file that updates imports in 5 different files
   Files in project: 100

   Running BEFORE caching (no cache)...
   Running AFTER caching (with cache)...

   Results:
   ├─ BEFORE: 126.14ms (5 tree traversals)
   ├─ AFTER:  25.43ms (1 tree traversal, 4 cache hits)
   ├─ Improvement: 79.8% faster
   └─ Speedup: 4.96× faster

...
```

## How It Works

Both benchmarks:

1. Create a simulated file structure
2. Simulate the overhead of file tree traversal (~25ms per traversal)
3. Run both old and new approaches
4. Measure and compare execution time
5. Report speedup factors and improvements

## Configuration

You can adjust the simulation parameters in the scripts:

```javascript
// In both scripts
const TREE_TRAVERSAL_COST_MS = 25; // Tree traversal cost in milliseconds

// In benchmark-glob-performance.js
const fileCount = 500; // Number of files in the workspace

// In benchmark-cache-performance.js
const fileCount = 100; // Number of files per project
```

## Related Documentation

- [Performance Benchmark Results](../docs/glob-performance-benchmark-results.md)
- [Performance Optimization Guide](../docs/performance-optimization.md)
- [Glob Optimization Details](../GLOB_OPTIMIZATION.md)
- [Smart Caching Documentation](../docs/smart-caching.md)
