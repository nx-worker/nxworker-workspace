---
name: "Performance: Project Dependency Graph Caching"
about: Optimize performance by caching project dependency relationships
title: "perf: implement project dependency graph caching"
labels: ["performance", "optimization"]
assignees: []
---

## Optimization Goal

**Cache project dependency relationships** to avoid repeated graph traversal calculations during batch operations.

## Problem Statement

The generator calls `getDependentProjectNames()` and iterates through the project graph for each file move. In batch operations, this involves repeated graph traversal calculations.

**Expected Impact:** 5-10% improvement in batch operations with many projects  
**Implementation Complexity:** Low  
**Priority:** Medium (Good ROI)

## Proposed Solution

Cache the project dependency relationships at the start of the generator execution:

```typescript
const dependencyGraphCache = new Map<string, Set<string>>();

function getCachedDependentProjects(
  projectGraph: ProjectGraph,
  projectName: string,
): Set<string> {
  if (dependencyGraphCache.has(projectName)) {
    return dependencyGraphCache.get(projectName)!;
  }
  
  const dependents = new Set(getDependentProjectNames(projectGraph, projectName));
  dependencyGraphCache.set(projectName, dependents);
  return dependents;
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

- Most beneficial when moving files across projects with complex dependency graphs
- Cache would be cleared at start of each generator execution
- Follow the existing cache lifecycle pattern (clear at start, lazy load, invalidate on changes)

## Acceptance Criteria

- [ ] Dependency graph caching is implemented as described
- [ ] Performance benchmarks run before changes (baseline recorded)
- [ ] Performance benchmarks run after changes (improvements documented)
- [ ] Stress tests run before changes (baseline recorded)
- [ ] Stress tests run after changes (improvements documented)
- [ ] All existing tests pass
- [ ] Code follows existing patterns and conventions
- [ ] Changes maintain backward compatibility
- [ ] Performance improvements are documented in a markdown file (e.g., `PERF_DEPENDENCY_GRAPH_CACHE_RESULTS.md`)

## References

- [PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md](../PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md#1-project-dependency-graph-caching)
- [STRESS_TESTS_IMPLEMENTATION.md](../STRESS_TESTS_IMPLEMENTATION.md)
- [Move File Generator](../packages/workspace/src/generators/move-file/README.md)
