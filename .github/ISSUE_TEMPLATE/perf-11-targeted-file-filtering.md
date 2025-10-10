---
name: "Performance: Targeted File Filtering"
about: Optimize performance by filtering out unlikely import-containing files
title: "perf: implement targeted file filtering"
labels: ["performance", "optimization"]
assignees: []
---

## Optimization Goal

**Implement heuristic filtering** based on file types and patterns to skip files unlikely to contain imports.

## Problem Statement

When searching for imports in dependent projects, all source files are checked even if they're unlikely to contain imports (e.g., type definition files, test files).

**Expected Impact:** 8-12% improvement in test-heavy projects  
**Implementation Complexity:** Low  
**Priority:** Lower (Incremental Gains)

## Proposed Solution

Implement heuristic filtering based on file types and patterns:

```typescript
function shouldCheckFileForImports(filePath: string): boolean {
  // Skip test files
  if (filePath.includes('.spec.') || filePath.includes('.test.')) {
    return false;
  }
  
  // Skip type definition files
  if (filePath.endsWith('.d.ts')) {
    return false;
  }
  
  // Skip files in test directories
  if (filePath.includes('/test/') || filePath.includes('/__tests__/')) {
    return false;
  }
  
  return true;
}

function getProjectSourceFiles(tree: Tree, projectRoot: string): string[] {
  // ... existing code ...
  
  visitNotIgnoredFiles(tree, projectRoot, (filePath) => {
    if (sourceFileExtensions.some((ext) => filePath.endsWith(ext))) {
      if (shouldCheckFileForImports(filePath)) {
        sourceFiles.push(normalizePath(filePath));
      }
    }
  });
  
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

- Reduces number of files to process
- Configurable based on workspace conventions
- Consider edge cases where test files do need to be updated
- Make filtering rules conservative to avoid missing legitimate updates

## Acceptance Criteria

- [ ] Targeted file filtering is implemented
- [ ] Filtering rules cover test files, type definitions, and test directories
- [ ] Rules are conservative to avoid missing legitimate updates
- [ ] Performance benchmarks run before changes (baseline recorded)
- [ ] Performance benchmarks run after changes (improvements documented)
- [ ] Stress tests run before changes (baseline recorded)
- [ ] Stress tests run after changes (improvements documented)
- [ ] All existing tests pass
- [ ] Code follows existing patterns and conventions
- [ ] Changes maintain backward compatibility
- [ ] Performance improvements are documented in a markdown file (e.g., `PERF_TARGETED_FILE_FILTERING_RESULTS.md`)

## References

- [PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md](../PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md#11-targeted-file-filtering)
- [STRESS_TESTS_IMPLEMENTATION.md](../STRESS_TESTS_IMPLEMENTATION.md)
- [Move File Generator](../packages/workspace/src/generators/move-file/README.md)
