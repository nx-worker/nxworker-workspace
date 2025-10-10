---
name: "Performance: Smart Index File Detection"
about: Optimize performance by caching parsed index file export information
title: "perf: implement smart index file detection"
labels: ["performance", "optimization"]
assignees: []
---

## Optimization Goal

**Cache parsed index file export information** to avoid repeatedly reading and parsing index files when checking exports.

## Problem Statement

`isFileExported()` reads and parses index files repeatedly when checking exports for multiple files from the same project.

**Expected Impact:** 6-10% improvement when moving multiple files from same project  
**Implementation Complexity:** Medium  
**Priority:** Medium (Good ROI)

## Proposed Solution

Cache parsed index file export information:

```typescript
interface IndexExports {
  exports: Set<string>;
  reexports: Set<string>;
}

const indexExportsCache = new Map<string, IndexExports>();

function getIndexExports(tree: Tree, indexPath: string): IndexExports {
  const cached = indexExportsCache.get(indexPath);
  if (cached !== undefined) {
    return cached;
  }
  
  const exports = new Set<string>();
  const reexports = new Set<string>();
  
  const ast = astCache.getAST(tree, indexPath);
  if (ast) {
    // Parse and extract all exports
    // ... parsing logic ...
  }
  
  const result = { exports, reexports };
  indexExportsCache.set(indexPath, result);
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
   Record the baseline results, especially for multiple file operations.

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
   Compare results to baseline, especially for multiple file operations.

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

- Eliminates repeated index file parsing
- Most effective in batch operations
- Integrate with existing `astCache` infrastructure
- Consider cache invalidation when index files change

## Acceptance Criteria

- [ ] Index file export caching is implemented
- [ ] Cache includes both direct exports and re-exports
- [ ] Integration with existing AST cache infrastructure
- [ ] Performance benchmarks run before changes (baseline recorded)
- [ ] Performance benchmarks run after changes (improvements documented)
- [ ] Stress tests run before changes (baseline recorded)
- [ ] Stress tests run after changes (improvements documented)
- [ ] All existing tests pass
- [ ] Code follows existing patterns and conventions
- [ ] Changes maintain backward compatibility
- [ ] Performance improvements are documented in a markdown file (e.g., `PERF_INDEX_FILE_DETECTION_RESULTS.md`)

## References

- [PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md](../PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md#12-smart-index-file-detection)
- [STRESS_TESTS_IMPLEMENTATION.md](../STRESS_TESTS_IMPLEMENTATION.md)
- [Move File Generator](../packages/workspace/src/generators/move-file/README.md)
