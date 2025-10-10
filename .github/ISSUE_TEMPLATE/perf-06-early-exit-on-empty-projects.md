---
name: "Performance: Early Exit on Empty Projects"
about: Optimize performance by skipping empty or nearly-empty projects
title: "perf: implement early exit on empty projects"
labels: ["performance", "optimization"]
assignees: []
---

## Optimization Goal

**Add early exit checks** for empty projects to avoid unnecessary cache population and iteration logic.

## Problem Statement

The generator checks all projects for imports even when a project has no source files. Empty or nearly-empty projects still trigger cache population and iteration logic.

**Expected Impact:** 5-10% improvement in workspaces with many small/empty projects  
**Implementation Complexity:** Low  
**Priority:** High (Quick Win)

## Proposed Solution

Add early exit checks for empty projects:

```typescript
function getProjectSourceFiles(tree: Tree, projectRoot: string): string[] {
  const cached = projectSourceFilesCache.get(projectRoot);
  if (cached !== undefined) {
    return cached;
  }

  const sourceFiles: string[] = [];
  
  // Early exit: check if project directory exists
  if (!tree.exists(projectRoot)) {
    projectSourceFilesCache.set(projectRoot, sourceFiles);
    return sourceFiles;
  }
  
  visitNotIgnoredFiles(tree, projectRoot, (filePath) => {
    if (sourceFileExtensions.some((ext) => filePath.endsWith(ext))) {
      sourceFiles.push(normalizePath(filePath));
    }
  });

  projectSourceFilesCache.set(projectRoot, sourceFiles);
  return sourceFiles;
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

- Reduces unnecessary tree traversal operations
- Most beneficial in monorepos with generated or placeholder projects
- Ensure proper caching of empty project results
- Consider edge cases (project created during execution)

## Acceptance Criteria

- [ ] Early exit for empty projects is implemented
- [ ] Empty project check includes directory existence validation
- [ ] Empty results are properly cached
- [ ] Performance benchmarks run before changes (baseline recorded)
- [ ] Performance benchmarks run after changes (improvements documented)
- [ ] Stress tests run before changes (baseline recorded)
- [ ] Stress tests run after changes (improvements documented)
- [ ] All existing tests pass
- [ ] Code follows existing patterns and conventions
- [ ] Changes maintain backward compatibility
- [ ] Performance improvements are documented in a markdown file (e.g., `PERF_EARLY_EXIT_RESULTS.md`)

## References

- [PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md](../PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md#6-early-exit-on-empty-projects)
- [STRESS_TESTS_IMPLEMENTATION.md](../STRESS_TESTS_IMPLEMENTATION.md)
- [Move File Generator](../packages/workspace/src/generators/move-file/README.md)
