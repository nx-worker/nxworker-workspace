---
name: "Performance: Conditional Formatting"
about: Optimize performance by formatting only modified files
title: "perf: implement conditional formatting"
labels: ["performance", "optimization"]
assignees: []
---

## Optimization Goal

**Track modified files and format only those** instead of reformatting all files in the workspace.

## Problem Statement

`formatFiles(tree)` is called even when only a few files have changed. This reformats all files in the workspace.

**Expected Impact:** 10-20% improvement in large workspaces  
**Implementation Complexity:** High (depends on available Nx APIs)  
**Priority:** Future Consideration

## Proposed Solution

Track modified files and format only those:

```typescript
const modifiedFiles = new Set<string>();

function trackFileModification(filePath: string): void {
  modifiedFiles.add(filePath);
}

async function formatModifiedFiles(tree: Tree): Promise<void> {
  if (modifiedFiles.size === 0) {
    return;
  }
  
  // Format only modified files
  for (const filePath of modifiedFiles) {
    await formatFile(tree, filePath);
  }
  
  modifiedFiles.clear();
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

- Reduces formatting overhead significantly
- Most beneficial when moving files in large monorepos
- Requires investigation into available Nx formatting APIs
- May need to handle `skipFormat` option appropriately
- Consider edge cases where formatting affects other files

## Acceptance Criteria

- [ ] Modified file tracking is implemented
- [ ] Only modified files are formatted
- [ ] Integration with existing `skipFormat` option
- [ ] Available Nx APIs are properly utilized
- [ ] Performance benchmarks run before changes (baseline recorded)
- [ ] Performance benchmarks run after changes (improvements documented)
- [ ] Stress tests run before changes (baseline recorded)
- [ ] Stress tests run after changes (improvements documented)
- [ ] All existing tests pass
- [ ] Code follows existing patterns and conventions
- [ ] Changes maintain backward compatibility
- [ ] Performance improvements are documented in a markdown file (e.g., `PERF_CONDITIONAL_FORMATTING_RESULTS.md`)

## References

- [PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md](../PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md#14-conditional-formatting)
- [STRESS_TESTS_IMPLEMENTATION.md](../STRESS_TESTS_IMPLEMENTATION.md)
- [Move File Generator](../packages/workspace/src/generators/move-file/README.md)
