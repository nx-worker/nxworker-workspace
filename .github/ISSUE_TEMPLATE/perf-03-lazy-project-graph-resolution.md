---
name: "Performance: Lazy Project Graph Resolution"
about: Optimize performance by deferring project graph creation until needed
title: "perf: implement lazy project graph resolution"
labels: ["performance", "optimization"]
assignees: []
---

## Optimization Goal

**Defer project graph creation** until it's actually needed to avoid expensive graph computation for same-project moves.

## Problem Statement

The generator creates the full project graph (`await createProjectGraphAsync()`) at the start of every execution, even when moving files within the same project where the graph is not needed.

**Expected Impact:** 15-20% improvement for same-project moves  
**Implementation Complexity:** Medium  
**Priority:** High (Quick Win)

## Proposed Solution

Defer project graph creation until it's actually needed:

```typescript
export async function moveFileGenerator(
  tree: Tree,
  options: MoveFileGeneratorSchema,
) {
  clearAllCaches();
  clearCache();

  const projects = getProjects(tree);
  let projectGraph: ProjectGraph | null = null;
  
  // Helper to lazily load project graph
  const getProjectGraph = async (): Promise<ProjectGraph> => {
    if (!projectGraph) {
      projectGraph = await createProjectGraphAsync();
    }
    return projectGraph;
  };
  
  // ... use getProjectGraph() only when needed
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

- Eliminates expensive graph computation when not needed
- No impact on cross-project moves (graph still computed when needed)
- Ensure proper error handling for async graph creation
- Test both same-project and cross-project scenarios

## Acceptance Criteria

- [ ] Lazy project graph resolution is implemented
- [ ] Project graph is only created when needed
- [ ] Performance benchmarks run before changes (baseline recorded)
- [ ] Performance benchmarks run after changes (improvements documented)
- [ ] Stress tests run before changes (baseline recorded)
- [ ] Stress tests run after changes (improvements documented)
- [ ] All existing tests pass (both same-project and cross-project)
- [ ] Code follows existing patterns and conventions
- [ ] Changes maintain backward compatibility
- [ ] Performance improvements are documented in a markdown file (e.g., `PERF_LAZY_PROJECT_GRAPH_RESULTS.md`)

## References

- [PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md](../PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md#3-lazy-project-graph-resolution)
- [STRESS_TESTS_IMPLEMENTATION.md](../STRESS_TESTS_IMPLEMENTATION.md)
- [Move File Generator](../packages/workspace/src/generators/move-file/README.md)
