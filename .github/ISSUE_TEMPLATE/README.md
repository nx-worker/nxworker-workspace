# Performance Optimization Issue Templates

This directory contains GitHub issue templates for each of the 14 performance optimization suggestions documented in [PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md](../../PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md).

## Overview

Each issue template is designed to work well as a task description for GitHub Copilot coding agent and includes:

- Clear optimization goals and problem statements
- Expected performance impact and implementation complexity
- Proposed solution with code examples
- **Mandatory testing requirements** (benchmark and stress tests before/after)
- Implementation notes and acceptance criteria
- References to relevant documentation

## Issue Templates

### High Priority (Quick Wins)

1. **[perf-03-lazy-project-graph-resolution.md](perf-03-lazy-project-graph-resolution.md)**
   - Expected Impact: 15-20% improvement for same-project moves
   - Complexity: Medium

2. **[perf-10-project-import-path-lookup-table.md](perf-10-project-import-path-lookup-table.md)**
   - Expected Impact: 4-7% improvement in batch operations
   - Complexity: Medium

3. **[perf-02-import-specifier-pattern-precompilation.md](perf-02-import-specifier-pattern-precompilation.md)**
   - Expected Impact: 3-7% improvement in projects with many files
   - Complexity: Low

4. **[perf-06-early-exit-on-empty-projects.md](perf-06-early-exit-on-empty-projects.md)**
   - Expected Impact: 5-10% improvement in workspaces with many small/empty projects
   - Complexity: Low

### Medium Priority (Good ROI)

5. **[perf-01-project-dependency-graph-caching.md](perf-01-project-dependency-graph-caching.md)**
   - Expected Impact: 5-10% improvement in batch operations
   - Complexity: Low

6. **[perf-09-optimized-relative-path-calculation.md](perf-09-optimized-relative-path-calculation.md)**
   - Expected Impact: 3-6% improvement in same-project moves
   - Complexity: Low

7. **[perf-08-incremental-file-content-validation.md](perf-08-incremental-file-content-validation.md)**
   - Expected Impact: 5-8% improvement when checking imports
   - Complexity: Medium

8. **[perf-12-smart-index-file-detection.md](perf-12-smart-index-file-detection.md)**
   - Expected Impact: 6-10% improvement with multiple files from same project
   - Complexity: Medium

### Lower Priority (Incremental Gains)

9. **[perf-05-path-resolution-memoization.md](perf-05-path-resolution-memoization.md)**
   - Expected Impact: 2-5% improvement in large workspaces
   - Complexity: Low

10. **[perf-07-string-interning-for-common-paths.md](perf-07-string-interning-for-common-paths.md)**
    - Expected Impact: 1-3% improvement in large workspaces
    - Complexity: Low

11. **[perf-11-targeted-file-filtering.md](perf-11-targeted-file-filtering.md)**
    - Expected Impact: 8-12% improvement in test-heavy projects
    - Complexity: Low

### Future Consideration

12. **[perf-04-batched-import-update-operations.md](perf-04-batched-import-update-operations.md)**
    - Expected Impact: 20-30% improvement when moving 10+ files
    - Complexity: High

13. **[perf-13-bulk-file-operations.md](perf-13-bulk-file-operations.md)**
    - Expected Impact: 5-8% improvement in batch operations
    - Complexity: Medium

14. **[perf-14-conditional-formatting.md](perf-14-conditional-formatting.md)**
    - Expected Impact: 10-20% improvement in large workspaces
    - Complexity: High

## Testing Requirements

⚠️ **CRITICAL:** All optimization tasks require running benchmark and stress tests both **before** and **after** making changes. This is **MANDATORY** and must not be skipped.

### Before Making Changes

```bash
# Run performance benchmarks
npx nx e2e workspace-e2e --testPathPattern=performance-benchmark

# Run stress tests
npx nx e2e workspace-e2e --testPathPattern=performance-stress-test
```

Record baseline results from both tests.

### After Implementing Changes

```bash
# Run performance benchmarks again
npx nx e2e workspace-e2e --testPathPattern=performance-benchmark

# Run stress tests again
npx nx e2e workspace-e2e --testPathPattern=performance-stress-test

# Verify all tests pass
npx nx run-many --targets=test
```

Compare results to baseline and document improvements.

## Creating Issues from Templates

### Option 1: Via GitHub Web Interface

1. Navigate to https://github.com/nx-worker/nxworker-workspace/issues/new/choose
2. Select the appropriate performance optimization template
3. Fill in any additional context
4. Create the issue

### Option 2: Using GitHub CLI

```bash
# Create an issue from a template
gh issue create --template perf-03-lazy-project-graph-resolution.md
```

### Option 3: Bulk Create All Issues

Use the provided script to create all optimization issues at once:

```bash
# From repository root
node tools/create-optimization-issues.js
```

See [CREATE_ALL_OPTIMIZATION_ISSUES.md](../../CREATE_ALL_OPTIMIZATION_ISSUES.md) for details.

## Labels

All performance optimization issues should be labeled with:
- `performance` - Indicates performance-related work
- `optimization` - Indicates code optimization work

Additional labels may be added based on priority:
- `priority: high` - Quick wins with significant impact
- `priority: medium` - Good ROI optimizations
- `priority: low` - Incremental gains

## Documentation

Each optimization implementation should create a results markdown file documenting:
- Before and after benchmark results
- Before and after stress test results
- Implementation details
- Performance characteristics

Examples:
- `PERF_LAZY_PROJECT_GRAPH_RESULTS.md`
- `PERF_IMPORT_SPECIFIER_PRECOMPILATION_RESULTS.md`

## References

- [PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md](../../PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md) - Main optimization suggestions document
- [STRESS_TESTS_IMPLEMENTATION.md](../../STRESS_TESTS_IMPLEMENTATION.md) - Stress test documentation
- [STRESS_TEST_GUIDE.md](../../packages/workspace-e2e/STRESS_TEST_GUIDE.md) - Comprehensive stress test guide
- [Move File Generator](../../packages/workspace/src/generators/move-file/README.md) - Generator documentation
