# Benchmark Tools

This directory contains performance benchmarking utilities and tools for the nxworker-workspace project.

## Contents

- `tinybench-utils.ts` - Jest-like benchmark API wrapper for tinybench
- `tinybench-utils-state.ts` - Internal state management for benchmark API
- `benchmark-glob-performance.js` - Standalone glob pattern batching benchmark
- `scripts/` - Build and testing scripts

## Jest-Like Benchmark API

The benchmark API provides a Jest-like interface using `describe()` and `it()` patterns, wrapping [tinybench](https://github.com/tinylibs/tinybench) and outputting results in jest-bench format compatible with [benchmark-action/github-action-benchmark](https://github.com/benchmark-action/github-action-benchmark).

All functions (`describe`, `it`, `beforeAll`, `afterAll`, `beforeAllIterations`, `afterAllIterations`, `beforeEachIteration`, `afterEachIteration`, `setupTask`, `teardownTask`) must be imported from `tools/tinybench-utils` - they are not globals.

### Basic Usage

```typescript
import { describe, it } from '../../../../../../tools/tinybench-utils';

describe('My Benchmark Suite', () => {
  it('should perform simple operation', () => {
    // Benchmark code runs many iterations
    doWork();
  });
});
```

### Using Hooks

The API provides comprehensive hook support for setup and teardown operations:

```typescript
import {
  describe,
  it,
  beforeAll,
  afterAll,
  beforeAllIterations,
  afterAllIterations,
  beforeEachIteration,
  afterEachIteration,
  setupTask,
  teardownTask,
} from '../../../../../../tools/tinybench-utils';

describe('Benchmark Suite with Hooks', () => {
  let suiteData;

  // Suite-level hooks (run once per describe block, Jest context)
  beforeAll(() => {
    // Runs once before all benchmarks in this describe block
    suiteData = initializeSuiteData();
  });

  afterAll(() => {
    // Runs once after all benchmarks in this describe block
    cleanupSuiteData(suiteData);
  });

  describe('Individual Benchmark', () => {
    let benchmarkData;

    // Task-level setup/teardown (BenchOptions, per task/cycle)
    setupTask(() => {
      // Runs before each warmup and run cycle
      benchmarkData = initializeBenchmark();
    });

    teardownTask(() => {
      // Runs after each warmup and run cycle
      cleanupBenchmark(benchmarkData);
    });

    // Iteration group hooks (fnOptions, per cycle)
    beforeAllIterations(() => {
      // Runs once before each cycle (warmup and run)
      prepareBenchmark();
    });

    afterAllIterations(() => {
      // Runs once after each cycle completes
      finalizeBenchmark();
    });

    beforeEachIteration(() => {
      // Runs before each iteration (all iterations)
      resetIterationState();
    });

    afterEachIteration(() => {
      // Runs after each iteration (all iterations)
      cleanupIterationState();
    });

    it('should perform operation', () => {
      // This runs many times per cycle
      doWork();
    });
  });
});
```

### Hook Execution Order

Hooks execute in this order for each benchmark:

1. **Suite level (Jest context)** - runs once per describe block:
   - `beforeAll` - runs once before all benchmarks

2. **Per benchmark** - runs for each `it()`:
   - `setupTask` - runs before warmup cycle
   - `beforeAllIterations` - runs once before warmup iterations
   - warmup iterations (with `beforeEachIteration`/`afterEachIteration`)
   - `afterAllIterations` - runs once after warmup
   - `teardownTask` - runs after warmup
   - `setupTask` - runs before run cycle
   - `beforeAllIterations` - runs once before run iterations
   - run iterations (with `beforeEachIteration`/`afterEachIteration`)
   - `afterAllIterations` - runs once after run
   - `teardownTask` - runs after run

3. **Suite level (Jest context)** - runs once per describe block:
   - `afterAll` - runs once after all benchmarks

**Execution Frequency**:

- Suite hooks (`beforeAll`/`afterAll`): 1× per describe block
- Task hooks (`setupTask`/`teardownTask`): 2× per benchmark (once for warmup, once for run)
- Iteration group hooks (`beforeAllIterations`/`afterAllIterations`): 2× per benchmark (once per cycle)
- Iteration hooks (`beforeEachIteration`/`afterEachIteration`): ~1000× per benchmark (all iterations)

**Important**: `setupTask` runs **before** `beforeAllIterations`. Any initialization that other hooks depend on must be in `setupTask`, not `beforeAllIterations`.

### Nested Describe Blocks

Each inner `describe` block creates its own Bench instance and inherits hooks from parent blocks:

```typescript
describe('Parent Suite', () => {
  let sharedState;

  beforeAll(() => {
    sharedState = initializeShared();
  });

  describe('Child Suite 1', () => {
    it('benchmark 1', () => {
      // Can access sharedState
      useShared(sharedState);
    });
  });

  describe('Child Suite 2', () => {
    let localState;

    beforeAllIterations(() => {
      localState = initializeLocal();
    });

    it('benchmark 2', () => {
      // Can access both sharedState and localState
      useShared(sharedState);
      useLocal(localState);
    });
  });
});
```

### Benchmark Options

Pass options to `describe()` or `it()`:

```typescript
// Suppress performance warnings for this suite
describe(
  'Quiet Suite',
  () => {
    // benchmarks...
  },
  { quiet: true },
);

// Configure benchmark parameters
it(
  'benchmark with options',
  () => {
    doWork();
  },
  {
    iterations: 1000,
    warmup: true,
    warmupIterations: 10,
    itTimeout: 60000, // Jest timeout for this benchmark
  },
);
```

### Performance Monitoring

The API automatically monitors hook performance:

- Warns when `beforeEachIteration` hooks take >10ms (indicates expensive operations that should be in `setupTask`)
- Provides detailed timing information in output

### Hook Validation

The API includes comprehensive validation to prevent common mistakes:

- **Prevents hooks inside `it()` callbacks** - Hooks must be called in describe block scope
- **Prevents hooks outside `describe()` blocks** - All hooks must be within a describe
- **Prevents nested `it()` calls** - Can't call `it()` inside another `it()` callback
- **Clear error messages** - Validation errors explain what went wrong and how to fix it

### Key Features

1. **Familiar Jest-like API** - Uses `describe()` and `it()` patterns developers already know
2. **Exported functions** - All functions must be imported (not globals) to avoid confusion with Jest test functions
3. **Nested describes** - Each inner `describe` creates its own Bench instance with inherited hooks
4. **Comprehensive hooks** - 8 different hooks for fine-grained control of benchmark lifecycle
5. **Hook inheritance** - Child describe blocks inherit hooks from parents
6. **Performance optimizations** - One Bench instance per describe (not per `it`), ~3.5% faster
7. **Hook validation** - Prevents incorrect hook usage with clear error messages
8. **Options support** - Configure iterations, warmup, timeouts, and quiet mode
9. **Performance monitoring** - Warns about expensive operations in the wrong hooks

### Real-World Examples

See the following files for complete examples:

- `packages/workspace/src/generators/move-file/benchmarks/path-resolution.bench.ts` - Simple benchmarks with minimal hooks (5 benchmarks)
- `packages/workspace/src/generators/move-file/benchmarks/cache-operations.bench.ts` - Suite-level shared state with beforeEach for isolation (4 benchmarks)
- `packages/workspace/src/generators/move-file/benchmarks/export-management.bench.ts` - Suite-level setup with per-benchmark beforeAll hooks (4 benchmarks)
- `packages/workspace/src/generators/move-file/benchmarks/import-updates.bench.ts` - Complex hook execution order example (3 benchmarks)
- `packages/workspace/src/generators/move-file/benchmarks/validation.bench.ts` - Per-benchmark setup with beforeAll (4 benchmarks)

**Total: 20 benchmarks across 5 files**

## Glob Performance Benchmark Tool

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
