# Parallel File Scanning Benchmark

## Overview

This benchmark demonstrates the conceptual benefits and limitations of parallel file scanning in Node.js for the move-file generator.

## What It Tests

The benchmark simulates scanning files for import statements, comparing:

1. **SEQUENTIAL**: Check files one at a time
2. **PARALLEL**: Check files in batches using Promise.all

## Test Scenarios

### Test Case 1: Import Found Late (File #45 of 50)

- **Sequential**: Must check 45 files (3ms each = 135ms)
- **Parallel**: Checks 5 batches of 10 (30ms per batch = 150ms)
- **Result**: Sequential slightly faster (less overhead)

### Test Case 2: No Imports Found (All 100 Files)

- **Sequential**: Must check all 100 files (300ms)
- **Parallel**: Checks 10 batches of 10 (300ms)
- **Result**: Similar performance (synchronous operations)

### Test Case 3: Import Found Early (File #5 of 100)

- **Sequential**: Only needs to check 5 files (15ms)
- **Parallel**: Must check entire first batch of 10 (30ms)
- **Result**: Sequential faster (early exit benefit)

## Key Insights

### Node.js Single-Threaded Nature

JavaScript operations are CPU-bound and run sequentially even with Promise.all:

```javascript
// This does NOT run in parallel for CPU-bound work:
const results = await Promise.all(
  files.map((file) => checkForImports(file)), // Still sequential!
);
```

### When Parallel Helps

Parallel processing (Promise.all) is beneficial for:

- **I/O operations** (network requests, file system in async mode)
- **Async operations** (setTimeout, setInterval)
- **Worker threads** (true parallelism for CPU-bound work)

### When Parallel Doesn't Help

Parallel processing does NOT help for:

- **Synchronous operations** (tree.read(), jscodeshift parsing)
- **CPU-bound calculations** (AST traversal, pattern matching)
- **Single-threaded operations** (most JavaScript code)

## Real-World Application

In the move-file generator:

### ✅ Good Parallelization Candidates (with Worker Threads)

- Scanning 1000+ files for imports
- Parsing multiple large AST trees
- Checking imports across many projects

### ❌ Not Worth Parallelizing (Current Implementation)

- Tree write operations (not thread-safe)
- Sequential file operations (tree.read is synchronous)
- Operations with early-exit optimization

## Usage

```bash
node tools/benchmark-parallel-scanning.js
```

## Results Interpretation

The benchmark shows that:

1. **Parallel overhead** can outweigh benefits for small batches
2. **Early exit** is more important than parallelization
3. **True parallelism** requires worker threads, not just Promises

## Future Work

To achieve true parallel performance:

1. **Use Worker Threads**:

   ```javascript
   const { Worker } = require('worker_threads');
   // Process files in separate threads
   ```

2. **Batch and Aggregate**:

   ```javascript
   // Collect all changes
   const changes = await processFilesInWorkers(files);
   // Apply changes sequentially
   changes.forEach(change => tree.write(...));
   ```

3. **Async Tree Operations**:
   - If Nx provides async Tree API in future
   - Would enable true I/O parallelism

## Related Documentation

- [Parallelization Analysis](../PARALLELIZATION_ANALYSIS.md)
- [Performance Optimization](../docs/performance-optimization.md)
- [Glob Performance Benchmark](./README-benchmark.md)
