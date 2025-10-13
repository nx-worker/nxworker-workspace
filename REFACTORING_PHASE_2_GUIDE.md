# Refactoring Phase 2: Extract Cache Functions

## Overview

This document provides a detailed implementation guide for Phase 2 of the refactoring plan. Phase 2 focuses on extracting cache-related functions from `generator.ts` into a dedicated `cache/` directory.

## Goals

- Extract all cache functions to `cache/` directory
- Create unit tests for each cache function
- One function per file (or tightly related functions)
- Update imports in `generator.ts`
- Zero functional changes
- Maintain all existing test coverage

## Prerequisites

✅ Phase 1 must be complete:

- `constants/file-extensions.ts` created
- `types/move-context.ts` created
- All Phase 1 tests passing

## Cache Functions to Extract

Phase 2 extracts 6 cache-related functions:

1. **clearAllCaches** - Clears all cache instances
2. **cachedTreeExists** - Cached wrapper for tree.exists()
3. **getProjectSourceFiles** - Gets source files with caching
4. **updateProjectSourceFilesCache** - Updates cache incrementally
5. **updateFileExistenceCache** - Updates file existence cache
6. **getCachedDependentProjects** - Gets dependent projects with caching

## Cache State Management

The cache state variables will remain in `generator.ts` as module-level variables:

```typescript
const projectSourceFilesCache = new Map<string, string[]>();
const fileExistenceCache = new Map<string, boolean>();
let compilerPathsCache: Record<string, unknown> | null | undefined = undefined;
const dependencyGraphCache = new Map<string, Set<string>>();
```

These will be accessed by the cache functions via closures.

## Tasks

### Task 2.1: Create `cache/clear-all-caches.ts`

**File**: `packages/workspace/src/generators/move-file/cache/clear-all-caches.ts`

```typescript
import { treeReadCache } from '../tree-cache';

/**
 * Clears all caches. Should be called when starting a new generator operation
 * to ensure fresh state.
 *
 * This function clears:
 * - Project source files cache
 * - File existence cache
 * - Compiler paths cache
 * - Tree read cache
 * - Dependency graph cache
 *
 * @param projectSourceFilesCache - Cache for source files per project
 * @param fileExistenceCache - Cache for file existence checks
 * @param compilerPathsCache - Cache for TypeScript compiler paths (pass by ref wrapper)
 * @param dependencyGraphCache - Cache for dependent project lookups
 */
export function clearAllCaches(
  projectSourceFilesCache: Map<string, string[]>,
  fileExistenceCache: Map<string, boolean>,
  compilerPathsCache: { value: Record<string, unknown> | null | undefined },
  dependencyGraphCache: Map<string, Set<string>>,
): void {
  projectSourceFilesCache.clear();
  fileExistenceCache.clear();
  compilerPathsCache.value = undefined;
  treeReadCache.clear();
  dependencyGraphCache.clear();
}
```

### Task 2.2: Create `cache/clear-all-caches.spec.ts`

**File**: `packages/workspace/src/generators/move-file/cache/clear-all-caches.spec.ts`

```typescript
import { clearAllCaches } from './clear-all-caches';
import { treeReadCache } from '../tree-cache';

// Mock the tree-cache module
jest.mock('../tree-cache', () => ({
  treeReadCache: {
    clear: jest.fn(),
  },
}));

describe('clearAllCaches', () => {
  let projectSourceFilesCache: Map<string, string[]>;
  let fileExistenceCache: Map<string, boolean>;
  let compilerPathsCache: { value: Record<string, unknown> | null | undefined };
  let dependencyGraphCache: Map<string, Set<string>>;

  beforeEach(() => {
    projectSourceFilesCache = new Map([
      ['project1', ['file1.ts', 'file2.ts']],
      ['project2', ['file3.ts']],
    ]);
    fileExistenceCache = new Map([
      ['file1.ts', true],
      ['file2.ts', false],
    ]);
    compilerPathsCache = { value: { '@lib/*': ['libs/lib/src/*'] } };
    dependencyGraphCache = new Map([
      ['project1', new Set(['project2', 'project3'])],
    ]);

    // Clear mock calls
    jest.clearAllMocks();
  });

  it('should clear all cache instances', () => {
    clearAllCaches(
      projectSourceFilesCache,
      fileExistenceCache,
      compilerPathsCache,
      dependencyGraphCache,
    );

    expect(projectSourceFilesCache.size).toBe(0);
    expect(fileExistenceCache.size).toBe(0);
    expect(compilerPathsCache.value).toBeUndefined();
    expect(dependencyGraphCache.size).toBe(0);
  });

  it('should clear tree read cache', () => {
    clearAllCaches(
      projectSourceFilesCache,
      fileExistenceCache,
      compilerPathsCache,
      dependencyGraphCache,
    );

    expect(treeReadCache.clear).toHaveBeenCalledTimes(1);
  });

  it('should handle already empty caches', () => {
    projectSourceFilesCache.clear();
    fileExistenceCache.clear();
    compilerPathsCache.value = undefined;
    dependencyGraphCache.clear();

    expect(() =>
      clearAllCaches(
        projectSourceFilesCache,
        fileExistenceCache,
        compilerPathsCache,
        dependencyGraphCache,
      ),
    ).not.toThrow();

    expect(projectSourceFilesCache.size).toBe(0);
    expect(fileExistenceCache.size).toBe(0);
  });

  it('should reset compiler paths cache to undefined (not null)', () => {
    compilerPathsCache.value = null;

    clearAllCaches(
      projectSourceFilesCache,
      fileExistenceCache,
      compilerPathsCache,
      dependencyGraphCache,
    );

    expect(compilerPathsCache.value).toBeUndefined();
    expect(compilerPathsCache.value).not.toBeNull();
  });
});
```

### Task 2.3: Create `cache/cached-tree-exists.ts`

**File**: `packages/workspace/src/generators/move-file/cache/cached-tree-exists.ts`

```typescript
import type { Tree } from '@nx/devkit';

/**
 * Cached wrapper for tree.exists() to avoid redundant file system checks.
 *
 * This function uses a cache to store the results of tree.exists() calls,
 * which can significantly reduce file system overhead when checking the same
 * files multiple times during a move operation.
 *
 * @param tree - The virtual file system tree
 * @param filePath - Path to check for existence
 * @param fileExistenceCache - Cache for file existence checks
 * @returns True if file exists, false otherwise
 */
export function cachedTreeExists(
  tree: Tree,
  filePath: string,
  fileExistenceCache: Map<string, boolean>,
): boolean {
  const cached = fileExistenceCache.get(filePath);
  if (cached !== undefined) {
    return cached;
  }

  const exists = tree.exists(filePath);
  fileExistenceCache.set(filePath, exists);
  return exists;
}
```

### Task 2.4: Create `cache/cached-tree-exists.spec.ts`

**File**: `packages/workspace/src/generators/move-file/cache/cached-tree-exists.spec.ts`

```typescript
import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { cachedTreeExists } from './cached-tree-exists';

describe('cachedTreeExists', () => {
  let tree: Tree;
  let fileExistenceCache: Map<string, boolean>;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    fileExistenceCache = new Map();
  });

  it('should return true for existing file', () => {
    tree.write('test.ts', 'content');

    const result = cachedTreeExists(tree, 'test.ts', fileExistenceCache);

    expect(result).toBe(true);
  });

  it('should return false for non-existing file', () => {
    const result = cachedTreeExists(tree, 'missing.ts', fileExistenceCache);

    expect(result).toBe(false);
  });

  it('should cache the result and not call tree.exists() again', () => {
    tree.write('test.ts', 'content');
    const existsSpy = jest.spyOn(tree, 'exists');

    // First call
    const result1 = cachedTreeExists(tree, 'test.ts', fileExistenceCache);
    expect(result1).toBe(true);
    expect(existsSpy).toHaveBeenCalledTimes(1);

    // Second call should use cache
    const result2 = cachedTreeExists(tree, 'test.ts', fileExistenceCache);
    expect(result2).toBe(true);
    expect(existsSpy).toHaveBeenCalledTimes(1); // Still 1, not 2

    existsSpy.mockRestore();
  });

  it('should cache false results', () => {
    const existsSpy = jest.spyOn(tree, 'exists');

    // First call
    const result1 = cachedTreeExists(tree, 'missing.ts', fileExistenceCache);
    expect(result1).toBe(false);
    expect(existsSpy).toHaveBeenCalledTimes(1);

    // Second call should use cache
    const result2 = cachedTreeExists(tree, 'missing.ts', fileExistenceCache);
    expect(result2).toBe(false);
    expect(existsSpy).toHaveBeenCalledTimes(1);

    existsSpy.mockRestore();
  });

  it('should handle multiple files independently', () => {
    tree.write('file1.ts', 'content');

    const result1 = cachedTreeExists(tree, 'file1.ts', fileExistenceCache);
    const result2 = cachedTreeExists(tree, 'file2.ts', fileExistenceCache);
    const result3 = cachedTreeExists(tree, 'file1.ts', fileExistenceCache);

    expect(result1).toBe(true);
    expect(result2).toBe(false);
    expect(result3).toBe(true);
    expect(fileExistenceCache.size).toBe(2);
  });

  it('should use pre-populated cache values', () => {
    fileExistenceCache.set('test.ts', true);
    const existsSpy = jest.spyOn(tree, 'exists');

    const result = cachedTreeExists(tree, 'test.ts', fileExistenceCache);

    expect(result).toBe(true);
    expect(existsSpy).not.toHaveBeenCalled();

    existsSpy.mockRestore();
  });
});
```

### Task 2.5: Create `cache/get-project-source-files.ts`

**File**: `packages/workspace/src/generators/move-file/cache/get-project-source-files.ts`

```typescript
import { Tree, visitNotIgnoredFiles, normalizePath } from '@nx/devkit';
import { sourceFileExtensions } from '../constants/file-extensions';
import { cachedTreeExists } from './cached-tree-exists';

/**
 * Gets all source files in a project with caching to avoid repeated traversals.
 *
 * This function uses a cache to store the list of source files per project,
 * which can significantly improve performance when the same project is
 * accessed multiple times during a move operation.
 *
 * The cache is populated by traversing the project directory and filtering
 * for files with supported source file extensions.
 *
 * @param tree - The virtual file system tree
 * @param projectRoot - Root path of the project
 * @param projectSourceFilesCache - Cache for source files per project
 * @param fileExistenceCache - Cache for file existence checks
 * @returns Array of source file paths
 */
export function getProjectSourceFiles(
  tree: Tree,
  projectRoot: string,
  projectSourceFilesCache: Map<string, string[]>,
  fileExistenceCache: Map<string, boolean>,
): string[] {
  const cached = projectSourceFilesCache.get(projectRoot);
  if (cached !== undefined) {
    return cached;
  }

  const sourceFiles: string[] = [];

  // Early exit: check if project directory exists to avoid traversal overhead
  if (!cachedTreeExists(tree, projectRoot, fileExistenceCache)) {
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

### Task 2.6: Create `cache/get-project-source-files.spec.ts`

**File**: `packages/workspace/src/generators/move-file/cache/get-project-source-files.spec.ts`

```typescript
import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { getProjectSourceFiles } from './get-project-source-files';

describe('getProjectSourceFiles', () => {
  let tree: Tree;
  let projectSourceFilesCache: Map<string, string[]>;
  let fileExistenceCache: Map<string, boolean>;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    projectSourceFilesCache = new Map();
    fileExistenceCache = new Map();
  });

  it('should return empty array for non-existent project', () => {
    const result = getProjectSourceFiles(
      tree,
      'libs/missing',
      projectSourceFilesCache,
      fileExistenceCache,
    );

    expect(result).toEqual([]);
  });

  it('should find TypeScript files', () => {
    tree.write('libs/mylib/src/index.ts', 'export {}');
    tree.write('libs/mylib/src/util.ts', 'export {}');

    const result = getProjectSourceFiles(
      tree,
      'libs/mylib',
      projectSourceFilesCache,
      fileExistenceCache,
    );

    expect(result).toContain('libs/mylib/src/index.ts');
    expect(result).toContain('libs/mylib/src/util.ts');
    expect(result).toHaveLength(2);
  });

  it('should find JavaScript files', () => {
    tree.write('libs/mylib/src/index.js', 'export {}');
    tree.write('libs/mylib/src/util.jsx', 'export {}');

    const result = getProjectSourceFiles(
      tree,
      'libs/mylib',
      projectSourceFilesCache,
      fileExistenceCache,
    );

    expect(result).toContain('libs/mylib/src/index.js');
    expect(result).toContain('libs/mylib/src/util.jsx');
  });

  it('should find ESM-specific files', () => {
    tree.write('libs/mylib/src/index.mts', 'export {}');
    tree.write('libs/mylib/src/util.mjs', 'export {}');
    tree.write('libs/mylib/src/types.cts', 'export {}');
    tree.write('libs/mylib/src/config.cjs', 'export {}');

    const result = getProjectSourceFiles(
      tree,
      'libs/mylib',
      projectSourceFilesCache,
      fileExistenceCache,
    );

    expect(result).toContain('libs/mylib/src/index.mts');
    expect(result).toContain('libs/mylib/src/util.mjs');
    expect(result).toContain('libs/mylib/src/types.cts');
    expect(result).toContain('libs/mylib/src/config.cjs');
  });

  it('should ignore non-source files', () => {
    tree.write('libs/mylib/src/index.ts', 'export {}');
    tree.write('libs/mylib/README.md', '# README');
    tree.write('libs/mylib/package.json', '{}');
    tree.write('libs/mylib/.gitignore', '');

    const result = getProjectSourceFiles(
      tree,
      'libs/mylib',
      projectSourceFilesCache,
      fileExistenceCache,
    );

    expect(result).toContain('libs/mylib/src/index.ts');
    expect(result).not.toContain('libs/mylib/README.md');
    expect(result).not.toContain('libs/mylib/package.json');
    expect(result).not.toContain('libs/mylib/.gitignore');
  });

  it('should cache results and not traverse again', () => {
    tree.write('libs/mylib/src/index.ts', 'export {}');
    tree.write('libs/mylib/src/util.ts', 'export {}');

    // First call
    const result1 = getProjectSourceFiles(
      tree,
      'libs/mylib',
      projectSourceFilesCache,
      fileExistenceCache,
    );

    expect(result1).toHaveLength(2);
    expect(projectSourceFilesCache.has('libs/mylib')).toBe(true);

    // Add another file after caching
    tree.write('libs/mylib/src/new.ts', 'export {}');

    // Second call should return cached result (without new.ts)
    const result2 = getProjectSourceFiles(
      tree,
      'libs/mylib',
      projectSourceFilesCache,
      fileExistenceCache,
    );

    expect(result2).toHaveLength(2);
    expect(result2).not.toContain('libs/mylib/src/new.ts');
  });

  it('should normalize paths', () => {
    tree.write('libs/mylib/src/index.ts', 'export {}');

    const result = getProjectSourceFiles(
      tree,
      'libs/mylib',
      projectSourceFilesCache,
      fileExistenceCache,
    );

    // All paths should be normalized (no backslashes on Windows)
    result.forEach((path) => {
      expect(path).not.toContain('\\');
    });
  });

  it('should handle empty projects', () => {
    tree.write('libs/emptylib/.gitkeep', '');

    const result = getProjectSourceFiles(
      tree,
      'libs/emptylib',
      projectSourceFilesCache,
      fileExistenceCache,
    );

    expect(result).toEqual([]);
    expect(projectSourceFilesCache.get('libs/emptylib')).toEqual([]);
  });

  it('should handle nested directories', () => {
    tree.write('libs/mylib/src/features/feature1.ts', 'export {}');
    tree.write('libs/mylib/src/utils/helper.ts', 'export {}');

    const result = getProjectSourceFiles(
      tree,
      'libs/mylib',
      projectSourceFilesCache,
      fileExistenceCache,
    );

    expect(result).toContain('libs/mylib/src/features/feature1.ts');
    expect(result).toContain('libs/mylib/src/utils/helper.ts');
  });
});
```

### Task 2.7: Create `cache/update-project-source-files-cache.ts`

**File**: `packages/workspace/src/generators/move-file/cache/update-project-source-files-cache.ts`

```typescript
/**
 * Updates the project source files cache incrementally when a file is moved.
 * This is more efficient than invalidating and re-scanning the entire project.
 *
 * @param projectRoot - Root path of the project
 * @param oldPath - Path of the file being moved
 * @param newPath - New path of the file (or null if file is being removed from project)
 * @param projectSourceFilesCache - Cache for source files per project
 */
export function updateProjectSourceFilesCache(
  projectRoot: string,
  oldPath: string,
  newPath: string | null,
  projectSourceFilesCache: Map<string, string[]>,
): void {
  const cached = projectSourceFilesCache.get(projectRoot);
  if (!cached) {
    return; // Cache doesn't exist for this project, nothing to update
  }

  // Remove old path
  const oldIndex = cached.indexOf(oldPath);
  if (oldIndex !== -1) {
    cached.splice(oldIndex, 1);
  }

  // Add new path if it's still in this project
  if (newPath && newPath.startsWith(projectRoot + '/')) {
    cached.push(newPath);
  }
}
```

### Task 2.8: Create `cache/update-project-source-files-cache.spec.ts`

**File**: `packages/workspace/src/generators/move-file/cache/update-project-source-files-cache.spec.ts`

```typescript
import { updateProjectSourceFilesCache } from './update-project-source-files-cache';

describe('updateProjectSourceFilesCache', () => {
  let projectSourceFilesCache: Map<string, string[]>;

  beforeEach(() => {
    projectSourceFilesCache = new Map();
  });

  it('should do nothing if cache does not exist for project', () => {
    updateProjectSourceFilesCache(
      'libs/mylib',
      'libs/mylib/src/old.ts',
      'libs/mylib/src/new.ts',
      projectSourceFilesCache,
    );

    expect(projectSourceFilesCache.size).toBe(0);
  });

  it('should remove old path and add new path', () => {
    projectSourceFilesCache.set('libs/mylib', [
      'libs/mylib/src/index.ts',
      'libs/mylib/src/old.ts',
      'libs/mylib/src/util.ts',
    ]);

    updateProjectSourceFilesCache(
      'libs/mylib',
      'libs/mylib/src/old.ts',
      'libs/mylib/src/new.ts',
      projectSourceFilesCache,
    );

    const cached = projectSourceFilesCache.get('libs/mylib');
    expect(cached).toContain('libs/mylib/src/new.ts');
    expect(cached).not.toContain('libs/mylib/src/old.ts');
    expect(cached).toHaveLength(3);
  });

  it('should only remove old path if newPath is null', () => {
    projectSourceFilesCache.set('libs/mylib', [
      'libs/mylib/src/index.ts',
      'libs/mylib/src/old.ts',
    ]);

    updateProjectSourceFilesCache(
      'libs/mylib',
      'libs/mylib/src/old.ts',
      null,
      projectSourceFilesCache,
    );

    const cached = projectSourceFilesCache.get('libs/mylib');
    expect(cached).not.toContain('libs/mylib/src/old.ts');
    expect(cached).toHaveLength(1);
  });

  it('should not add new path if it is in a different project', () => {
    projectSourceFilesCache.set('libs/mylib', ['libs/mylib/src/old.ts']);

    updateProjectSourceFilesCache(
      'libs/mylib',
      'libs/mylib/src/old.ts',
      'libs/otherlib/src/new.ts',
      projectSourceFilesCache,
    );

    const cached = projectSourceFilesCache.get('libs/mylib');
    expect(cached).not.toContain('libs/mylib/src/old.ts');
    expect(cached).not.toContain('libs/otherlib/src/new.ts');
    expect(cached).toHaveLength(0);
  });

  it('should handle old path not being in cache', () => {
    projectSourceFilesCache.set('libs/mylib', ['libs/mylib/src/index.ts']);

    updateProjectSourceFilesCache(
      'libs/mylib',
      'libs/mylib/src/missing.ts',
      'libs/mylib/src/new.ts',
      projectSourceFilesCache,
    );

    const cached = projectSourceFilesCache.get('libs/mylib');
    expect(cached).toContain('libs/mylib/src/new.ts');
    expect(cached).toHaveLength(2);
  });

  it('should preserve other files in cache', () => {
    projectSourceFilesCache.set('libs/mylib', [
      'libs/mylib/src/index.ts',
      'libs/mylib/src/old.ts',
      'libs/mylib/src/util.ts',
      'libs/mylib/src/helper.ts',
    ]);

    updateProjectSourceFilesCache(
      'libs/mylib',
      'libs/mylib/src/old.ts',
      'libs/mylib/src/new.ts',
      projectSourceFilesCache,
    );

    const cached = projectSourceFilesCache.get('libs/mylib');
    expect(cached).toContain('libs/mylib/src/index.ts');
    expect(cached).toContain('libs/mylib/src/util.ts');
    expect(cached).toContain('libs/mylib/src/helper.ts');
  });

  it('should handle newPath in subdirectory of project', () => {
    projectSourceFilesCache.set('libs/mylib', ['libs/mylib/src/old.ts']);

    updateProjectSourceFilesCache(
      'libs/mylib',
      'libs/mylib/src/old.ts',
      'libs/mylib/src/features/new.ts',
      projectSourceFilesCache,
    );

    const cached = projectSourceFilesCache.get('libs/mylib');
    expect(cached).toContain('libs/mylib/src/features/new.ts');
  });
});
```

### Task 2.9: Create `cache/update-file-existence-cache.ts`

**File**: `packages/workspace/src/generators/move-file/cache/update-file-existence-cache.ts`

```typescript
/**
 * Updates the file existence cache when a file is created or deleted.
 *
 * This function should be called after creating or deleting a file to keep
 * the cache in sync with the actual file system state.
 *
 * @param filePath - Path of the file
 * @param exists - Whether the file exists after the operation
 * @param fileExistenceCache - Cache for file existence checks
 */
export function updateFileExistenceCache(
  filePath: string,
  exists: boolean,
  fileExistenceCache: Map<string, boolean>,
): void {
  fileExistenceCache.set(filePath, exists);
}
```

### Task 2.10: Create `cache/update-file-existence-cache.spec.ts`

**File**: `packages/workspace/src/generators/move-file/cache/update-file-existence-cache.spec.ts`

```typescript
import { updateFileExistenceCache } from './update-file-existence-cache';

describe('updateFileExistenceCache', () => {
  let fileExistenceCache: Map<string, boolean>;

  beforeEach(() => {
    fileExistenceCache = new Map();
  });

  it('should add file to cache when created', () => {
    updateFileExistenceCache('test.ts', true, fileExistenceCache);

    expect(fileExistenceCache.get('test.ts')).toBe(true);
  });

  it('should add file to cache when deleted', () => {
    updateFileExistenceCache('test.ts', false, fileExistenceCache);

    expect(fileExistenceCache.get('test.ts')).toBe(false);
  });

  it('should update existing cache entry', () => {
    fileExistenceCache.set('test.ts', true);

    updateFileExistenceCache('test.ts', false, fileExistenceCache);

    expect(fileExistenceCache.get('test.ts')).toBe(false);
  });

  it('should handle multiple files', () => {
    updateFileExistenceCache('file1.ts', true, fileExistenceCache);
    updateFileExistenceCache('file2.ts', false, fileExistenceCache);
    updateFileExistenceCache('file3.ts', true, fileExistenceCache);

    expect(fileExistenceCache.get('file1.ts')).toBe(true);
    expect(fileExistenceCache.get('file2.ts')).toBe(false);
    expect(fileExistenceCache.get('file3.ts')).toBe(true);
  });

  it('should handle updates to same file multiple times', () => {
    updateFileExistenceCache('test.ts', true, fileExistenceCache);
    expect(fileExistenceCache.get('test.ts')).toBe(true);

    updateFileExistenceCache('test.ts', false, fileExistenceCache);
    expect(fileExistenceCache.get('test.ts')).toBe(false);

    updateFileExistenceCache('test.ts', true, fileExistenceCache);
    expect(fileExistenceCache.get('test.ts')).toBe(true);
  });
});
```

### Task 2.11: Create `cache/get-cached-dependent-projects.ts`

**File**: `packages/workspace/src/generators/move-file/cache/get-cached-dependent-projects.ts`

```typescript
import type { ProjectGraph } from '@nx/devkit';

/**
 * Gets dependent projects with caching to avoid repeated graph traversals.
 * The cache is cleared at the start of each generator execution.
 *
 * This function uses a cache to store the set of dependent project names,
 * which can significantly improve performance when the same project's
 * dependents are queried multiple times during a move operation.
 *
 * @param projectGraph - The project dependency graph
 * @param projectName - The name of the project to get dependents for
 * @param getDependentProjectNames - Function to get dependent project names from graph
 * @param dependencyGraphCache - Cache for dependent project lookups
 * @returns Set of dependent project names
 */
export function getCachedDependentProjects(
  projectGraph: ProjectGraph,
  projectName: string,
  getDependentProjectNames: (
    projectGraph: ProjectGraph,
    projectName: string,
  ) => string[],
  dependencyGraphCache: Map<string, Set<string>>,
): Set<string> {
  const cached = dependencyGraphCache.get(projectName);
  if (cached !== undefined) {
    return cached;
  }
  const dependents = new Set(
    getDependentProjectNames(projectGraph, projectName),
  );
  dependencyGraphCache.set(projectName, dependents);
  return dependents;
}
```

### Task 2.12: Create `cache/get-cached-dependent-projects.spec.ts`

**File**: `packages/workspace/src/generators/move-file/cache/get-cached-dependent-projects.spec.ts`

```typescript
import { ProjectGraph } from '@nx/devkit';
import { getCachedDependentProjects } from './get-cached-dependent-projects';

describe('getCachedDependentProjects', () => {
  let projectGraph: ProjectGraph;
  let dependencyGraphCache: Map<string, Set<string>>;
  let getDependentProjectNames: jest.Mock;

  beforeEach(() => {
    projectGraph = {
      nodes: {},
      dependencies: {},
    } as ProjectGraph;

    dependencyGraphCache = new Map();
    getDependentProjectNames = jest.fn();
  });

  it('should call getDependentProjectNames on cache miss', () => {
    getDependentProjectNames.mockReturnValue(['project2', 'project3']);

    const result = getCachedDependentProjects(
      projectGraph,
      'project1',
      getDependentProjectNames,
      dependencyGraphCache,
    );

    expect(getDependentProjectNames).toHaveBeenCalledWith(
      projectGraph,
      'project1',
    );
    expect(result).toEqual(new Set(['project2', 'project3']));
  });

  it('should cache the result', () => {
    getDependentProjectNames.mockReturnValue(['project2', 'project3']);

    getCachedDependentProjects(
      projectGraph,
      'project1',
      getDependentProjectNames,
      dependencyGraphCache,
    );

    expect(dependencyGraphCache.has('project1')).toBe(true);
    expect(dependencyGraphCache.get('project1')).toEqual(
      new Set(['project2', 'project3']),
    );
  });

  it('should use cached result on second call', () => {
    getDependentProjectNames.mockReturnValue(['project2', 'project3']);

    // First call
    const result1 = getCachedDependentProjects(
      projectGraph,
      'project1',
      getDependentProjectNames,
      dependencyGraphCache,
    );

    // Second call
    const result2 = getCachedDependentProjects(
      projectGraph,
      'project1',
      getDependentProjectNames,
      dependencyGraphCache,
    );

    expect(getDependentProjectNames).toHaveBeenCalledTimes(1);
    expect(result1).toBe(result2); // Same Set instance
  });

  it('should handle projects with no dependents', () => {
    getDependentProjectNames.mockReturnValue([]);

    const result = getCachedDependentProjects(
      projectGraph,
      'project1',
      getDependentProjectNames,
      dependencyGraphCache,
    );

    expect(result).toEqual(new Set());
  });

  it('should handle different projects independently', () => {
    getDependentProjectNames
      .mockReturnValueOnce(['project2'])
      .mockReturnValueOnce(['project3', 'project4']);

    const result1 = getCachedDependentProjects(
      projectGraph,
      'project1',
      getDependentProjectNames,
      dependencyGraphCache,
    );

    const result2 = getCachedDependentProjects(
      projectGraph,
      'project2',
      getDependentProjectNames,
      dependencyGraphCache,
    );

    expect(result1).toEqual(new Set(['project2']));
    expect(result2).toEqual(new Set(['project3', 'project4']));
    expect(dependencyGraphCache.size).toBe(2);
  });

  it('should convert array to Set', () => {
    getDependentProjectNames.mockReturnValue([
      'project2',
      'project2',
      'project3',
    ]);

    const result = getCachedDependentProjects(
      projectGraph,
      'project1',
      getDependentProjectNames,
      dependencyGraphCache,
    );

    // Set should deduplicate
    expect(result).toEqual(new Set(['project2', 'project3']));
  });
});
```

### Task 2.13: Create `cache/index.ts`

**File**: `packages/workspace/src/generators/move-file/cache/index.ts`

```typescript
/**
 * Re-exports all cache-related functions for convenient importing.
 */
export * from './clear-all-caches';
export * from './cached-tree-exists';
export * from './get-project-source-files';
export * from './update-project-source-files-cache';
export * from './update-file-existence-cache';
export * from './get-cached-dependent-projects';
```

### Task 2.14: Update `generator.ts`

**Changes to make in `generator.ts`**:

1. **Import cache functions** at the top (after other imports):

```typescript
import {
  clearAllCaches as clearAllCachesImpl,
  cachedTreeExists as cachedTreeExistsImpl,
  getProjectSourceFiles as getProjectSourceFilesImpl,
  updateProjectSourceFilesCache as updateProjectSourceFilesCacheImpl,
  updateFileExistenceCache as updateFileExistenceCacheImpl,
  getCachedDependentProjects as getCachedDependentProjectsImpl,
} from './cache';
```

2. **Create wrapper functions** that pass cache state to implementations:

```typescript
/**
 * Wrapper for clearAllCaches that passes cache state
 */
function clearAllCaches(): void {
  clearAllCachesImpl(
    projectSourceFilesCache,
    fileExistenceCache,
    { value: compilerPathsCache },
    dependencyGraphCache,
  );
  // Update compilerPathsCache reference after clearing
  compilerPathsCache = undefined;
}

/**
 * Wrapper for cachedTreeExists that passes cache state
 */
function cachedTreeExists(tree: Tree, filePath: string): boolean {
  return cachedTreeExistsImpl(tree, filePath, fileExistenceCache);
}

/**
 * Wrapper for getProjectSourceFiles that passes cache state
 */
function getProjectSourceFiles(tree: Tree, projectRoot: string): string[] {
  return getProjectSourceFilesImpl(
    tree,
    projectRoot,
    projectSourceFilesCache,
    fileExistenceCache,
  );
}

/**
 * Wrapper for updateProjectSourceFilesCache that passes cache state
 */
function updateProjectSourceFilesCache(
  projectRoot: string,
  oldPath: string,
  newPath: string | null,
): void {
  updateProjectSourceFilesCacheImpl(
    projectRoot,
    oldPath,
    newPath,
    projectSourceFilesCache,
  );
}

/**
 * Wrapper for updateFileExistenceCache that passes cache state
 */
function updateFileExistenceCache(filePath: string, exists: boolean): void {
  updateFileExistenceCacheImpl(filePath, exists, fileExistenceCache);
}

/**
 * Wrapper for getCachedDependentProjects that passes cache state
 */
function getCachedDependentProjects(
  projectGraph: ProjectGraph,
  projectName: string,
): Set<string> {
  return getCachedDependentProjectsImpl(
    projectGraph,
    projectName,
    getDependentProjectNames,
    dependencyGraphCache,
  );
}
```

3. **Remove the old function implementations** (but keep the cache variable declarations):

```typescript
// KEEP THESE:
const projectSourceFilesCache = new Map<string, string[]>();
const fileExistenceCache = new Map<string, boolean>();
let compilerPathsCache: Record<string, unknown> | null | undefined = undefined;
const dependencyGraphCache = new Map<string, Set<string>>();

// REMOVE THESE (they're now imported from cache/):
// function clearAllCaches(): void { ... }
// function getProjectSourceFiles(...) { ... }
// function updateProjectSourceFilesCache(...) { ... }
// function cachedTreeExists(...) { ... }
// function updateFileExistenceCache(...) { ... }
// function getCachedDependentProjects(...) { ... }
```

## Testing Strategy

### Unit Tests for Each Function

```bash
# Run cache tests
npx nx test workspace --testPathPattern=cache/
```

### Integration Tests

```bash
# Run all generator tests to ensure no regressions
npx nx test workspace --testPathPattern=generator.spec.ts
```

### Full Test Suite

```bash
# Run all tests
npx nx test workspace
```

## Verification Steps

1. **Create all cache files and tests**

2. **Build succeeds**:

   ```bash
   npx nx build workspace
   ```

3. **All new cache tests pass**:

   ```bash
   npx nx test workspace --testPathPattern=cache/
   ```

4. **All existing tests still pass**:

   ```bash
   npx nx test workspace
   ```

5. **Linting passes**:

   ```bash
   npx nx lint workspace
   ```

## Expected Outcomes

### Before

- `generator.ts`: ~1,940 lines (after Phase 1)
- Cache functions inline in generator.ts
- No separate tests for cache functions

### After

- `generator.ts`: ~1,850 lines (90 lines removed, ~60 lines of wrapper functions added = net -30 lines)
- `cache/` directory with 6 function files (~150 lines total)
- `cache/` directory with 6 test files (~600 lines total)
- `cache/index.ts` for re-exports
- All 140+ existing tests still pass
- 40+ new tests for cache functions

## Benefits

1. **Better organization**: Cache logic separated from main generator
2. **Testability**: Each cache function tested independently
3. **Reusability**: Cache functions can be used by other modules
4. **Maintainability**: Easier to understand and modify cache behavior
5. **Documentation**: JSDoc on each function explains purpose and behavior

## Next Steps

After Phase 2 is complete:

- Move to Phase 3: Extract path utilities
- Use similar pattern: extract → test → verify → commit
- Continue reducing size of generator.ts

## Rollback Plan

If issues arise:

1. Revert the commit
2. All functionality returns to previous state
3. Low risk since changes are well-tested

## Commit Message

```
refactor(move-file): extract cache functions to dedicated modules (Phase 2)

- Create cache/ directory with 6 cache functions
- Add comprehensive unit tests for all cache functions
- Update generator.ts to use extracted functions
- No functional changes, purely organizational

Cache functions extracted:
- clearAllCaches
- cachedTreeExists
- getProjectSourceFiles
- updateProjectSourceFilesCache
- updateFileExistenceCache
- getCachedDependentProjects

Part of refactoring plan Phase 2.
See REFACTORING_PLAN.md for full details.
```
