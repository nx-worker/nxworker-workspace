# E2E Benchmarks

This directory contains end-to-end performance benchmarks for the `@nxworker/workspace` plugin generators.

## Overview

These benchmarks measure real-world performance by creating temporary Nx workspaces, installing the plugin, and executing generator commands. Unlike unit benchmarks which measure individual functions, these tests measure complete user workflows.

## Benchmark Files

- **`move-file-performance.bench.ts`**: Core performance benchmarks
  - Small file operations (< 1KB)
  - Medium file operations (~10KB)
  - Large file operations (~50KB)
  - Multiple file operations (10-20 files)
  - Complex import update scenarios

- **`move-file-stress.bench.ts`**: Stress test benchmarks
  - Cross-project moves (10+ projects)
  - Many large files (100+ files)
  - Many intra-project dependencies (50+ imports)
  - Combined stress (15 projects × 30 files = 450 total files)

## Running Benchmarks

```bash
# Run all e2e benchmarks
npx nx e2e-benchmark workspace-e2e

# Run with verbose output
npx nx e2e-benchmark workspace-e2e --verbose
```

## CI Integration

E2E benchmarks run in a separate CI workflow (`.github/workflows/e2e-benchmark.yml`) on:
- macOS latest
- Windows latest
- Ubuntu 24.04 ARM

The workflow:
- Runs on pull requests, pushes to main, and manual triggers
- Stores benchmark results per OS in GitHub cache
- **Fails if performance drops by more than 20%**
- Posts comments on PRs when performance regressions are detected

## Structure

These benchmarks use the same `benchmarkSuite` structure as workspace unit benchmarks:

```typescript
benchmarkSuite(
  'Suite Name',
  {
    'Benchmark 1': () => { /* test code */ },
    'Benchmark 2': () => { /* test code */ },
  },
  {
    setupSuite() { /* setup code */ },
    teardownSuite() { /* cleanup code */ },
    iterations: 10,
    time: 30000,
  }
);
```

## Configuration

- **Jest Config**: `jest-e2e-bench.config.ts` (workspace root)
- **TypeScript Config**: `tsconfig.bench.json` (this directory)
- **Nx Target**: `e2e-benchmark` in `project.json`
- **Nx Defaults**: `nx.json` target defaults

## Performance Expectations

E2E benchmarks are slower than unit benchmarks because they:
1. Create temporary Nx workspaces
2. Install npm dependencies
3. Run actual generator commands
4. Clean up temporary workspaces

Typical execution time: 5-15 minutes per OS.
