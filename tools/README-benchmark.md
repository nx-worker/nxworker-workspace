# Glob Performance Benchmark Tool

## Overview

This standalone benchmark tool demonstrates the performance improvement from batching glob patterns in the move-file generator.

## Usage

```bash
node tools/benchmark-glob-performance.js
```

## What It Tests

The benchmark simulates two approaches to glob pattern processing:

1. **BEFORE (Sequential):** Each glob pattern triggers a separate file tree traversal
2. **AFTER (Batched):** All glob patterns are processed in a single file tree traversal

## Test Scenarios

### Test Case 1: 3 Patterns (Typical)

- Patterns: `api-*.ts`, `service-*.ts`, `util-*.ts`
- Files: 550
- Expected improvement: ~3× faster

### Test Case 2: 10 Patterns (Heavy)

- Patterns: 10 different glob patterns
- Files: 550
- Expected improvement: ~9× faster

## Sample Output

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

## How It Works

The benchmark:

1. Creates a simulated file structure with 550 files
2. Simulates the overhead of file tree traversal (~25ms per traversal)
3. Runs both sequential and batched approaches
4. Measures and compares execution time
5. Reports speedup factors and improvements

## Configuration

You can adjust the simulation parameters in the script:

```javascript
const TREE_TRAVERSAL_COST_MS = 25; // Tree traversal cost in milliseconds
const fileCount = 500; // Number of files in the workspace
```

## Related Documentation

- [Performance Benchmark Results](../docs/glob-performance-benchmark-results.md)
- [Performance Optimization Guide](../docs/performance-optimization.md)
- [Glob Optimization Details](../GLOB_OPTIMIZATION.md)
