---
name: "Performance: Batched Import Update Operations"
about: Optimize performance by batching import updates in a single pass
title: "perf: implement batched import update operations"
labels: ["performance", "optimization"]
assignees: []
---

## Optimization Goal

**Batch import updates** by collecting all changes first, then applying them in a single pass per file.

## Problem Statement

When moving multiple files, each file triggers separate `updateImportSpecifierPattern` calls on potentially overlapping sets of source files. Files can be parsed and modified multiple times in a single batch operation.

**Expected Impact:** 20-30% improvement when moving 10+ files in a batch  
**Implementation Complexity:** High  
**Priority:** Future Consideration

## Proposed Solution

Batch import updates by collecting all changes first:

```typescript
interface ImportUpdate {
  filePath: string;
  oldSpecifier: string;
  newSpecifier: string;
}

const pendingImportUpdates = new Map<string, ImportUpdate[]>();

function scheduleImportUpdate(update: ImportUpdate): void {
  const updates = pendingImportUpdates.get(update.filePath) || [];
  updates.push(update);
  pendingImportUpdates.set(update.filePath, updates);
}

function flushImportUpdates(tree: Tree): void {
  for (const [filePath, updates] of pendingImportUpdates.entries()) {
    // Apply all updates to this file in a single pass
    updateMultipleImportSpecifiers(tree, filePath, updates);
  }
  pendingImportUpdates.clear();
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

- Reduces file reads, parses, and writes
- Most effective in batch operations with overlapping file dependencies
- Requires careful handling of update ordering
- May need to handle conflicting updates to the same import
- High complexity due to coordination of multiple updates

## Acceptance Criteria

- [ ] Batched import update operations are implemented
- [ ] Multiple updates to the same file are combined into single pass
- [ ] Performance benchmarks run before changes (baseline recorded)
- [ ] Performance benchmarks run after changes (improvements documented)
- [ ] Stress tests run before changes (baseline recorded)
- [ ] Stress tests run after changes (improvements documented)
- [ ] All existing tests pass, especially batch operation tests
- [ ] Code follows existing patterns and conventions
- [ ] Changes maintain backward compatibility
- [ ] Edge cases handled (conflicting updates, order dependencies)
- [ ] Performance improvements are documented in a markdown file (e.g., `PERF_BATCHED_IMPORT_UPDATES_RESULTS.md`)

## References

- [PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md](../PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md#4-batched-import-update-operations)
- [STRESS_TESTS_IMPLEMENTATION.md](../STRESS_TESTS_IMPLEMENTATION.md)
- [Move File Generator](../packages/workspace/src/generators/move-file/README.md)
