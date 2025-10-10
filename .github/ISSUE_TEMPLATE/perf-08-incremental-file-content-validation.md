---
name: "Performance: Incremental File Content Validation"
about: Optimize performance by caching import/export presence metadata
title: "perf: implement incremental file content validation"
labels: ["performance", "optimization"]
assignees: []
---

## Optimization Goal

**Cache import/export presence metadata** to avoid redundant file content validation when files are known to have no imports.

## Problem Statement

The `mightContainImports()` and `mightContainSpecifier()` functions perform simple string searches, but still require reading file content. For files known to have no imports, this is wasted effort.

**Expected Impact:** 5-8% improvement when checking imports across many files  
**Implementation Complexity:** Medium  
**Priority:** Medium (Good ROI)

## Proposed Solution

Cache import/export presence metadata:

```typescript
interface FileMetadata {
  hasImports: boolean;
  hasExports: boolean;
  knownSpecifiers: Set<string>;
}

const fileMetadataCache = new Map<string, FileMetadata>();

function getFileMetadata(tree: Tree, filePath: string): FileMetadata {
  const cached = fileMetadataCache.get(filePath);
  if (cached !== undefined) {
    return cached;
  }
  
  const content = astCache.getContent(tree, filePath);
  if (!content) {
    return { hasImports: false, hasExports: false, knownSpecifiers: new Set() };
  }
  
  const metadata: FileMetadata = {
    hasImports: content.includes('import') || content.includes('require'),
    hasExports: content.includes('export'),
    knownSpecifiers: extractSpecifiers(content),
  };
  
  fileMetadataCache.set(filePath, metadata);
  return metadata;
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

- Reduces unnecessary AST parsing attempts
- Most effective in projects with many non-import files (types, constants, etc.)
- Integrate with existing `astCache` infrastructure
- Consider cache invalidation when files change

## Acceptance Criteria

- [ ] File metadata caching is implemented
- [ ] Metadata includes hasImports, hasExports, and known specifiers
- [ ] Integration with existing cache infrastructure
- [ ] Performance benchmarks run before changes (baseline recorded)
- [ ] Performance benchmarks run after changes (improvements documented)
- [ ] Stress tests run before changes (baseline recorded)
- [ ] Stress tests run after changes (improvements documented)
- [ ] All existing tests pass
- [ ] Code follows existing patterns and conventions
- [ ] Changes maintain backward compatibility
- [ ] Performance improvements are documented in a markdown file (e.g., `PERF_FILE_CONTENT_VALIDATION_RESULTS.md`)

## References

- [PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md](../PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md#8-incremental-file-content-validation)
- [STRESS_TESTS_IMPLEMENTATION.md](../STRESS_TESTS_IMPLEMENTATION.md)
- [Move File Generator](../packages/workspace/src/generators/move-file/README.md)
