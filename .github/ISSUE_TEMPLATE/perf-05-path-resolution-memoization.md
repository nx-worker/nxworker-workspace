---
name: "Performance: Path Resolution Memoization"
about: Optimize performance by memoizing path operations
title: "perf: implement path resolution memoization"
labels: ["performance", "optimization"]
assignees: []
---

## Optimization Goal

**Implement memoization** for frequently-called path operations to reduce redundant string allocations and operations.

## Problem Statement

Path operations like `path.dirname()`, `path.relative()`, `path.join()`, and `path.basename()` are called repeatedly with the same arguments throughout execution.

**Expected Impact:** 2-5% improvement in large workspaces  
**Implementation Complexity:** Low  
**Priority:** Lower (Incremental Gains)

## Proposed Solution

Implement a simple memoization layer for frequently-called path operations:

```typescript
const pathOperationCache = {
  dirname: new Map<string, string>(),
  basename: new Map<string, string>(),
  relative: new Map<string, string>(),
};

function memoizedDirname(filePath: string): string {
  let result = pathOperationCache.dirname.get(filePath);
  if (result === undefined) {
    result = path.dirname(filePath);
    pathOperationCache.dirname.set(filePath, result);
  }
  return result;
}

// Similar for basename, relative with composite keys
```

## Testing Requirements

⚠️ **MANDATORY: Running benchmark and stress tests is REQUIRED and must not be skipped.**

### Before Making Changes

1. **Run performance benchmarks:**
   ```bash
   npx nx e2e workspace-e2e --testPathPattern=performance-benchmark
   ```
   Record the baseline results.

2. **Run stress tests:**
   ```bash
   npx nx e2e workspace-e2e --testPathPattern=performance-stress-test
   ```
   Record the baseline results.

### After Implementing Changes

3. **Run performance benchmarks again:**
   ```bash
   npx nx e2e workspace-e2e --testPathPattern=performance-benchmark
   ```
   Compare results to baseline.

4. **Run stress tests again:**
   ```bash
   npx nx e2e workspace-e2e --testPathPattern=performance-stress-test
   ```
   Compare results to baseline and document improvements.

5. **Verify all existing tests pass:**
   ```bash
   npx nx run-many --targets=test
   ```

## Implementation Notes

- Benefit scales with number of files processed
- Clear cache at start of generator execution
- Consider memory usage for very large workspaces
- Follow existing cache lifecycle pattern

## Acceptance Criteria

- [ ] Path operation memoization is implemented
- [ ] Memoization covers dirname, basename, relative, and other frequent operations
- [ ] Cache is cleared appropriately to prevent memory leaks
- [ ] Performance benchmarks run before changes (baseline recorded)
- [ ] Performance benchmarks run after changes (improvements documented)
- [ ] Stress tests run before changes (baseline recorded)
- [ ] Stress tests run after changes (improvements documented)
- [ ] All existing tests pass
- [ ] Code follows existing patterns and conventions
- [ ] Changes maintain backward compatibility
- [ ] Performance improvements are documented in a markdown file (e.g., `PERF_PATH_MEMOIZATION_RESULTS.md`)

## References

- [PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md](../PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md#5-path-resolution-memoization)
- [STRESS_TESTS_IMPLEMENTATION.md](../STRESS_TESTS_IMPLEMENTATION.md)
- [Move File Generator](../packages/workspace/src/generators/move-file/README.md)
