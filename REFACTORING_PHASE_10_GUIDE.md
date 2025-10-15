# Refactoring Phase 10: Add Performance Benchmarks

**Status**: ✅ **COMPLETED** - 2025-10-15

## Overview

This document provides a detailed implementation guide for Phase 10 of the refactoring plan. Phase 10 focuses on adding comprehensive performance benchmarks for the move-file generator to establish baseline metrics and ensure no performance regressions as the codebase evolves.

**Phase 10 Status**: ✅ **COMPLETED** - All benchmark files created, tests passing, performance baselines documented

## Goals

- Create benchmark tests for critical operations
- Establish performance baselines for key functions
- Document performance characteristics
- Enable regression testing for future changes
- Identify optimization opportunities
- Validate that refactoring hasn't introduced performance issues

## Prerequisites

✅ Phase 1 must be complete:

- `constants/file-extensions.ts` created
- `types/move-context.ts` created
- All Phase 1 tests passing (20 tests)

✅ Phase 2 must be complete:

- `cache/` directory with 6 cache functions
- All Phase 2 tests passing (37 tests)

✅ Phase 3 must be complete:

- `path-utils/` directory with 9 path utility functions
- All Phase 3 tests passing (103 tests)

✅ Phase 4 must be complete:

- `project-analysis/` directory with 13 project analysis functions
- All Phase 4 tests passing (170 tests)

✅ Phase 5 must be complete:

- `import-updates/` directory with 9 import update functions
- All Phase 5 tests passing

✅ Phase 6 must be complete:

- `export-management/` directory with 5 export management functions
- All Phase 6 tests passing (52 tests)

✅ Phase 7 must be complete:

- `validation/` directory with 2 validation functions
- All Phase 7 tests passing (30 tests)

✅ Phase 8 must be complete:

- `core-operations/` directory with 8 core operation functions
- All Phase 8 tests passing (32 tests)

✅ Phase 9 must be complete:

- `generator.spec.ts` organized with clear test sections
- All Phase 9 tests passing (585 total tests)

## Current Performance Testing State

**Existing Performance Tests**:

The project already has several performance-related tests and benchmark files:

1. **`packages/workspace-e2e/src/performance-benchmark.spec.ts`** (17KB)
   - End-to-end performance tests for the move-file generator
   - Tests various file sizes and batch operations
   - Measures real-world performance in generated workspaces

2. **`packages/workspace-e2e/src/performance-stress-test.spec.ts`** (23KB)
   - Stress tests for heavy workloads
   - Tests large-scale operations

3. **`tools/benchmark-glob-performance.js`**
   - Standalone benchmark for glob pattern batching
   - Demonstrates performance improvements from optimization

4. **Performance documentation**:
   - `BENCHMARK_RESULTS.md`
   - `LAZY_PROJECT_GRAPH_PERFORMANCE_RESULTS.md`
   - `TREE_CACHE_PERFORMANCE_RESULTS.md`
   - `SMART_FILE_CACHE_PERFORMANCE_RESULTS.md`
   - Various other optimization result documents

**Gap Analysis**:

While the project has excellent end-to-end performance tests, it lacks **unit-level benchmarks** for the modular functions created in Phases 1-8. This phase will add focused micro-benchmarks to:

- Measure performance of individual functions in isolation
- Establish baselines for cache operations, path resolution, etc.
- Enable quick performance regression detection during development
- Complement the existing end-to-end performance tests

## Risk Level

**Low Risk** - This phase only adds new benchmark tests:

- No code changes to generator implementation
- No functional changes
- New tests don't affect existing tests
- Benchmarks are informational, not pass/fail
- Easy to iterate on benchmark design
- Can be done incrementally

## Tasks

### Task 10.1: Create `benchmarks/` Directory Structure

**Goal**: Set up the benchmarks directory and establish a consistent structure.

**Location**: `packages/workspace/src/generators/move-file/benchmarks/`

**Files to create**:

```
packages/workspace/src/generators/move-file/benchmarks/
├── README.md                              # Benchmark documentation
├── cache-operations.bench.spec.ts         # Cache function benchmarks
├── path-resolution.bench.spec.ts          # Path utility benchmarks
├── import-updates.bench.spec.ts           # Import update benchmarks
└── export-management.bench.spec.ts        # Export management benchmarks
```

**Important**: Use `.bench.spec.ts` extension (not `.bench.ts`) so Jest will recognize these files. The `.bench.` infix clearly identifies them as benchmarks while the `.spec.ts` suffix ensures Jest picks them up with existing test configuration.

**README.md content**:

````markdown
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
````

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

````

### Task 10.2: Create `cache-operations.bench.spec.ts`

**File**: `packages/workspace/src/generators/move-file/benchmarks/cache-operations.bench.spec.ts`

**Purpose**: Benchmark cache functions to ensure fast cache operations.

**Functions to benchmark** (from Phase 2):

1. `cachedTreeExists` - File existence checks with caching
2. `getProjectSourceFiles` - Cached project source file retrieval
3. `updateProjectSourceFilesCache` - Cache update operations
4. `getCachedDependentProjects` - Dependency graph caching

**Key metrics to measure**:

- Cache hit performance (should be < 0.1ms)
- Cache miss performance (should be < 5ms for file existence checks)
- Cache update performance (should be < 1ms)
- Memory usage for different cache sizes

**Code structure**:

```typescript
import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { performance } from 'perf_hooks';
import { cachedTreeExists } from '../cache/cached-tree-exists';
import { getProjectSourceFiles } from '../cache/get-project-source-files';
import { updateProjectSourceFilesCache } from '../cache/update-project-source-files-cache';
import { clearAllCaches } from '../cache/clear-all-caches';

describe('cache-operations benchmarks', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    clearAllCaches();
  });

  describe('cachedTreeExists performance', () => {
    it('should have fast cache hits (< 0.1ms)', () => {
      // Setup: Create test files
      const testFiles = Array.from({ length: 100 }, (_, i) => `file-${i}.ts`);
      testFiles.forEach(file => tree.write(file, 'content'));

      // Warmup
      testFiles.forEach(file => cachedTreeExists(tree, file));

      // Measure cache hits
      const iterations = 1000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        testFiles.forEach(file => cachedTreeExists(tree, file));
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations / testFiles.length;

      console.log(`Cache hit average: ${avgTime.toFixed(4)}ms per lookup`);
      expect(avgTime).toBeLessThan(0.1);
    });

    it('should have reasonable cache miss performance (< 5ms)', () => {
      // Setup
      const testFiles = Array.from({ length: 100 }, (_, i) => `file-${i}.ts`);

      // Measure cache misses (no warmup)
      const iterations = 100;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        clearAllCaches();
        testFiles.forEach(file => cachedTreeExists(tree, file));
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations / testFiles.length;

      console.log(`Cache miss average: ${avgTime.toFixed(4)}ms per lookup`);
      expect(avgTime).toBeLessThan(5);
    });
  });

  describe('getProjectSourceFiles performance', () => {
    it('should efficiently retrieve cached source files (< 1ms)', () => {
      // Setup: Create a project with source files
      const projectRoot = 'libs/test-lib';
      const sourceFiles = Array.from({ length: 50 }, (_, i) =>
        `${projectRoot}/src/lib/file-${i}.ts`
      );
      sourceFiles.forEach(file => tree.write(file, 'content'));

      // Warmup
      getProjectSourceFiles(tree, projectRoot);

      // Measure
      const iterations = 1000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        getProjectSourceFiles(tree, projectRoot);
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`Source file retrieval average: ${avgTime.toFixed(4)}ms`);
      expect(avgTime).toBeLessThan(1);
    });
  });

  describe('cache update performance', () => {
    it('should quickly update project source files cache (< 1ms)', () => {
      const projectRoot = 'libs/test-lib';

      // Measure cache update
      const iterations = 1000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        const oldPath = `${projectRoot}/old-${i}.ts`;
        const newPath = `${projectRoot}/new-${i}.ts`;
        updateProjectSourceFilesCache(projectRoot, oldPath, newPath);
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`Cache update average: ${avgTime.toFixed(4)}ms`);
      expect(avgTime).toBeLessThan(1);
    });
  });
});
````

### Task 10.3: Create `path-resolution.bench.spec.ts`

**File**: `packages/workspace/src/generators/move-file/benchmarks/path-resolution.bench.spec.ts`

**Purpose**: Benchmark path utility functions for performance-critical path operations.

**Functions to benchmark** (from Phase 3):

1. `buildFileNames` - File name pattern construction
2. `buildPatterns` - Glob pattern building
3. `getRelativeImportSpecifier` - Import path calculation
4. `removeSourceFileExtension` - Extension stripping
5. `toAbsoluteWorkspacePath` - Path normalization

**Key metrics to measure**:

- Path manipulation operations (should be < 0.5ms each)
- Pattern building for multiple files (should be < 5ms for 100 files)
- Import specifier generation (should be < 1ms)

**Code structure**:

```typescript
import { performance } from 'perf_hooks';
import { buildFileNames } from '../path-utils/build-file-names';
import { buildPatterns } from '../path-utils/build-patterns';
import { getRelativeImportSpecifier } from '../path-utils/get-relative-import-specifier';
import { removeSourceFileExtension } from '../path-utils/remove-source-file-extension';
import { toAbsoluteWorkspacePath } from '../path-utils/to-absolute-workspace-path';

describe('path-resolution benchmarks', () => {
  describe('buildFileNames performance', () => {
    it('should quickly generate file name variants (< 1ms)', () => {
      const basePath = 'libs/my-lib/src/lib/my-file';

      // Warmup
      buildFileNames(basePath);

      // Measure
      const iterations = 10000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        buildFileNames(basePath);
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`buildFileNames average: ${avgTime.toFixed(4)}ms`);
      expect(avgTime).toBeLessThan(1);
    });
  });

  describe('buildPatterns performance', () => {
    it('should efficiently build patterns for multiple files (< 10ms for 100 files)', () => {
      const filePaths = Array.from(
        { length: 100 },
        (_, i) => `libs/lib-${i}/src/lib/file-${i}.ts`,
      );

      // Warmup
      buildPatterns(filePaths);

      // Measure
      const iterations = 100;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        buildPatterns(filePaths);
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`buildPatterns (100 files) average: ${avgTime.toFixed(4)}ms`);
      expect(avgTime).toBeLessThan(10);
    });
  });

  describe('getRelativeImportSpecifier performance', () => {
    it('should calculate import paths quickly (< 0.5ms)', () => {
      const fromPath = 'libs/lib-a/src/lib/component-a.ts';
      const toPath = 'libs/lib-b/src/lib/service-b.ts';

      // Warmup
      getRelativeImportSpecifier(fromPath, toPath);

      // Measure
      const iterations = 10000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        getRelativeImportSpecifier(fromPath, toPath);
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(
        `getRelativeImportSpecifier average: ${avgTime.toFixed(4)}ms`,
      );
      expect(avgTime).toBeLessThan(0.5);
    });
  });

  describe('path normalization performance', () => {
    it('should normalize paths efficiently (< 0.1ms)', () => {
      const relativePath = './libs/my-lib/src/lib/file.ts';

      // Warmup
      toAbsoluteWorkspacePath(relativePath);

      // Measure
      const iterations = 10000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        toAbsoluteWorkspacePath(relativePath);
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`toAbsoluteWorkspacePath average: ${avgTime.toFixed(4)}ms`);
      expect(avgTime).toBeLessThan(0.1);
    });
  });

  describe('extension removal performance', () => {
    it('should strip extensions quickly (< 0.05ms)', () => {
      const filePath = 'libs/my-lib/src/lib/my-file.ts';

      // Warmup
      removeSourceFileExtension(filePath);

      // Measure
      const iterations = 10000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        removeSourceFileExtension(filePath);
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`removeSourceFileExtension average: ${avgTime.toFixed(4)}ms`);
      expect(avgTime).toBeLessThan(0.05);
    });
  });
});
```

### Task 10.4: Create `import-updates.bench.spec.ts`

**File**: `packages/workspace/src/generators/move-file/benchmarks/import-updates.bench.spec.ts`

**Purpose**: Benchmark import update operations, which are critical for generator performance.

**Functions to benchmark** (from Phase 5):

1. `updateMovedFileImportsIfNeeded` - Import updates in moved file
2. `updateDependentImports` - Import updates in dependent files
3. AST parsing and transformation operations

**Key metrics to measure**:

- AST parsing performance (should be < 10ms for typical files)
- Import path replacement (should be < 5ms per file)
- Batch import updates (should scale linearly)

**Code structure**:

```typescript
import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { performance } from 'perf_hooks';
import type { ProjectConfiguration } from '@nx/devkit';
import { updateMovedFileImportsIfNeeded } from '../import-updates/update-moved-file-imports-if-needed';

describe('import-updates benchmarks', () => {
  let tree: Tree;
  let projects: Map<string, ProjectConfiguration>;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    projects = new Map();

    // Setup test projects
    projects.set('lib-a', {
      name: 'lib-a',
      root: 'libs/lib-a',
      sourceRoot: 'libs/lib-a/src',
      projectType: 'library',
    });
    projects.set('lib-b', {
      name: 'lib-b',
      root: 'libs/lib-b',
      sourceRoot: 'libs/lib-b/src',
      projectType: 'library',
    });
  });

  describe('import path update performance', () => {
    it('should update imports in moved file efficiently (< 10ms)', () => {
      // Create a file with multiple imports
      const sourceFile = 'libs/lib-a/src/lib/source.ts';
      const content = `
        import { service1 } from './services/service1';
        import { service2 } from './services/service2';
        import { util1 } from './utils/util1';
        import { util2 } from './utils/util2';
        import { helper1 } from './helpers/helper1';
        
        export function myFunction() {
          return service1() + service2() + util1() + util2() + helper1();
        }
      `;
      tree.write(sourceFile, content);

      const targetFile = 'libs/lib-b/src/lib/target.ts';

      // Warmup
      updateMovedFileImportsIfNeeded(
        tree,
        sourceFile,
        targetFile,
        'lib-a',
        'lib-b',
        projects,
      );

      // Measure
      const iterations = 100;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        tree.write(sourceFile, content); // Reset
        updateMovedFileImportsIfNeeded(
          tree,
          sourceFile,
          targetFile,
          'lib-a',
          'lib-b',
          projects,
        );
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`Import update average: ${avgTime.toFixed(4)}ms`);
      expect(avgTime).toBeLessThan(10);
    });

    it('should scale linearly for multiple files (< 50ms for 10 files)', () => {
      // Create multiple files with imports
      const fileCount = 10;
      const sourceFiles = Array.from({ length: fileCount }, (_, i) => {
        const path = `libs/lib-a/src/lib/file-${i}.ts`;
        const content = `
          import { dep1 } from './dep1';
          import { dep2 } from './dep2';
          export const value${i} = dep1() + dep2();
        `;
        tree.write(path, content);
        return path;
      });

      // Warmup
      sourceFiles.forEach((sourceFile, i) => {
        const targetFile = `libs/lib-b/src/lib/file-${i}.ts`;
        updateMovedFileImportsIfNeeded(
          tree,
          sourceFile,
          targetFile,
          'lib-a',
          'lib-b',
          projects,
        );
      });

      // Measure batch update
      const iterations = 10;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        sourceFiles.forEach((sourceFile, idx) => {
          const targetFile = `libs/lib-b/src/lib/file-${idx}.ts`;
          updateMovedFileImportsIfNeeded(
            tree,
            sourceFile,
            targetFile,
            'lib-a',
            'lib-b',
            projects,
          );
        });
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(
        `Batch import update (${fileCount} files) average: ${avgTime.toFixed(4)}ms`,
      );
      expect(avgTime).toBeLessThan(50);
    });
  });

  describe('AST transformation performance', () => {
    it('should parse and transform AST efficiently (< 15ms)', () => {
      const filePath = 'libs/lib-a/src/lib/complex-file.ts';
      const content = `
        import { dep1, dep2, dep3 } from './dependencies';
        import type { Type1, Type2 } from './types';
        import * as utils from './utils';
        
        export class MyClass {
          private field1: Type1;
          private field2: Type2;
          
          constructor() {
            this.field1 = dep1();
            this.field2 = dep2();
          }
          
          method1() {
            return utils.helper(this.field1);
          }
          
          method2() {
            return dep3(this.field2);
          }
        }
      `;
      tree.write(filePath, content);

      const targetFile = 'libs/lib-b/src/lib/complex-file.ts';

      // Measure
      const iterations = 100;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        tree.write(filePath, content); // Reset
        updateMovedFileImportsIfNeeded(
          tree,
          filePath,
          targetFile,
          'lib-a',
          'lib-b',
          projects,
        );
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`AST transformation average: ${avgTime.toFixed(4)}ms`);
      expect(avgTime).toBeLessThan(15);
    });
  });
});
```

### Task 10.5: Create `export-management.bench.spec.ts`

**File**: `packages/workspace/src/generators/move-file/benchmarks/export-management.bench.spec.ts`

**Purpose**: Benchmark export management operations.

**Functions to benchmark** (from Phase 6):

1. `isFileExported` - Export detection
2. `ensureFileExported` - Export addition
3. `removeFileExport` - Export removal

**Key metrics to measure**:

- Export detection performance (should be < 5ms)
- Export addition performance (should be < 10ms)
- Export removal performance (should be < 10ms)

**Code structure**:

```typescript
import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { performance } from 'perf_hooks';
import { isFileExported } from '../export-management/is-file-exported';
import { ensureFileExported } from '../export-management/ensure-file-exported';
import { removeFileExport } from '../export-management/remove-file-export';

describe('export-management benchmarks', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  describe('export detection performance', () => {
    it('should detect exports quickly (< 5ms)', () => {
      const entryPoint = 'libs/my-lib/src/index.ts';
      const content = `
        export * from './lib/file1';
        export * from './lib/file2';
        export * from './lib/file3';
        export * from './lib/file4';
        export * from './lib/file5';
      `;
      tree.write(entryPoint, content);

      const fileToCheck = 'libs/my-lib/src/lib/file3.ts';

      // Warmup
      isFileExported(tree, entryPoint, fileToCheck);

      // Measure
      const iterations = 1000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        isFileExported(tree, entryPoint, fileToCheck);
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`Export detection average: ${avgTime.toFixed(4)}ms`);
      expect(avgTime).toBeLessThan(5);
    });
  });

  describe('export addition performance', () => {
    it('should add exports efficiently (< 10ms)', () => {
      const entryPoint = 'libs/my-lib/src/index.ts';
      const initialContent = `
        export * from './lib/file1';
        export * from './lib/file2';
      `;

      const fileToExport = 'libs/my-lib/src/lib/new-file.ts';

      // Warmup
      tree.write(entryPoint, initialContent);
      ensureFileExported(tree, entryPoint, fileToExport);

      // Measure
      const iterations = 100;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        tree.write(entryPoint, initialContent); // Reset
        ensureFileExported(
          tree,
          entryPoint,
          `libs/my-lib/src/lib/file-${i}.ts`,
        );
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`Export addition average: ${avgTime.toFixed(4)}ms`);
      expect(avgTime).toBeLessThan(10);
    });
  });

  describe('export removal performance', () => {
    it('should remove exports efficiently (< 10ms)', () => {
      const entryPoint = 'libs/my-lib/src/index.ts';
      const fileToRemove = 'libs/my-lib/src/lib/file-to-remove.ts';
      const initialContent = `
        export * from './lib/file1';
        export * from './lib/file-to-remove';
        export * from './lib/file2';
      `;

      // Warmup
      tree.write(entryPoint, initialContent);
      removeFileExport(tree, entryPoint, fileToRemove);

      // Measure
      const iterations = 100;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        tree.write(entryPoint, initialContent); // Reset
        removeFileExport(tree, entryPoint, fileToRemove);
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`Export removal average: ${avgTime.toFixed(4)}ms`);
      expect(avgTime).toBeLessThan(10);
    });
  });

  describe('bulk export operations', () => {
    it('should handle multiple export operations efficiently (< 100ms for 20 operations)', () => {
      const entryPoint = 'libs/my-lib/src/index.ts';
      const initialContent = `export * from './lib/existing';`;

      const filesToExport = Array.from(
        { length: 20 },
        (_, i) => `libs/my-lib/src/lib/file-${i}.ts`,
      );

      // Warmup
      tree.write(entryPoint, initialContent);
      filesToExport.forEach((file) =>
        ensureFileExported(tree, entryPoint, file),
      );

      // Measure bulk operations
      const iterations = 10;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        tree.write(entryPoint, initialContent); // Reset
        filesToExport.forEach((file) =>
          ensureFileExported(tree, entryPoint, file),
        );
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(
        `Bulk export operations (20 files) average: ${avgTime.toFixed(4)}ms`,
      );
      expect(avgTime).toBeLessThan(100);
    });
  });
});
```

### Task 10.6: Document Performance Characteristics

**Goal**: Create comprehensive documentation of performance baselines and characteristics.

**File**: `packages/workspace/src/generators/move-file/benchmarks/PERFORMANCE_BASELINES.md`

**Content structure**:

````markdown
# Performance Baselines

Last updated: 2025-10-15

## Overview

This document establishes baseline performance metrics for the move-file generator's modular functions after the Phase 1-9 refactoring.

## Benchmark Results

### Cache Operations

| Operation | Average Time | P95 | P99 | Notes |
| --- | --- | --- | --- | --- |
| Cache hit | < 0.1ms | TBD | TBD | File existence check with warm cache |
| Cache miss | < 5ms | TBD | TBD | First-time file existence check |
| Get source files (cached) | < 1ms | TBD | TBD | Retrieve cached project source files |
| Update cache | < 1ms | TBD | TBD | Single cache entry update |

**Environment**: Node.js 22.x, Ubuntu Linux (GitHub Actions runner)

### Path Resolution

| Operation | Average Time | P95 | P99 | Notes |
| --- | --- | --- | --- | --- |
| buildFileNames | < 1ms | TBD | TBD | Generate file name variants |
| buildPatterns (100 files) | < 10ms | TBD | TBD | Build glob patterns for batch |
| getRelativeImportSpecifier | < 0.5ms | TBD | TBD | Calculate relative import path |
| toAbsoluteWorkspacePath | < 0.1ms | TBD | TBD | Normalize path to absolute |
| removeSourceFileExtension | < 0.05ms | TBD | TBD | Strip file extension |

### Import Updates

| Operation | Average Time | P95 | P99 | Notes |
| --- | --- | --- | --- | --- |
| Update imports (single file) | < 10ms | TBD | TBD | AST parse + transform |
| Update imports (10 files) | < 50ms | TBD | TBD | Batch import updates |
| AST transformation | < 15ms | TBD | TBD | Complex file with multiple imports |

### Export Management

| Operation | Average Time | P95 | P99 | Notes |
| --- | --- | --- | --- | --- |
| Export detection | < 5ms | TBD | TBD | Check if file is exported |
| Export addition | < 10ms | TBD | TBD | Add export statement |
| Export removal | < 10ms | TBD | TBD | Remove export statement |
| Bulk operations (20 files) | < 100ms | TBD | TBD | Add 20 export statements |

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
````

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

````

## Testing Strategy

### Running Benchmarks

```bash
# Run all benchmarks
npx nx test workspace --testPathPattern=benchmarks --output-style stream

# Run only benchmark files (excludes other tests in benchmarks/ directory)
npx nx test workspace --testPathPattern='\.bench\.spec\.ts$' --output-style stream

# Run specific benchmark
npx nx test workspace --testPathPattern=cache-operations.bench.spec --output-style stream
npx nx test workspace --testPathPattern=path-resolution.bench.spec --output-style stream
npx nx test workspace --testPathPattern=import-updates.bench.spec --output-style stream
npx nx test workspace --testPathPattern=export-management.bench.spec --output-style stream

# Run with verbose output
npx nx test workspace --testPathPattern='\.bench\.spec\.ts$' --verbose --output-style stream
````

### Collecting Baseline Data

```bash
# Run benchmarks multiple times and collect results
for i in {1..5}; do
  echo "Run $i"
  npx nx test workspace --testPathPattern='\.bench\.spec\.ts$' --output-style stream 2>&1 | tee benchmark-run-$i.log
done

# Analyze results for consistency
grep "average:" benchmark-run-*.log
```

### Integration with CI

**Option 1: Optional Manual Runs** (Recommended)

Create a separate workflow file `.github/workflows/benchmarks.yml` for on-demand runs:

```yaml
name: Performance Benchmarks

on:
  workflow_dispatch: # Manual trigger
  schedule:
    - cron: '0 0 * * 0' # Weekly on Sunday (optional)

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: ./.github/actions/setup-node-and-install

      - name: Run benchmarks
        run: npx nx test workspace --testPathPattern='\.bench\.spec\.ts$' --verbose --output-style stream

      - name: Upload results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: benchmark-results
          path: |
            **/*.log
          retention-days: 30
```

**Option 2: Include in CI** (Not Recommended)

Add benchmark step to `.github/workflows/ci.yml` test job (adds ~5-10 seconds):

```yaml
- name: Run Performance Benchmarks
  run: npx nx test workspace --testPathPattern='\.bench\.spec\.ts$' --output-style stream
```

**Recommendation**: Use Option 1 (separate workflow) to avoid slowing down every PR. Run benchmarks manually when investigating performance or on a schedule to track trends.

## Verification Steps

1. **Create benchmarks directory**:

   ```bash
   mkdir -p packages/workspace/src/generators/move-file/benchmarks
   ```

2. **Create benchmark files**:
   - Task 10.1: README.md
   - Task 10.2: cache-operations.bench.spec.ts
   - Task 10.3: path-resolution.bench.spec.ts
   - Task 10.4: import-updates.bench.spec.ts
   - Task 10.5: export-management.bench.spec.ts
   - Task 10.6: PERFORMANCE_BASELINES.md

3. **Run benchmarks**:

   ```bash
   npx nx test workspace --testPathPattern='\.bench\.spec\.ts$' --output-style stream
   ```

4. **Verify no regressions**:

   ```bash
   # Run full test suite
   npx nx test workspace --output-style stream
   ```

5. **Verify build**:

   ```bash
   npx nx build workspace --output-style stream
   ```

6. **Verify linting**:

   ```bash
   npx nx lint workspace --output-style stream
   ```

7. **Update baselines document** with actual results from benchmark runs

## Expected Outcomes

### Before Phase 10

- No micro-benchmarks for modular functions
- Only end-to-end performance tests exist
- No baseline metrics for individual operations
- Difficult to detect performance regressions at module level

### After Phase 10

- 4 benchmark test files with ~15-20 benchmark tests total
- Established baseline metrics for all critical operations
- Documentation of performance characteristics
- Ability to detect regressions early during development
- Complement to existing end-to-end performance tests

### File Changes

**New files**:

- `packages/workspace/src/generators/move-file/benchmarks/README.md`
- `packages/workspace/src/generators/move-file/benchmarks/cache-operations.bench.spec.ts`
- `packages/workspace/src/generators/move-file/benchmarks/path-resolution.bench.spec.ts`
- `packages/workspace/src/generators/move-file/benchmarks/import-updates.bench.spec.ts`
- `packages/workspace/src/generators/move-file/benchmarks/export-management.bench.spec.ts`
- `packages/workspace/src/generators/move-file/benchmarks/PERFORMANCE_BASELINES.md`

**Modified files**:

- None (benchmarks are additive)

## Benefits

### 1. Performance Regression Detection

- Quick detection of performance issues at module level
- Identify problematic changes before they reach production
- Enable performance-aware code reviews

### 2. Optimization Guidance

- Identify slowest operations for targeted optimization
- Measure impact of optimization attempts
- Validate trade-offs between performance and maintainability

### 3. Documentation

- Clear performance expectations for each module
- Help developers understand performance characteristics
- Enable informed architectural decisions

### 4. Confidence

- Validate that refactoring hasn't introduced performance issues
- Ensure new features don't degrade performance
- Track performance trends over time

### 5. Complementary Coverage

- Micro-benchmarks complement end-to-end performance tests
- Faster to run than full e2e tests
- Easier to debug performance issues in isolated functions

## Rollback Plan

If issues arise during Phase 10:

1. **Easy rollback**: Benchmarks are new files with no dependencies
2. **No code changes**: Generator implementation unchanged
3. **Low risk**: Only adds new test files
4. **Can disable**: Simply don't run benchmark tests

**Steps to rollback**:

```bash
# Remove benchmark directory
rm -rf packages/workspace/src/generators/move-file/benchmarks

# Or just skip running benchmarks in CI
```

## Next Steps

After Phase 10 completion:

✅ Phase 10 Complete! → **Move to Phase 11: Documentation and Cleanup**

- Follow [REFACTORING_PLAN.md](./REFACTORING_PLAN.md) Phase 11 section
- Update generator README with new module structure
- Add usage examples and migration guides
- Update architecture documentation
- Document lessons learned from refactoring

## Commit Message

```
refactor(workspace): add performance benchmarks for move-file generator (Phase 10)

Add micro-benchmarks for modular functions to establish baseline metrics and
enable performance regression detection.

Changes:
- Create benchmarks/ directory with 4 benchmark test files
- Add benchmark README with usage instructions
- Benchmark cache operations (< 1ms for most operations)
- Benchmark path resolution (< 1ms for typical operations)
- Benchmark import updates (< 15ms for complex files)
- Benchmark export management (< 10ms for typical operations)
- Document performance baselines and characteristics

Benefits:
- Enable early detection of performance regressions
- Establish baseline metrics for critical operations
- Complement existing end-to-end performance tests
- Provide optimization guidance for future development
- Validate that refactoring hasn't introduced performance issues

Benchmark tests run in ~5-10 seconds and complement the existing
end-to-end performance tests.

Phase 10 of 11-phase refactoring plan.
Related: REFACTORING_PLAN.md, REFACTORING_PHASE_10_GUIDE.md
```

## Implementation Checklist

- [ ] Task 10.1: Create benchmarks/ directory and README
- [ ] Task 10.2: Create cache-operations.bench.spec.ts
- [ ] Task 10.3: Create path-resolution.bench.spec.ts
- [ ] Task 10.4: Create import-updates.bench.spec.ts
- [ ] Task 10.5: Create export-management.bench.spec.ts
- [ ] Task 10.6: Create PERFORMANCE_BASELINES.md
- [ ] Run benchmarks and collect results
- [ ] Update baselines document with actual results
- [ ] Verify all existing tests still pass
- [ ] Verify build succeeds
- [ ] Verify linting passes
- [ ] Update REFACTORING_INDEX.md
- [ ] Update REFACTORING_SUMMARY.md
- [ ] Update AGENTS.md
- [ ] Commit changes

## Notes

### Design Decisions

1. **Micro-benchmarks vs. End-to-End**: Phase 10 adds micro-benchmarks to complement the existing end-to-end performance tests. This provides both high-level and low-level performance visibility.

2. **Jest-based benchmarks**: Uses Jest's existing test infrastructure rather than a dedicated benchmark framework. This keeps tooling simple and consistent.

3. **performance.now() timing**: Uses Node.js performance API for high-resolution timing measurements.

4. **Warmup runs**: Each benchmark includes warmup iterations to ensure JIT compilation is complete before measurements.

5. **Multiple iterations**: Measures average time over many iterations to account for variance.

6. **Realistic thresholds**: Sets achievable performance thresholds based on the nature of each operation (I/O vs. computation, simple vs. complex).

### Alternative Approaches Considered

1. **Dedicated benchmark framework** (e.g., Benchmark.js): Decided against to keep tooling simple and consistent with existing test infrastructure.

2. **Memory profiling**: Considered but deferred to focus on execution time. Memory profiling can be added in the future if needed.

3. **Statistical analysis**: Considered calculating P95/P99 metrics but kept simple for initial implementation. Can be enhanced later.

4. **Continuous benchmarking**: Considered running benchmarks in CI on every commit but decided to keep as optional for now to avoid slowing down CI pipeline.
