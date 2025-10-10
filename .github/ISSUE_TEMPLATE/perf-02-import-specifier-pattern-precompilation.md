---
name: "Performance: Import Specifier Pattern Precompilation"
about: Optimize performance by precompiling import specifier patterns
title: "perf: implement import specifier pattern precompilation"
labels: ["performance", "optimization"]
assignees: []
---

## Optimization Goal

**Precompute and cache normalized source file paths** before iterating through project files to reduce redundant string operations.

## Problem Statement

String operations in `updateImportSpecifierPattern` filter functions are executed repeatedly for each file. Operations like `removeSourceFileExtension()` and path normalization are computed multiple times for the same paths.

**Expected Impact:** 3-7% improvement in projects with many files  
**Implementation Complexity:** Low  
**Priority:** High (Quick Win)

## Proposed Solution

Precompute normalized values once before iteration:

```typescript
function updateImportPathsToPackageAlias(
  tree: Tree,
  project: ProjectConfiguration,
  sourceFilePath: string,
  targetPackageAlias: string,
  excludeFilePaths: string[] = [],
): void {
  // Precompute normalized values once
  const normalizedSourceWithoutExt = normalizePath(
    removeSourceFileExtension(sourceFilePath)
  );
  const excludeSet = new Set([sourceFilePath, ...excludeFilePaths]);
  
  const sourceFiles = getProjectSourceFiles(tree, project.root);

  for (const normalizedFilePath of sourceFiles) {
    if (excludeSet.has(normalizedFilePath)) {
      continue;
    }

    updateImportSpecifierPattern(
      tree,
      normalizedFilePath,
      (specifier) => {
        // Use precomputed values instead of recomputing
        // ...
      },
      () => targetPackageAlias,
    );
  }
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

- Reduces redundant string operations and allocations
- Particularly effective for batch operations
- Follow existing code patterns for string operations

## Acceptance Criteria

- [ ] Import specifier pattern precompilation is implemented
- [ ] Performance benchmarks run before changes (baseline recorded)
- [ ] Performance benchmarks run after changes (improvements documented)
- [ ] Stress tests run before changes (baseline recorded)
- [ ] Stress tests run after changes (improvements documented)
- [ ] All existing tests pass
- [ ] Code follows existing patterns and conventions
- [ ] Changes maintain backward compatibility
- [ ] Performance improvements are documented in a markdown file (e.g., `PERF_IMPORT_SPECIFIER_PRECOMPILATION_RESULTS.md`)

## References

- [PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md](../PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md#2-import-specifier-pattern-precompilation)
- [STRESS_TESTS_IMPLEMENTATION.md](../STRESS_TESTS_IMPLEMENTATION.md)
- [Move File Generator](../packages/workspace/src/generators/move-file/README.md)
