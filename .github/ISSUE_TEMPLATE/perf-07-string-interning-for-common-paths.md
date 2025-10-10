---
name: "Performance: String Interning for Common Paths"
about: Optimize performance by interning frequently-used path strings
title: "perf: implement string interning for common paths"
labels: ["performance", "optimization"]
assignees: []
---

## Optimization Goal

**Implement string interning** for frequently-used path strings to reduce memory pressure and comparison overhead.

## Problem Statement

Many path strings are created repeatedly (project roots, source roots, common directory names). These create memory pressure and comparison overhead.

**Expected Impact:** 1-3% improvement in large workspaces  
**Implementation Complexity:** Low  
**Priority:** Lower (Incremental Gains)

## Proposed Solution

Implement string interning for frequently-used path strings:

```typescript
const stringInternCache = new Map<string, string>();

function intern(str: string): string {
  let interned = stringInternCache.get(str);
  if (interned === undefined) {
    interned = str;
    stringInternCache.set(str, interned);
  }
  return interned;
}

// Use when storing paths in caches
function getProjectSourceFiles(tree: Tree, projectRoot: string): string[] {
  const internedRoot = intern(projectRoot);
  const cached = projectSourceFilesCache.get(internedRoot);
  // ...
}
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

- Reduces memory usage for path strings
- Enables faster string comparisons (reference equality)
- Most beneficial with many projects sharing common path segments
- Clear cache at start of generator execution

## Acceptance Criteria

- [ ] String interning is implemented for common paths
- [ ] Interned strings are used in caches and comparisons
- [ ] Cache is cleared appropriately to prevent memory leaks
- [ ] Performance benchmarks run before changes (baseline recorded)
- [ ] Performance benchmarks run after changes (improvements documented)
- [ ] Stress tests run before changes (baseline recorded)
- [ ] Stress tests run after changes (improvements documented)
- [ ] All existing tests pass
- [ ] Code follows existing patterns and conventions
- [ ] Changes maintain backward compatibility
- [ ] Performance improvements are documented in a markdown file (e.g., `PERF_STRING_INTERNING_RESULTS.md`)

## References

- [PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md](../PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md#7-string-interning-for-common-paths)
- [STRESS_TESTS_IMPLEMENTATION.md](../STRESS_TESTS_IMPLEMENTATION.md)
- [Move File Generator](../packages/workspace/src/generators/move-file/README.md)
