---
name: "Performance: Optimized Relative Path Calculation"
about: Optimize performance by caching relative path calculations
title: "perf: implement optimized relative path calculation"
labels: ["performance", "optimization"]
assignees: []
---

## Optimization Goal

**Cache relative path calculations** to reduce redundant path resolution and string operations.

## Problem Statement

`getRelativeImportSpecifier()` is called repeatedly for the same file pairs. The function performs path resolution, extension removal, and relative path calculation each time.

**Expected Impact:** 3-6% improvement in same-project moves  
**Implementation Complexity:** Low  
**Priority:** Medium (Good ROI)

## Proposed Solution

Cache relative path calculations:

```typescript
const relativePathCache = new Map<string, string>();

function getCachedRelativeImportSpecifier(
  fromFile: string,
  toFile: string,
): string {
  const cacheKey = `${fromFile}|${toFile}`;
  
  let result = relativePathCache.get(cacheKey);
  if (result === undefined) {
    result = getRelativeImportSpecifier(fromFile, toFile);
    relativePathCache.set(cacheKey, result);
  }
  
  return result;
}
```

## Testing Requirements

⚠️ **MANDATORY: Running benchmark and stress tests is REQUIRED and must not be skipped.**

### Before Making Changes

1. **Run performance benchmarks:**
   ```bash
   npx nx e2e workspace-e2e --testPathPattern=performance-benchmark
   ```
   Record the baseline results, especially for same-project moves.

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
   Compare results to baseline, especially for same-project moves.

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

- Particularly effective when many files import the same target
- Clear cache at start of generator execution
- Consider memory usage for very large workspaces
- Follow existing cache lifecycle pattern

## Acceptance Criteria

- [ ] Relative path calculation caching is implemented
- [ ] Cache key properly identifies unique file pairs
- [ ] Cache is cleared appropriately
- [ ] Performance benchmarks run before changes (baseline recorded)
- [ ] Performance benchmarks run after changes (improvements documented)
- [ ] Stress tests run before changes (baseline recorded)
- [ ] Stress tests run after changes (improvements documented)
- [ ] All existing tests pass
- [ ] Code follows existing patterns and conventions
- [ ] Changes maintain backward compatibility
- [ ] Performance improvements are documented in a markdown file (e.g., `PERF_RELATIVE_PATH_CALCULATION_RESULTS.md`)

## References

- [PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md](../PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md#9-optimized-relative-path-calculation)
- [STRESS_TESTS_IMPLEMENTATION.md](../STRESS_TESTS_IMPLEMENTATION.md)
- [Move File Generator](../packages/workspace/src/generators/move-file/README.md)
