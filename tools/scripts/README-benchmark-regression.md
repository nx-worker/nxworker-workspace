# Benchmark Regression Detection

This directory contains scripts for detecting performance regressions in the move-file generator benchmarks.

## Overview

The benchmark regression detection system:

1. **Captures baseline metrics** from benchmark test output
2. **Compares current results** against stored baselines
3. **Flags regressions** that exceed defined thresholds
4. **Runs automatically** in CI for pull requests

## Scripts

### `capture-benchmark-baselines.ts`

Captures current benchmark results and stores them as the baseline for future comparisons.

**Usage:**
```bash
npx tsx tools/scripts/capture-benchmark-baselines.ts
```

**Output:**
- Creates/updates `packages/workspace/src/generators/move-file/benchmarks/baselines.json`
- Contains benchmark names, average times, capture timestamp, and environment info

**When to use:**
- After making intentional performance optimizations
- When baseline needs updating after architecture changes
- When setting up benchmarks for the first time

### `compare-benchmark-results.ts`

Compares current benchmark results against the stored baseline and reports regressions.

**Usage:**
```bash
npx tsx tools/scripts/compare-benchmark-results.ts
```

**Exit codes:**
- `0` - No regressions detected
- `1` - Regressions detected or script error

**When to use:**
- Automatically runs in CI for pull requests
- Can be run locally before committing changes
- Useful for validating performance impact of changes

## Regression Thresholds

Different thresholds apply based on operation type:

| Operation Type | Threshold | Rationale |
|---|---|---|
| **Cache operations** | 50% | Cache hits should be extremely fast; large variance acceptable for such tiny times |
| **Path operations** | 25% | Pure string manipulation; moderate variance expected |
| **Import/Export operations** | 20% (default) | File I/O and AST operations; tighter threshold for consistency |

The system automatically selects the threshold based on the benchmark name.

## CI Integration

### Pull Requests

The `benchmark-regression` job runs on every PR:

```yaml
- name: Check for performance regressions
  run: npx tsx tools/scripts/compare-benchmark-results.ts
```

If regressions are detected:
1. The job fails with a clear error message
2. Shows which benchmarks regressed and by how much
3. Provides instructions for updating baselines if intentional

### Main Branch

The `benchmark` job runs on pushes to `main` and `workflow_dispatch`:

```yaml
- name: Run micro-benchmarks
  run: npx nx test workspace --testPathPattern='\.bench\.spec\.ts$' --output-style=static
```

This ensures benchmarks continue to pass after merging.

## Baseline File Format

The `baselines.json` file contains:

```json
{
  "capturedAt": "2025-10-15T18:19:39.602Z",
  "nodeVersion": "v22.20.0",
  "platform": "linux-x64",
  "benchmarks": [
    {
      "name": "Cache hit",
      "averageMs": 0.0001,
      "unit": "ms"
    }
  ]
}
```

**Fields:**
- `capturedAt` - ISO timestamp when baseline was captured
- `nodeVersion` - Node.js version used
- `platform` - OS and architecture (e.g., `linux-x64`)
- `benchmarks` - Array of benchmark results

## Workflow

### For Developers

**Before committing:**
```bash
# Run benchmarks locally to check for regressions
npx tsx tools/scripts/compare-benchmark-results.ts
```

**If regression is intentional (e.g., after optimization):**
```bash
# Update the baseline
npx tsx tools/scripts/capture-benchmark-baselines.ts

# Commit the new baseline
git add packages/workspace/src/generators/move-file/benchmarks/baselines.json
git commit -m "perf(workspace): update benchmark baselines after optimization"
```

**If regression is unintentional:**
- Investigate the performance issue
- Fix the code causing the regression
- Re-run comparison to verify fix

### For CI

1. **Pull Request**: Automatically runs `compare-benchmark-results.ts`
   - ✅ Pass: No regressions, PR can merge
   - ❌ Fail: Regressions detected, investigate or update baseline

2. **Main Branch**: Runs full benchmark suite
   - Validates benchmarks still pass after merge
   - Can be used to capture new baselines if needed

## Examples

### Successful Comparison (No Regressions)

```
📊 Benchmark Comparison Results

┌─────────────────────────────────────────────────────────────────────────────┐
│ Benchmark                           Baseline    Current    Change  Threshold │
├─────────────────────────────────────────────────────────────────────────────┤
│ ✅ Cache hit                           0.0001ms   0.0001ms   +0.0%       50% │
│ ✅ Import update                       0.0151ms   0.0142ms   -6.0%       20% │
│ ✅ Export addition                     1.1013ms   1.0826ms   -1.7%       20% │
└─────────────────────────────────────────────────────────────────────────────┘

✅ No performance regressions detected!

🎉 Performance Improvements:
  • Import update: 6.0% faster
```

### Regression Detected

```
📊 Benchmark Comparison Results

┌─────────────────────────────────────────────────────────────────────────────┐
│ Benchmark                           Baseline    Current    Change  Threshold │
├─────────────────────────────────────────────────────────────────────────────┤
│ ❌ Cache hit                           0.0001ms   0.0002ms +100.0%       50% │
│ ✅ Import update                       0.0151ms   0.0142ms   -6.0%       20% │
└─────────────────────────────────────────────────────────────────────────────┘

❌ Performance Regression Detected!

Found 1 benchmark(s) exceeding threshold:

  • Cache hit
    Baseline: 0.0001ms
    Current:  0.0002ms
    Change:   +100.0% (threshold: 50%)

💡 If this regression is intentional, update the baseline:
   npx tsx tools/scripts/capture-benchmark-baselines.ts
```

## Troubleshooting

### Baseline file not found

**Error:**
```
❌ Failed to load baseline file: ENOENT: no such file or directory
```

**Solution:**
```bash
npx tsx tools/scripts/capture-benchmark-baselines.ts
```

### Benchmark not found in baseline

**Warning:**
```
⚠️  Baseline "New benchmark" not found in current results
```

**Cause:** Baseline is outdated after adding new benchmarks

**Solution:**
```bash
# Capture new baseline with all current benchmarks
npx tsx tools/scripts/capture-benchmark-baselines.ts
```

### High variance in results

**Issue:** Benchmarks show different results across runs

**Possible causes:**
- System load varies (other processes running)
- Different Node.js versions
- Different platforms (Linux vs macOS vs Windows)

**Recommendations:**
- Run benchmarks multiple times and average
- Use dedicated CI runner for consistency
- Update baselines on same platform as CI

## Related Documentation

- [Benchmark README](../../packages/workspace/src/generators/move-file/benchmarks/README.md) - How to run benchmarks
- [Performance Baselines](../../packages/workspace/src/generators/move-file/benchmarks/PERFORMANCE_BASELINES.md) - Current baseline metrics
- [Refactoring Evaluation](../../REFACTORING_EVALUATION.md) - Overall refactoring assessment
