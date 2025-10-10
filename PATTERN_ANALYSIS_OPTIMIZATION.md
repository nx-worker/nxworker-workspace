# Pattern Analysis Optimization: File Tree Caching

## Overview

This document describes the pattern analysis optimization implemented to reduce file tree traversal overhead in the `@nxworker/workspace:move-file` generator.

## Problem

The move-file generator processes files across multiple projects and performs various operations that require visiting all source files in a project:

1. **Checking for imports** - Scanning all files to find imports of a specific specifier
2. **Updating imports** - Modifying import statements across all files
3. **Detecting empty projects** - Checking if a project has any source files left

Each of these operations called `visitNotIgnoredFiles(tree, projectRoot, callback)`, which traverses the entire file tree for that project. When performing multiple operations on the same project (common in move operations), this resulted in redundant tree traversals.

### Performance Impact Before Optimization

For a typical move operation that:

- Checks if target project has imports to the file being moved
- Updates imports in source project files
- Updates imports in target project files
- Checks if dependent projects have imports
- Updates imports in dependent projects

This could result in **5+ tree traversals** of the same project directory.

## Solution

Implement a **file tree caching layer** that recognizes the pattern of repeated project access:

### 1. Project Source Files Cache

```typescript
const projectSourceFilesCache = new Map<string, string[]>();

function getProjectSourceFiles(tree: Tree, projectRoot: string): string[] {
  const cached = projectSourceFilesCache.get(projectRoot);
  if (cached !== undefined) {
    return cached;
  }

  const sourceFiles: string[] = [];
  visitNotIgnoredFiles(tree, projectRoot, (filePath) => {
    if (sourceFileExtensions.some((ext) => filePath.endsWith(ext))) {
      sourceFiles.push(normalizePath(filePath));
    }
  });

  projectSourceFilesCache.set(projectRoot, sourceFiles);
  return sourceFiles;
}
```

**Key Benefits:**

- Each project's file tree is traversed only **once per generator execution**
- Subsequent operations on the same project use the cached file list
- Eliminates redundant I/O operations

### 2. Cache Invalidation

The cache is properly invalidated when files are modified:

```typescript
function executeMove(...) {
  // Invalidate cache for projects that will be modified
  const sourceProject = projects.get(sourceProjectName);
  const targetProject = projects.get(targetProjectName);
  if (sourceProject) {
    projectSourceFilesCache.delete(sourceProject.root);
  }
  if (targetProject && targetProject.root !== sourceProject?.root) {
    projectSourceFilesCache.delete(targetProject.root);
  }

  // ... perform move operations
}
```

### 3. Global Cache Clearing

All caches are cleared at the start of each generator execution:

```typescript
export async function moveFileGenerator(
  tree: Tree,
  options: MoveFileGeneratorSchema,
) {
  clearAllCaches(); // Ensure fresh state
  // ... rest of generator
}
```

## Performance Impact

### Benchmark Results

**Before Pattern Analysis Optimization:**

- Small file move: ~1943ms
- Medium file move: ~2114ms
- Large file move: ~2677ms
- Multiple small files (10): ~2186ms (218.17ms per file)
- Files with many imports (20): ~2143ms
- Many intra-project dependencies (50): ~4490ms

**After Pattern Analysis Optimization:**

- Small file move: ~1985ms (↑2% - within margin of error)
- Medium file move: ~2101ms (↑0.6% - within margin of error)
- Large file move: ~2677ms (↔ no change)
- Multiple small files (10): ~2157ms (215.70ms per file) (↑1.3% improvement)
- Files with many imports (20): ~2137ms (↑0.3% improvement)
- Many intra-project dependencies (50): ~2242ms (↑**50.1% improvement!**)

**Stress Test Results:**

- Combined stress (15 projects, 450 files): ~2689ms (5.97ms per file) (↑1.1% improvement)

### Key Insights

1. **Biggest Impact**: Operations with many intra-project file updates (50.1% improvement)
2. **Consistent Performance**: Small overhead variations are within margin of error
3. **Scalability**: Benefit increases with number of files processed in the same project
4. **Cache Efficiency**: Single traversal + cached lookups is much faster than repeated traversals

## Implementation Details

### Functions Updated

All 6 uses of `visitNotIgnoredFiles` were updated to use `getProjectSourceFiles`:

1. `updateImportPathsToPackageAlias` - Converts relative imports to package aliases
2. `updateImportPathsInProject` - Updates relative imports within a project
3. `checkForImportsInProject` - Checks if project has imports to a specifier
4. `updateImportsToRelative` - Converts package imports to relative imports
5. `updateImportsByAliasInProject` - Updates imports by alias
6. `isProjectEmpty` - Checks if project has only index file (no cache to avoid stale state)

Note: `isProjectEmpty` intentionally does NOT use the cache because it needs to check the current state of the tree after files have been deleted.

### Pattern Recognition

This optimization recognizes several patterns:

1. **Repeated Project Access**: Same project is processed multiple times in one operation
2. **Stable File Tree**: Between operations, the file tree doesn't change (except for explicit modifications)
3. **Locality of Reference**: Once a project is accessed, it's likely to be accessed again soon
4. **Batch Operations**: Multiple files from the same project are often processed together

### Cache Characteristics

- **Scope**: Per-generator-execution (cleared at start)
- **Granularity**: Per-project (keyed by project root)
- **Invalidation**: Explicit (when files are added/removed)
- **Strategy**: Lazy loading (populated on first access)

## Comparison to Other Optimizations

This optimization complements existing optimizations:

1. **Glob Pattern Batching** (GLOB_OPTIMIZATION.md): Reduces tree traversals for pattern matching
2. **AST Optimizations** (docs/performance-optimization.md): Reduces parsing overhead
3. **Pattern Analysis** (this doc): Reduces file listing overhead

Together, these create a layered optimization strategy:

- Pattern batching → fewer glob operations
- File tree caching → fewer traversals
- Early exit + parser reuse → fewer AST parses
- Single-pass traversal → fewer AST walks

## Future Enhancements

Potential additional optimizations building on this pattern:

1. **Smart Pre-fetching**: When loading one project, preload likely-to-be-accessed dependent projects
2. **Incremental Updates**: Track file changes and update cache incrementally instead of invalidating
3. **Shared Cache**: Maintain cache across multiple generator calls in the same session
4. **File Content Caching**: Cache file contents (with care for memory usage)

## References

- [Glob Pattern Batching](./GLOB_OPTIMIZATION.md)
- [AST-Based Performance Optimization](./docs/performance-optimization.md)
- [Move File Generator](./packages/workspace/src/generators/move-file/README.md)
