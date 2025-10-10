---
name: "Performance: Bulk File Operations"
about: Optimize performance by batching file write and delete operations
title: "perf: implement bulk file operations"
labels: ["performance", "optimization"]
assignees: []
---

## Optimization Goal

**Collect file operations and apply them in optimized order** to reduce virtual file system overhead.

## Problem Statement

Each file move triggers separate `tree.write()` and `tree.delete()` calls. Tree modifications could potentially be batched.

**Expected Impact:** 5-8% improvement in batch operations  
**Implementation Complexity:** Medium  
**Priority:** Future Consideration

## Proposed Solution

Collect file operations and apply them in optimized order:

```typescript
interface FileOperation {
  type: 'write' | 'delete';
  path: string;
  content?: string;
}

const pendingFileOperations: FileOperation[] = [];

function scheduleFileWrite(path: string, content: string): void {
  pendingFileOperations.push({ type: 'write', path, content });
}

function scheduleFileDelete(path: string): void {
  pendingFileOperations.push({ type: 'delete', path });
}

function applyFileOperations(tree: Tree): void {
  // Group operations by type for better performance
  const writes = pendingFileOperations.filter(op => op.type === 'write');
  const deletes = pendingFileOperations.filter(op => op.type === 'delete');
  
  // Apply all writes first
  for (const op of writes) {
    tree.write(op.path, op.content!);
  }
  
  // Then apply deletes
  for (const op of deletes) {
    tree.delete(op.path);
  }
  
  pendingFileOperations.length = 0;
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

- May reduce virtual file system overhead
- Benefit depends on Nx Tree implementation details
- Ensure operations are applied in correct order to avoid conflicts
- Consider error handling for failed operations

## Acceptance Criteria

- [ ] Bulk file operations are implemented
- [ ] Operations are grouped by type (writes, deletes)
- [ ] Operations are applied in correct order
- [ ] Error handling for failed operations
- [ ] Performance benchmarks run before changes (baseline recorded)
- [ ] Performance benchmarks run after changes (improvements documented)
- [ ] Stress tests run before changes (baseline recorded)
- [ ] Stress tests run after changes (improvements documented)
- [ ] All existing tests pass
- [ ] Code follows existing patterns and conventions
- [ ] Changes maintain backward compatibility
- [ ] Performance improvements are documented in a markdown file (e.g., `PERF_BULK_FILE_OPERATIONS_RESULTS.md`)

## References

- [PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md](../PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md#13-bulk-file-operations)
- [STRESS_TESTS_IMPLEMENTATION.md](../STRESS_TESTS_IMPLEMENTATION.md)
- [Move File Generator](../packages/workspace/src/generators/move-file/README.md)
