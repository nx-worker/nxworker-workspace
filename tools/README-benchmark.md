# Benchmark Tools

This directory contains performance benchmarking utilities and tools for the nxworker-workspace project.

## Contents

- `tinybench-utils.ts` - Jest-compatible benchmark suite wrapper for tinybench
- `benchmark-glob-performance.js` - Standalone glob pattern batching benchmark
- `scripts/` - Build and testing scripts

## benchmarkSuite API

The `benchmarkSuite` function provides a Jest-compatible wrapper for [tinybench](https://github.com/tinylibs/tinybench), outputting results in jest-bench format compatible with [benchmark-action/github-action-benchmark](https://github.com/benchmark-action/github-action-benchmark).

### Basic Usage (Original API)

```typescript
import { benchmarkSuite } from '../../../../../../tools/tinybench-utils';

benchmarkSuite(
  'My Benchmark Suite',
  {
    'Simple benchmark': () => {
      // Benchmark code
    },

    'Benchmark with options': {
      fn: () => {
        // Benchmark code
      },
      fnOptions: {
        beforeAll: () => {
          // Setup before benchmark runs
        },
      },
      warmup: true,
      warmupIterations: 5,
    },
  },
  {
    setupSuite: () => {
      // Run once before all benchmarks
    },
    teardownSuite: () => {
      // Run once after all benchmarks
    },
  },
);
```

### Factory Function API (New)

The factory function API allows you to create a shared scope for benchmarks, avoiding module-level variables and enabling better encapsulation.

#### Suite-Level Factory

Create a shared scope for all benchmarks in the suite:

```typescript
benchmarkSuite('Suite with Factory', () => {
  // Shared scope for all benchmarks - better than module-level variables
  let projectDirectory: string;
  let sharedCache: Map<string, unknown>;

  return {
    benchmarks: {
      'Benchmark 1': () => {
        // Can access projectDirectory and sharedCache
      },

      'Benchmark 2': {
        fn: () => {
          // Can access shared scope
        },
        fnOptions: {
          beforeAll: () => {
            // Setup with access to shared scope
            sharedCache.clear();
          },
        },
      },
    },
    setupSuite: () => {
      projectDirectory = '/tmp/test';
      sharedCache = new Map();
    },
    teardownSuite: () => {
      // Cleanup with access to shared scope
      sharedCache.clear();
    },
  };
});
```

#### Benchmark-Level Factory

Create a private scope for each individual benchmark:

```typescript
benchmarkSuite('Suite with Benchmark Factories', {
  'Factory returning config': () => {
    // Private scope for this benchmark only
    let localCounter = 0;
    let localData: string[] = [];

    return {
      fn: () => {
        localCounter++;
        localData.push('item');
      },
      fnOptions: {
        beforeAll: () => {
          localCounter = 0;
          localData = [];
        },
      },
    };
  },

  'Factory returning function': () => {
    // Even simpler - just return the benchmark function
    let items: number[] = [];

    return () => {
      items.push(Math.random());
      items = items.slice(-100); // Keep last 100
    };
  },

  'Regular benchmark': () => {
    // Still works - backward compatible
  },
});
```

#### Nested Factories

Combine both suite-level and benchmark-level factories:

```typescript
benchmarkSuite('Nested Factories', () => {
  // Suite-level shared state
  let suiteState: { initialized: boolean };

  return {
    benchmarks: {
      'Nested factory benchmark': () => {
        // Benchmark-level private state
        let benchmarkLocal = 0;

        return {
          fn: () => {
            // Access both scopes
            if (suiteState.initialized) {
              benchmarkLocal++;
            }
          },
          fnOptions: {
            beforeAll: () => {
              benchmarkLocal = 0;
            },
          },
        };
      },
    },
    setupSuite: () => {
      suiteState = { initialized: true };
    },
  };
});
```

### Why Use Factory Functions?

1. **Avoid module-level variables** - Better encapsulation and isolation
2. **Clear scope boundaries** - Each factory defines its own closure
3. **Easier testing** - State is contained within the factory
4. **Better IDE support** - TypeScript can infer types within closures
5. **Backward compatible** - Original API still works

### Examples

See the following files for real-world examples:

- `packages/workspace/src/generators/move-file/benchmarks/cache-operations.bench.ts` - Original API
- `packages/workspace/src/generators/move-file/benchmarks/cache-operations-factory.bench.ts` - Suite-level factory
- `packages/workspace/src/generators/move-file/benchmarks/factory-examples.bench.ts` - All factory patterns

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
