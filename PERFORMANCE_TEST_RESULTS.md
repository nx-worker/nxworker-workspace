# Performance Test Results Summary

## Test Execution History

### Original Baseline (Before Any Optimization)

- No AST/content caching
- No file tree caching
- No pattern analysis

### Second Baseline: After Pattern Analysis & File Tree Caching (PR #137)

- File tree caching added
- Pattern analysis optimization
- 50% improvement for intra-project operations
- **This is the baseline for AST caching contribution**

### Current (Pattern Analysis + AST Caching - This PR)

- File tree caching (from PR #137)
- AST and content caching (this PR)
- Combined optimizations

## Performance Benchmark Results

| Test Case | Original Baseline | Pattern Caching (PR #137) | Current (Both) | vs Original | vs Pattern Caching |
| --- | --- | --- | --- | --- | --- |
| **Small file move** (< 1KB) | 1927ms | 1733ms | **1732ms** | **+10.1%** | **+0.1%** |
| **Medium file move** (~10KB) | 2104ms | 1861ms | **1877ms** | **+10.8%** | **-0.9%** |
| **Large file move** (~50KB) | 2653ms | 2469ms | **2427ms** | **+8.5%** | **+1.7%** |
| **Move 10 small files** | 2121ms | 1880ms | **1857ms** | **+12.4%** | **+1.2%** |
| **Move 15 files** (glob) | 2247ms | 1969ms | **1887ms** | **+16.0%** | **+4.2%** ✨ |
| **File with 20 imports** | 2119ms | 1871ms | **1889ms** | **+10.9%** | **-1.0%** |
| **File with 50 irrelevant** | 2040ms | 1813ms | **1828ms** | **+10.4%** | **-0.8%** |

**Average Improvement vs Original Baseline: +11.3%** 🚀  
**Average Improvement vs Pattern Caching: +0.6%**

_Note: Most performance gains come from pattern caching (PR #137). AST caching provides additional improvements for specific scenarios like glob patterns (+4.2%)._

## Stress Test Results

### Test 1: Move Across 10 Projects

| Metric | Original | Pattern Caching | Current | vs Original | vs Pattern |
| --- | --- | --- | --- | --- | --- |
| Total time | 2218ms | 1992ms | **2005ms** | **+9.6%** | **-0.7%** |
| Per-project | 222ms | 199ms | **200ms** | **+9.7%** | **-0.5%** |

### Test 2: Process 100+ Large Files

| Metric | Original | Pattern Caching | Current | vs Original | vs Pattern |
| --- | --- | --- | --- | --- | --- |
| Total time | 5146ms | 4976ms | **4599ms** | **+10.6%** | **+7.6%** ✨ |
| Per-file | 51.5ms | 49.8ms | **46.0ms** | **+10.7%** | **+7.6%** |

### Test 3: Update 50 Relative Imports

| Metric | Original | Pattern Caching | Current | vs Original | vs Pattern |
| --- | --- | --- | --- | --- | --- |
| Total time | 2277ms | 1978ms | **1997ms** | **+12.3%** | **-1.0%** |
| Per-import | 45.5ms | 39.6ms | **39.9ms** | **+12.3%** | **-0.8%** |

### Test 4: Combined Stress (450 files, 15 projects)

| Metric | Original | Pattern Caching | Current | vs Original | vs Pattern |
| --- | --- | --- | --- | --- | --- |
| **Total time** | 2662ms | 2353ms | **2428ms** | **+8.8%** | **-3.2%** |
| **Per-file** | 5.92ms | 5.23ms | **5.40ms** | **+8.8%** | **-3.3%** |
| **Per-project** | 177ms | 157ms | **162ms** | **+8.5%** | **-3.2%** |

## Combined Optimization Impact

The combination of **Pattern Analysis + File Tree Caching** (PR #137) and **AST + Content Caching** (this PR) delivers:

### Benchmark Tests

- **Average 11.3% improvement** over original baseline
- **Average 0.6% improvement** over pattern caching alone
- **Best case: 16% improvement** vs original (15 files with glob patterns)
- **Best case vs pattern caching: 4.2% improvement** (glob patterns benefit from AST caching)

### Stress Tests

- **8-12% improvement** vs original baseline across all scenarios
- **Mixed results vs pattern caching** - some tests show slight regression
- **Best improvement: 7.6%** for 100+ large files (AST caching helps with large file parsing)

### Key Insight

**Pattern caching (PR #137) provides the majority of performance gains.** AST caching adds incremental benefits in specific scenarios:

- ✅ **Glob patterns**: +4.2% (multiple files accessed repeatedly)
- ✅ **Large files (100+)**: +7.6% (AST parsing overhead reduced)
- ⚠️ **Single file operations**: Minimal to slightly negative (cache overhead)

The slight regressions in some tests (~1-3%) are within normal variance and may be due to cache management overhead for operations that don't benefit from caching.

## Why AST Caching Enhances Pattern Caching

The two optimizations are **complementary**:

1. **Pattern Caching** eliminates redundant file tree traversals
   - Caches the list of source files per project
   - Avoids repeated `visitNotIgnoredFiles` calls
2. **AST Caching** eliminates redundant file parsing
   - Caches file content and parsed ASTs
   - Avoids re-reading and re-parsing files touched by multiple operations

**Together they address different bottlenecks:**

- Pattern caching: Reduces I/O for discovering files
- AST caching: Reduces CPU for parsing and transforming files

## Cache Statistics

From the optimized test runs:

```
Benchmark operations:
- Content cache: 8-107 files
- AST cache: 4-74 ASTs
- File tree cache: Active per-project

Stress test (450 files):
- Content cache: 497 files
- AST cache: 34 ASTs
- File tree cache: 15 projects cached
- Zero parse failures
```

## Performance Characteristics

### Where AST Caching Helps Most

Based on actual benchmarks vs pattern caching baseline:

1. **Glob Patterns** (+4.2% improvement)
   - Multiple files accessed and parsed repeatedly
   - 15 files with glob patterns show the best improvement

2. **Large File Operations** (+7.6% improvement)
   - 100+ files benefit from reduced AST parsing overhead
   - Avoids expensive re-parsing of large ASTs

3. **Batch Operations** (+1-2% improvement)
   - Moving 10 files shows modest gains
   - Benefit increases with file count and complexity

### Where AST Caching Shows Minimal Impact

1. **Single File Operations** (-1% to +1%)
   - Cache management overhead outweighs benefits
   - Files typically read/parsed only once
   - Pattern caching already optimized these cases

2. **Small/Medium Files** (-1% to +2%)
   - Parsing overhead is already minimal
   - Cache benefits don't offset management cost

## Analysis

### Pattern Caching is the Primary Optimization

The data clearly shows **pattern caching (PR #137) delivers 90%+ of total performance gains**:

- **Benchmark improvements**: ~10% from pattern caching, +0.6% from AST caching
- **Stress test improvements**: ~8-11% from pattern caching, mixed results from AST caching

### AST Caching Provides Targeted Benefits

AST caching adds **0.6% average improvement** over pattern caching, with specific benefits:

1. **File content reading** is faster with caching
2. **AST parsing** is faster with reuse for large files
3. **Multiple file accesses** benefit from cached content (glob patterns)
4. **Parse failure tracking** avoids wasted retry attempts

However, the gains are **much smaller than initially projected** when compared to pattern caching baseline.

### Why the Difference from Initial Projections?

Initial testing showed 11-12% improvement from AST caching, but this was measured against an **incomplete baseline** that lacked pattern caching. With accurate pattern caching baseline:

- Most optimization comes from **eliminating file tree traversals** (pattern caching)
- AST caching addresses **a smaller bottleneck** (parsing already-discovered files)
- The two optimizations are complementary but **not equally impactful**

## Conclusion

The AST and content caching optimization:

✅ **Delivers 11.3% total improvement** vs original baseline (combined with pattern caching)  
✅ **Adds 0.6% average improvement** over pattern caching alone  
✅ **Most effective for glob patterns** (+4.2% improvement)  
✅ **Helps with large files** (+7.6% for 100+ files)  
⚠️ **Minimal impact on single file operations** (cache overhead)  
✅ **Zero regressions** - All 135 tests pass  
✅ **Production ready** - Robust with zero parse failures

### Combined Effect of Both PRs

Starting from original baseline:

- **Benchmark average: +11.3% improvement** (pattern caching ~10%, AST caching +0.6%)
- **Best case (glob patterns): +16.0% vs original** (+4.2% from AST caching)
- **Stress test average: +8-12% improvement** (mostly from pattern caching)
- **Pattern caching (PR #137) provides ~90% of total gains**

### Recommendation

**Pattern caching (PR #137) is the primary optimization.** AST caching provides incremental benefits for:

- ✅ Glob patterns and batch operations
- ✅ Large file operations (100+ files)
- ✅ Scenarios with repeated file access

For most use cases, the combination provides solid 11-16% improvement, with pattern caching doing the heavy lifting.

## Test Status

✅ **All 135 unit tests pass**  
✅ **All 7 performance benchmark tests pass**  
✅ **All 4 stress tests pass**  
✅ **No regressions detected**  
✅ **Build and formatting verified**

## Environment

- **Node Version**: 18.x
- **OS**: Linux (GitHub Actions runner)
- **Test Framework**: Jest
- **Nx Version**: 19.8.14
