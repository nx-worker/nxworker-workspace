# Performance Optimization Suggestions for move-file Generator

## Overview

This document outlines potential performance optimization opportunities for the `@nxworker/workspace:move-file` generator. These suggestions build upon existing optimizations and focus on areas not yet addressed.

## Existing Optimizations (Reference)

The move-file generator currently implements:

1. **Glob Pattern Batching** - Single tree traversal for multiple glob patterns
2. **Pattern Analysis / File Tree Caching** - Per-project source file caching
3. **AST and Content Caching** - Cached AST parsing and content with parse failure tracking
4. **Smart File Cache** - File existence caching, incremental cache updates, TypeScript config caching

## Suggested Optimizations

### 1. Project Dependency Graph Caching

**Problem:** The generator calls `getDependentProjectNames()` and iterates through the project graph for each file move. In batch operations, this involves repeated graph traversal calculations.

**Proposed Solution:** Cache the project dependency relationships at the start of the generator execution:

```typescript
const dependencyGraphCache = new Map<string, Set<string>>();

function getCachedDependentProjects(
  projectGraph: ProjectGraph,
  projectName: string,
): Set<string> {
  if (dependencyGraphCache.has(projectName)) {
    return dependencyGraphCache.get(projectName)!;
  }

  const dependents = new Set(
    getDependentProjectNames(projectGraph, projectName),
  );
  dependencyGraphCache.set(projectName, dependents);
  return dependents;
}
```

**Expected Impact:**

- 5-10% improvement in batch operations with many projects
- Most beneficial when moving files across projects with complex dependency graphs
- Cache would be cleared at start of each generator execution

**Implementation Complexity:** Low

---

### 2. Import Specifier Pattern Precompilation

**Problem:** String operations in `updateImportSpecifierPattern` filter functions are executed repeatedly for each file. Operations like `removeSourceFileExtension()` and path normalization are computed multiple times for the same paths.

**Proposed Solution:** Precompute and cache the normalized source file paths before iterating through project files:

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
    removeSourceFileExtension(sourceFilePath),
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
        if (!specifier.startsWith('.')) {
          return false;
        }
        const importerDir = path.dirname(normalizedFilePath);
        const resolvedImport = path.join(importerDir, specifier);
        const normalizedResolvedImport = normalizePath(
          removeSourceFileExtension(resolvedImport),
        );
        return normalizedResolvedImport === normalizedSourceWithoutExt;
      },
      () => targetPackageAlias,
    );
  }
}
```

**Expected Impact:**

- 3-7% improvement in projects with many files
- Reduces redundant string operations and allocations
- Particularly effective for batch operations

**Implementation Complexity:** Low

---

### 3. Lazy Project Graph Resolution

**Problem:** The generator creates the full project graph (`await createProjectGraphAsync()`) at the start of every execution, even when moving files within the same project where the graph is not needed.

**Proposed Solution:** Defer project graph creation until it's actually needed:

```typescript
export async function moveFileGenerator(
  tree: Tree,
  options: MoveFileGeneratorSchema,
) {
  clearAllCaches();
  clearCache();

  const projects = getProjects(tree);
  let projectGraph: ProjectGraph | null = null;

  // Helper to lazily load project graph
  const getProjectGraph = async (): Promise<ProjectGraph> => {
    if (!projectGraph) {
      projectGraph = await createProjectGraphAsync();
    }
    return projectGraph;
  };

  // ... use getProjectGraph() only when needed
}
```

**Expected Impact:**

- 15-20% improvement for same-project moves
- Eliminates expensive graph computation when not needed
- No impact on cross-project moves (graph still computed when needed)

**Implementation Complexity:** Medium

---

### 4. Batched Import Update Operations

**Problem:** When moving multiple files, each file triggers separate `updateImportSpecifierPattern` calls on potentially overlapping sets of source files. Files can be parsed and modified multiple times in a single batch operation.

**Proposed Solution:** Batch import updates by collecting all changes first, then applying them in a single pass per file:

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

**Expected Impact:**

- 20-30% improvement when moving 10+ files in a batch
- Reduces file reads, parses, and writes
- Most effective in batch operations with overlapping file dependencies

**Implementation Complexity:** High

---

### 5. Path Resolution Memoization

**Problem:** Path operations like `path.dirname()`, `path.relative()`, `path.join()`, and `path.basename()` are called repeatedly with the same arguments throughout execution.

**Proposed Solution:** Implement a simple memoization layer for frequently-called path operations:

```typescript
const pathOperationCache = {
  dirname: new Map<string, string>(),
  basename: new Map<string, string>(),
  relative: new Map<string, string>(),
};

function memoizedDirname(filePath: string): string {
  let result = pathOperationCache.dirname.get(filePath);
  if (result === undefined) {
    result = path.dirname(filePath);
    pathOperationCache.dirname.set(filePath, result);
  }
  return result;
}

// Similar for basename, relative with composite keys
```

**Expected Impact:**

- 2-5% improvement in large workspaces
- Reduces redundant string allocations and operations
- Benefit scales with number of files processed

**Implementation Complexity:** Low

---

### 6. Early Exit on Empty Projects

**Problem:** The generator checks all projects for imports even when a project has no source files. Empty or nearly-empty projects still trigger cache population and iteration logic.

**Proposed Solution:** Add early exit checks for empty projects:

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

**Expected Impact:**

- 5-10% improvement in workspaces with many small/empty projects
- Reduces unnecessary tree traversal operations
- Most beneficial in monorepos with generated or placeholder projects

**Implementation Complexity:** Low

---

### 7. String Interning for Common Paths

**Problem:** Many path strings are created repeatedly (project roots, source roots, common directory names). These create memory pressure and comparison overhead.

**Proposed Solution:** Implement string interning for frequently-used path strings:

```typescript
const stringInternCache = new Map<string, string>();

function intern(str: string): string {
  let interned = stringInternCache.get(str);
  if (interned === undefined) {
    interned = str;
    stringInternCache.set(str, interned);
  }
  return interned;
}

// Use when storing paths in caches
function getProjectSourceFiles(tree: Tree, projectRoot: string): string[] {
  const internedRoot = intern(projectRoot);
  const cached = projectSourceFilesCache.get(internedRoot);
  // ...
}
```

**Expected Impact:**

- 1-3% improvement in large workspaces
- Reduces memory usage for path strings
- Enables faster string comparisons (reference equality)
- Most beneficial with many projects sharing common path segments

**Implementation Complexity:** Low

---

### 8. Incremental File Content Validation

**Problem:** The `mightContainImports()` and `mightContainSpecifier()` functions perform simple string searches, but still require reading file content. For files known to have no imports, this is wasted effort.

**Proposed Solution:** Cache import/export presence metadata:

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

**Expected Impact:**

- 5-8% improvement when checking imports across many files
- Reduces unnecessary AST parsing attempts
- Most effective in projects with many non-import files (types, constants, etc.)

**Implementation Complexity:** Medium

---

### 9. Optimized Relative Path Calculation

**Problem:** `getRelativeImportSpecifier()` is called repeatedly for the same file pairs. The function performs path resolution, extension removal, and relative path calculation each time.

**Proposed Solution:** Cache relative path calculations:

```typescript
const relativePathCache = new Map<string, string>();

function getCachedRelativeImportSpecifier(
  fromFile: string,
  toFile: string,
): string {
  const cacheKey = `${fromFile}|${toFile}`;

  let result = relativePathCache.get(cacheKey);
  if (result === undefined) {
    result = getRelativeImportSpecifier(fromFile, toFile);
    relativePathCache.set(cacheKey, result);
  }

  return result;
}
```

**Expected Impact:**

- 3-6% improvement in same-project moves
- Reduces redundant path calculations
- Particularly effective when many files import the same target

**Implementation Complexity:** Low

---

### 10. Project Import Path Lookup Table

**Problem:** `getProjectImportPath()` calls `readCompilerPaths()` and iterates through entries for each project, even though import paths are typically stable across a generator execution.

**Proposed Solution:** Build a project name to import path lookup table at initialization:

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

**Expected Impact:**

- 4-7% improvement in batch operations
- Eliminates repeated tsconfig parsing and path matching
- Most beneficial when moving files across multiple projects

**Implementation Complexity:** Medium

---

### 11. Targeted File Filtering

**Problem:** When searching for imports in dependent projects, all source files are checked even if they're unlikely to contain imports (e.g., type definition files, test files).

**Proposed Solution:** Implement heuristic filtering based on file types and patterns:

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

**Expected Impact:**

- 8-12% improvement in test-heavy projects
- Reduces number of files to process
- Configurable based on workspace conventions

**Implementation Complexity:** Low

---

### 12. Smart Index File Detection

**Problem:** `isFileExported()` reads and parses index files repeatedly when checking exports for multiple files from the same project.

**Proposed Solution:** Cache parsed index file export information:

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

**Expected Impact:**

- 6-10% improvement when moving multiple files from same project
- Eliminates repeated index file parsing
- Most effective in batch operations

**Implementation Complexity:** Medium

---

### 13. Bulk File Operations

**Problem:** Each file move triggers separate `tree.write()` and `tree.delete()` calls. Tree modifications could potentially be batched.

**Proposed Solution:** Collect file operations and apply them in optimized order:

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
  const writes = pendingFileOperations.filter((op) => op.type === 'write');
  const deletes = pendingFileOperations.filter((op) => op.type === 'delete');

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

**Expected Impact:**

- 5-8% improvement in batch operations
- May reduce virtual file system overhead
- Benefit depends on Nx Tree implementation details

**Implementation Complexity:** Medium

---

### 14. Conditional Formatting

**Problem:** `formatFiles(tree)` is called even when only a few files have changed. This reformats all files in the workspace.

**Proposed Solution:** Track modified files and format only those:

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

**Expected Impact:**

- 10-20% improvement in large workspaces
- Reduces formatting overhead significantly
- Most beneficial when moving files in large monorepos

**Implementation Complexity:** High (depends on available Nx APIs)

---

## Priority Recommendations

Based on expected impact and implementation complexity:

### High Priority (Quick Wins)

1. **Lazy Project Graph Resolution** - 15-20% improvement, medium complexity
2. **Project Import Path Lookup Table** - 4-7% improvement, medium complexity
3. **Import Specifier Pattern Precompilation** - 3-7% improvement, low complexity
4. **Early Exit on Empty Projects** - 5-10% improvement, low complexity

### Medium Priority (Good ROI)

5. **Project Dependency Graph Caching** - 5-10% improvement, low complexity
6. **Optimized Relative Path Calculation** - 3-6% improvement, low complexity
7. **Incremental File Content Validation** - 5-8% improvement, medium complexity
8. **Smart Index File Detection** - 6-10% improvement, medium complexity

### Lower Priority (Incremental Gains)

9. **Path Resolution Memoization** - 2-5% improvement, low complexity
10. **String Interning** - 1-3% improvement, low complexity
11. **Targeted File Filtering** - 8-12% improvement (in specific cases), low complexity

### Future Consideration

12. **Batched Import Update Operations** - 20-30% improvement, high complexity
13. **Bulk File Operations** - 5-8% improvement, medium complexity
14. **Conditional Formatting** - 10-20% improvement, high complexity

## Testing Strategy

For each optimization:

1. **Add benchmark tests** for the specific scenario the optimization targets
2. **Verify all existing tests pass** to ensure no regression
3. **Compare before/after performance** across all benchmark scenarios
4. **Document performance characteristics** in optimization-specific markdown files

## Compatibility Considerations

All suggested optimizations:

- Maintain backward compatibility with existing API
- Preserve existing error messages and behavior
- Follow the existing cache lifecycle pattern (clear at start, lazy load, invalidate on changes)
- Are non-breaking changes

## References

- [Glob Pattern Batching](./GLOB_OPTIMIZATION.md)
- [Pattern Analysis Optimization](./PATTERN_ANALYSIS_OPTIMIZATION.md)
- [AST-Based Performance Optimization](./INCREMENTAL_UPDATES_OPTIMIZATION.md)
- [Smart File Cache Optimization](./SMART_FILE_CACHE_OPTIMIZATION.md)
- [Move File Generator](./packages/workspace/src/generators/move-file/README.md)
