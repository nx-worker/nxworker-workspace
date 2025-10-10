---
name: "Performance: Project Import Path Lookup Table"
about: Optimize performance by building project import path lookup table at initialization
title: "perf: implement project import path lookup table"
labels: ["performance", "optimization"]
assignees: []
---

## Optimization Goal

**Build a project name to import path lookup table** at initialization to avoid repeated tsconfig parsing and path matching.

## Problem Statement

`getProjectImportPath()` calls `readCompilerPaths()` and iterates through entries for each project, even though import paths are typically stable across a generator execution.

**Expected Impact:** 4-7% improvement in batch operations  
**Implementation Complexity:** Medium  
**Priority:** High (Quick Win)

## Proposed Solution

Build a project name to import path lookup table at initialization:

```typescript
const projectImportPathCache = new Map<string, string | null>();

function initializeProjectImportPaths(
  tree: Tree,
  projects: Map<string, ProjectConfiguration>,
): void {
  const compilerPaths = readCompilerPaths(tree);
  
  for (const [projectName, project] of projects.entries()) {
    const importPath = findImportPathFromCompilerPaths(
      compilerPaths,
      project,
      projectName,
    );
    projectImportPathCache.set(projectName, importPath);
  }
}

function getProjectImportPath(
  tree: Tree,
  projectName: string,
  project: ProjectConfiguration,
): string | null {
  return projectImportPathCache.get(projectName) ?? null;
}
```

## Testing Requirements

⚠️ **MANDATORY: Running benchmark and stress tests is REQUIRED and must not be skipped.**

### Before Making Changes

1. **Run performance benchmarks:**
   ```bash
   npx nx e2e workspace-e2e --testPathPattern=performance-benchmark
   ```
   Record the baseline results, especially for batch operations.

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
   Compare results to baseline, especially for batch operations.

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

- Eliminates repeated tsconfig parsing and path matching
- Most beneficial when moving files across multiple projects
- Initialize table early in generator execution
- Clear cache at start of generator execution

## Acceptance Criteria

- [ ] Project import path lookup table is implemented
- [ ] Table is initialized at generator start
- [ ] All project import paths are precomputed
- [ ] Performance benchmarks run before changes (baseline recorded)
- [ ] Performance benchmarks run after changes (improvements documented)
- [ ] Stress tests run before changes (baseline recorded)
- [ ] Stress tests run after changes (improvements documented)
- [ ] All existing tests pass
- [ ] Code follows existing patterns and conventions
- [ ] Changes maintain backward compatibility
- [ ] Performance improvements are documented in a markdown file (e.g., `PERF_PROJECT_IMPORT_PATH_LOOKUP_RESULTS.md`)

## References

- [PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md](../PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md#10-project-import-path-lookup-table)
- [STRESS_TESTS_IMPLEMENTATION.md](../STRESS_TESTS_IMPLEMENTATION.md)
- [Move File Generator](../packages/workspace/src/generators/move-file/README.md)
