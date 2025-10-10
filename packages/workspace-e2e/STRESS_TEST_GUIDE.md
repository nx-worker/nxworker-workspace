# Performance Stress Test Documentation

## Overview

The performance stress tests validate that the jscodeshift AST-based codemod optimizations deliver measurable performance benefits in realistic, large-scale scenarios. These tests complement the existing performance benchmarks by focusing on **stress conditions** that highlight the optimization benefits.

## Test File Location

- **File:** `packages/workspace-e2e/src/performance-stress-test.spec.ts`
- **Test Suite:** `move-file generator stress tests (performance validation)`

## Optimizations Being Validated

The stress tests validate three key optimizations implemented in the jscodeshift utilities:

### 1. Parser Instance Reuse

- **Optimization:** Create parser instance once at module level, reuse for all operations
- **Benefit:** Eliminates parser instantiation overhead (expensive operation)
- **Validation:** Tests with many files demonstrate cumulative time savings

### 2. Early Exit with String Checks

- **Optimization:** Quick string search before expensive AST parsing
- **Benefit:** Avoids parsing files that don't contain target specifiers
- **Validation:** Tests with many files without imports show dramatic speedup

### 3. Single-Pass AST Traversal

- **Optimization:** Visit each AST node once instead of 5-6 separate traversals
- **Benefit:** Reduces traversal overhead for large files
- **Validation:** Tests with large files and complex import patterns show reduced processing time

## Test Scenarios

### 1. Many Projects with Cross-Project Dependencies

**Test:** `should efficiently move files across workspace with 10+ projects`

- **Setup:**
  - 10 projects
  - 1 shared utility file
  - 9 projects depend on the shared utility (cross-project dependencies)

- **Operation:** Move shared utility from first project to last project

- **Validates:**
  - Parser reuse across all projects
  - Import updates across multiple projects
  - Cross-project dependency resolution

- **Expected Performance:** < 2 minutes

### 2. Many Large Files

**Test:** `should efficiently process workspace with 100+ large files`

- **Setup:**
  - 100+ large files (~10KB each, ~1MB total)
  - Only 10% of files import the target file
  - 90% of files are irrelevant (early exit candidates)

- **Operation:** Move target file between projects

- **Validates:**
  - Early exit optimization on 90 files
  - Parser reuse on 100+ files
  - AST parsing only when necessary

- **Expected Performance:** < 3 minutes
- **Key Metric:** ~90 files skipped via early exit (logged in output)

### 3. Many Intra-Project Dependencies

**Test:** `should efficiently update many relative imports within a project`

- **Setup:**
  - 50 files with relative imports to a single utility
  - Deep directory structure (`./utils/deep-util.ts`)

- **Operation:** Move utility to different directory (requires updating all relative imports)

- **Validates:**
  - Single-pass traversal efficiency
  - Relative import path updates
  - Intra-project dependency handling

- **Expected Performance:** < 2 minutes

### 4. Combined Stress: Many Projects + Many Files + Many Dependencies

**Test:** `should handle realistic large workspace scenario`

- **Setup:**
  - 15 projects
  - 30 files per project (450 total files)
  - Cross-project dependencies (all projects depend on core library)
  - ~1.125MB total code

- **Operation:** Move core library file (affects all projects)

- **Validates:**
  - All optimizations working together
  - Real-world workspace scale
  - Combined benefits of parser reuse, early exit, and single-pass

- **Expected Performance:** < 4 minutes

- **Optimization Summary Logged:**
  - Parser reuse eliminations
  - Early exit file count
  - Saved AST traversals

## Running the Tests

### Run All Stress Tests

```powershell
npx nx e2e workspace-e2e --testPathPattern=performance-stress-test
```

### Run Specific Stress Test

```powershell
# Many projects test
npx nx e2e workspace-e2e --testPathPattern=performance-stress-test --testNamePattern="many projects"

# Many files test
npx nx e2e workspace-e2e --testPathPattern=performance-stress-test --testNamePattern="many large files"

# Intra-project test
npx nx e2e workspace-e2e --testPathPattern=performance-stress-test --testNamePattern="intra-project"

# Combined stress test
npx nx e2e workspace-e2e --testPathPattern=performance-stress-test --testNamePattern="combined stress"
```

### Run All Performance Tests (Benchmarks + Stress Tests)

```powershell
npx nx e2e workspace-e2e --testPathPattern="performance"
```

## Interpreting Results

### Console Output

Each test logs detailed performance metrics:

```
=== Creating 10 projects ===
Created 10 projects
Creating cross-project dependencies (9 projects depend on lib0)

=== Moving shared-utility.ts from lib0 to lib9 ===
Expected to update imports in 9 consumer projects

✓ Moved file across 10 projects in 45678.90ms
  Average per-project processing: 4567.89ms
```

### Key Metrics

1. **Total Duration:** Overall time for the operation
2. **Per-Project/Per-File Average:** Time divided by number of items
3. **Files Skipped:** Count of early exit optimizations
4. **Traversals Saved:** Reduced AST passes

### Performance Baselines

These baselines assume the optimizations are working correctly:

| Test                   | Max Duration | Items Processed | Expected Avg/Item |
| ---------------------- | ------------ | --------------- | ----------------- |
| 10 Projects            | 120s (2 min) | 10 projects     | ~12s/project      |
| 100 Files              | 180s (3 min) | 100 files       | ~1.8s/file        |
| 50 Relative Imports    | 120s (2 min) | 50 imports      | ~2.4s/import      |
| 15 Projects × 30 Files | 240s (4 min) | 450 files       | ~0.5s/file        |

**Note:** Windows runners are typically slower than Linux/macOS. These baselines are conservative to account for platform differences.

## Comparing to Main Branch

To demonstrate performance improvements from the optimization branch:

### 1. Run Stress Tests on Optimization Branch (Current)

```powershell
git checkout copilot/optimize-codemod-performance
npm ci
npx nx build workspace
npx nx e2e workspace-e2e --testPathPattern=performance-stress-test
```

Record the durations from console output.

### 2. Run Stress Tests on Main Branch

```powershell
git checkout main
npm ci
npx nx build workspace
npx nx e2e workspace-e2e --testPathPattern=performance-stress-test
```

**Note:** If the stress tests don't exist on main, run the simpler benchmarks:

```powershell
npx nx e2e workspace-e2e --testPathPattern=performance-benchmark
```

### 3. Compare Results

Create a comparison table:

| Test Scenario        | Main Branch | Optimization Branch | Improvement |
| -------------------- | ----------- | ------------------- | ----------- |
| 10 Projects          | XXXs        | YYYs                | ZZ% faster  |
| 100 Files            | XXXs        | YYYs                | ZZ% faster  |
| 50 Relative Imports  | XXXs        | YYYs                | ZZ% faster  |
| Combined (450 files) | XXXs        | YYYs                | ZZ% faster  |

**Expected:** Optimization branch should be 20-50% faster depending on test scenario.

## Why Windows Runners May Be Slower

### File System Overhead

- Windows has higher file I/O overhead than Linux
- `readFileSync`, `writeFileSync` are slower
- Process creation (`execSync`) is slower

### Optimization Benefits Are Platform-Independent

The jscodeshift optimizations improve performance across all platforms:

- **Parser reuse** saves memory allocation (all platforms)
- **Early exit** reduces AST parsing (all platforms)
- **Single-pass traversal** reduces CPU cycles (all platforms)

The **absolute times** may be slower on Windows, but the **relative improvements** from optimizations should be consistent.

## Troubleshooting

### Test Timeouts

If stress tests timeout (default 300s = 5 minutes):

1. **Check system resources:** Ensure sufficient CPU and memory
2. **Run tests individually:** Use `--testNamePattern` to isolate
3. **Reduce scale:** Edit test to use fewer projects/files temporarily

### Disk Space Issues

Stress tests create temporary workspaces in `tmp/`:

- **Each test project:** ~50-200MB depending on scale
- **Total during run:** ~1-2GB temporary storage
- **Cleanup:** Automatic via `afterAll` hooks

Manual cleanup if needed:

```powershell
Remove-Item -Recurse -Force .\tmp\stress-test-*
```

### Performance Regression

If tests are consistently slower than baselines:

1. **Profile the code:** Check if optimizations are being applied
2. **Review recent changes:** Look for performance regressions
3. **Compare with main:** Run same test on main branch
4. **Check platform:** Verify Node.js version and platform

## CI/CD Integration

### GitHub Actions

The stress tests can be added to CI, but consider:

- **Long duration:** May increase CI time significantly
- **Resource usage:** Requires sufficient runner resources
- **Flakiness:** Timing-based tests can be flaky in CI

### Recommended CI Strategy

1. **Always run:** Regular performance benchmarks (quick, ~1-2 minutes)
2. **Nightly/weekly:** Stress tests (comprehensive validation)
3. **PR validation:** Run stress tests only on performance-related PRs

Example CI configuration:

```yaml
- name: Run performance benchmarks
  run: npx nx e2e workspace-e2e --testPathPattern=performance-benchmark

- name: Run stress tests (nightly only)
  if: github.event_name == 'schedule'
  run: npx nx e2e workspace-e2e --testPathPattern=performance-stress-test
```

## Future Enhancements

### Potential Additional Stress Tests

1. **Very Large Files:** Test with 100KB+ files (10,000+ LOC)
2. **Deep Dependency Chains:** Test with A → B → C → D → E dependency chains
3. **Mixed Import Styles:** Test with mix of static, dynamic, require, export patterns
4. **Concurrent Operations:** Test multiple move operations in parallel
5. **Incremental Updates:** Test repeated moves of the same file

### Performance Profiling

For detailed performance analysis:

```powershell
# Generate CPU profile
node --prof node_modules/.bin/nx e2e workspace-e2e --testPathPattern=performance-stress-test

# Process profile
node --prof-process isolate-*.log > profile.txt
```

### Benchmark Automation

Create scripts to:

- Run tests multiple times and average results
- Generate performance trend graphs over time
- Compare branches automatically
- Alert on performance regressions

## References

- [Performance Optimization Documentation](../docs/performance-optimization.md)
- [jscodeshift Documentation](https://github.com/facebook/jscodeshift)
- [AST Explorer](https://astexplorer.net/)
- [Nx Performance Best Practices](https://nx.dev/concepts/more-concepts/faster-builds)
