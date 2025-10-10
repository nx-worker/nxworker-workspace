# Quick Start: Performance Stress Tests

## Purpose

Demonstrate that jscodeshift optimizations (parser reuse, early exit, single-pass traversal) deliver performance benefits in large workspaces with many projects and files.

## Run All Stress Tests

```powershell
npx nx e2e workspace-e2e --testPathPattern=performance-stress-test
```

**Duration:** ~15-30 minutes (depends on system performance)

## Run Individual Test Scenarios

### 1. Many Projects Test (10+ projects)

```powershell
npx nx e2e workspace-e2e --testPathPattern=performance-stress-test --testNamePattern="many projects"
```

**Validates:** Parser reuse across projects, cross-project dependency updates

**Expected:** < 2 minutes

### 2. Many Files Test (100+ large files)

```powershell
npx nx e2e workspace-e2e --testPathPattern=performance-stress-test --testNamePattern="many large files"
```

**Validates:** Early exit optimization (90% of files skipped from AST parsing)

**Expected:** < 3 minutes

### 3. Intra-Project Dependencies Test (50+ relative imports)

```powershell
npx nx e2e workspace-e2e --testPathPattern=performance-stress-test --testNamePattern="intra-project"
```

**Validates:** Single-pass traversal efficiency

**Expected:** < 2 minutes

### 4. Combined Stress Test (15 projects × 30 files = 450 files)

```powershell
npx nx e2e workspace-e2e --testPathPattern=performance-stress-test --testNamePattern="combined stress"
```

**Validates:** All optimizations working together in realistic large workspace

**Expected:** < 4 minutes

## Compare Performance: Optimization Branch vs Main

### On Optimization Branch (current)

```powershell
git checkout copilot/optimize-codemod-performance
npm ci
npx nx build workspace
npx nx e2e workspace-e2e --testPathPattern=performance-stress-test
```

Record timings from console output.

### On Main Branch

```powershell
git checkout main
npm ci
npx nx build workspace
npx nx e2e workspace-e2e --testPathPattern=performance-stress-test
```

Record timings and compare.

**Expected:** Optimization branch should be 20-50% faster.

## Understanding Console Output

Each test logs detailed metrics:

```
=== Creating 10 projects ===
Created 10 projects

=== Moving shared-utility.ts from lib0 to lib9 ===
Expected to update imports in 9 consumer projects

✓ Moved file across 10 projects in 45678.90ms
  Average per-project processing: 4567.89ms
```

**Key Metrics:**

- **Total Duration:** Overall operation time
- **Average per-item:** Time divided by number of projects/files
- **Files skipped:** Early exit optimization count (logged in some tests)
- **Traversals saved:** Reduced AST passes (logged in combined test)

## Troubleshooting

### Test Timeouts

Default timeout: 5 minutes per test. If tests timeout:

1. Run tests individually using `--testNamePattern`
2. Check system resources (CPU, memory, disk)
3. Verify no other heavy processes are running

### Cleanup

Temporary test projects are created in `tmp/stress-test-*` and cleaned up automatically.

Manual cleanup if needed:

```powershell
Remove-Item -Recurse -Force .\tmp\stress-test-*
```

### Disk Space

Stress tests require ~1-2GB temporary storage during execution.

## Why These Tests Matter

**Problem:** Unit tests and small e2e tests may run slower with AST-based approach on Windows runners compared to regex-based approach on main branch.

**Solution:** Stress tests demonstrate that in **realistic large workspaces** (the actual use case), the AST-based optimizations provide significant benefits:

1. **Parser Reuse:** Eliminates hundreds of parser instantiations
2. **Early Exit:** Skips parsing 80-90% of files that don't need updates
3. **Single-Pass:** Saves 4-5 redundant AST traversals per file

These benefits compound at scale, making the optimized version significantly faster in real-world usage even if individual small operations are marginally slower.

## More Information

See [STRESS_TEST_GUIDE.md](./STRESS_TEST_GUIDE.md) for comprehensive documentation.
