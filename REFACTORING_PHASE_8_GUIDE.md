# Refactoring Phase 8: Extract Core Operations Functions

## Overview

This document provides a detailed implementation guide for Phase 8 of the refactoring plan. Phase 8 focuses on extracting the core operation functions from `generator.ts` into a dedicated `core-operations/` directory.

**Phase 8 Status**: 📋 **READY TO START**

## Goals

- Extract all core operation functions to `core-operations/` directory
- Create comprehensive unit tests for each function
- One function per file with co-located tests
- Update imports in `generator.ts`
- Zero functional changes
- Maintain all existing test coverage
- Reduce `generator.ts` to a thin orchestration layer (<200 lines)

## Prerequisites

✅ Phase 1 must be complete:

- `constants/file-extensions.ts` created
- `types/move-context.ts` created
- All Phase 1 tests passing

✅ Phase 2 must be complete:

- `cache/` directory with 6 cache functions
- All Phase 2 tests passing

✅ Phase 3 must be complete:

- `path-utils/` directory with 9 path utility functions
- All Phase 3 tests passing

✅ Phase 4 must be complete:

- `project-analysis/` directory with 13 project analysis functions
- All Phase 4 tests passing

✅ Phase 5 must be complete:

- `import-updates/` directory with 9 import update functions
- All Phase 5 tests passing

✅ Phase 6 must be complete:

- `export-management/` directory with 5 export management functions
- All Phase 6 tests passing

✅ Phase 7 must be complete:

- `validation/` directory with 2 validation functions
- All Phase 7 tests passing

## Core Operations Functions to Extract

Phase 8 extracts 8 core operation functions:

1. **executeMove** - Main move orchestrator that coordinates all move steps
2. **createTargetFile** - Creates target file and updates caches
3. **handleMoveStrategy** - Strategy pattern router that selects appropriate move handler
4. **handleSameProjectMove** - Handles moves within the same project
5. **handleExportedMove** - Handles exported file moves to update dependents
6. **handleNonExportedAliasMove** - Handles non-exported files with package aliases
7. **handleDefaultMove** - Default fallback move handler
8. **finalizeMove** - Cleanup and finalization (deletion, formatting)

## Risk Level

**Medium-High Risk** - These functions are the core orchestration logic:

- Execute the main move workflow
- Coordinate multiple modules (validation, imports, exports, etc.)
- Handle different move strategies based on context
- Manage file creation/deletion
- Control cache updates
- Heavy integration with other modules

## Tasks

### Task 8.1: Create `core-operations/execute-move.ts`

**File**: `packages/workspace/src/generators/move-file/core-operations/execute-move.ts`

**Purpose**: Main orchestrator that coordinates all steps of a file move operation.

**Implementation**: Extract lines ~319-374 from generator.ts

**Key points**:

- Receives precomputed MoveContext from validation
- Creates target file
- Updates caches incrementally
- Updates imports in moved file
- Executes move strategy
- Updates imports in target project
- Ensures exports if needed
- Optionally finalizes (deletes source, formats)

**Code**:

```typescript
import type { Tree, ProjectConfiguration } from '@nx/devkit';
import type { ProjectGraph } from '@nx/devkit';
import { logger } from '@nx/devkit';
import type { MoveFileGeneratorSchema } from '../schema';
import type { MoveContext } from '../types/move-context';
import { updateMovedFileImportsIfNeeded } from '../import-updates/update-moved-file-imports-if-needed';
import { updateTargetProjectImportsIfNeeded } from '../import-updates/update-target-project-imports-if-needed';
import { ensureExportIfNeeded } from '../export-management/ensure-export-if-needed';
import { createTargetFile } from './create-target-file';
import { handleMoveStrategy } from './handle-move-strategy';
import { finalizeMove } from './finalize-move';

/**
 * Coordinates the move workflow by executing the individual move steps in order.
 *
 * @param tree - The virtual file system tree.
 * @param options - Generator options controlling the move.
 * @param projects - Map of all projects in the workspace.
 * @param getProjectGraphAsync - Lazy getter for the dependency graph (only creates when needed).
 * @param ctx - Precomputed move context produced by resolveAndValidate.
 * @param cachedTreeExists - Function to check file existence with caching.
 * @param updateProjectSourceFilesCache - Function to update project source files cache.
 * @param getProjectSourceFiles - Function to get project source files with caching.
 * @param skipFinalization - Skip deletion and formatting (for batch operations).
 */
export async function executeMove(
  tree: Tree,
  options: MoveFileGeneratorSchema,
  projects: Map<string, ProjectConfiguration>,
  getProjectGraphAsync: () => Promise<ProjectGraph>,
  ctx: MoveContext,
  cachedTreeExists: (tree: Tree, filePath: string) => boolean,
  updateProjectSourceFilesCache: (
    projectRoot: string,
    oldPath: string,
    newPath: string | null,
  ) => void,
  getProjectSourceFiles: (tree: Tree, projectRoot: string) => string[],
  skipFinalization = false,
) {
  const {
    normalizedSource,
    normalizedTarget,
    sourceProjectName,
    targetProjectName,
    fileContent,
    sourceImportPath,
  } = ctx;

  logger.verbose(
    `Moving ${normalizedSource} (project: ${sourceProjectName}) to ${normalizedTarget} (project: ${targetProjectName})`,
  );

  createTargetFile(tree, normalizedTarget, fileContent);

  // Update cache incrementally for projects that will be modified
  // This is more efficient than invalidating and re-scanning the entire project
  const sourceProject = projects.get(sourceProjectName);
  const targetProject = projects.get(targetProjectName);
  if (sourceProject) {
    updateProjectSourceFilesCache(
      sourceProject.root,
      normalizedSource,
      targetProjectName === sourceProjectName ? normalizedTarget : null,
    );
  }
  if (targetProject && targetProject.root !== sourceProject?.root) {
    updateProjectSourceFilesCache(targetProject.root, '', normalizedTarget);
  }

  updateMovedFileImportsIfNeeded(tree, ctx, cachedTreeExists);

  await handleMoveStrategy(tree, getProjectGraphAsync, projects, ctx);

  const sourceIdentifier = sourceImportPath || normalizedSource;
  updateTargetProjectImportsIfNeeded(
    tree,
    ctx,
    sourceIdentifier,
    getProjectSourceFiles,
  );

  ensureExportIfNeeded(tree, ctx, options, cachedTreeExists);

  if (!skipFinalization) {
    await finalizeMove(tree, normalizedSource, options);
  }
}
```

### Task 8.2: Create tests for execute-move

**File**: `packages/workspace/src/generators/move-file/core-operations/execute-move.spec.ts`

**Test coverage**:

- Should create target file with correct content
- Should update project source file caches for source and target projects
- Should update imports in moved file
- Should execute appropriate move strategy
- Should update imports in target project
- Should ensure exports when needed
- Should finalize when skipFinalization is false
- Should skip finalization when skipFinalization is true
- Should handle same-project moves correctly
- Should handle cross-project moves correctly
- Should log verbose messages

**Sample test structure**:

```typescript
import { Tree, ProjectConfiguration, ProjectGraph } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { executeMove } from './execute-move';
import { createTargetFile } from './create-target-file';
import { handleMoveStrategy } from './handle-move-strategy';
import { finalizeMove } from './finalize-move';
import { updateMovedFileImportsIfNeeded } from '../import-updates/update-moved-file-imports-if-needed';
import { updateTargetProjectImportsIfNeeded } from '../import-updates/update-target-project-imports-if-needed';
import { ensureExportIfNeeded } from '../export-management/ensure-export-if-needed';
import type { MoveContext } from '../types/move-context';

jest.mock('./create-target-file');
jest.mock('./handle-move-strategy');
jest.mock('./finalize-move');
jest.mock('../import-updates/update-moved-file-imports-if-needed');
jest.mock('../import-updates/update-target-project-imports-if-needed');
jest.mock('../export-management/ensure-export-if-needed');

describe('executeMove', () => {
  let tree: Tree;
  let projects: Map<string, ProjectConfiguration>;
  let mockGetProjectGraphAsync: jest.Mock;
  let mockCachedTreeExists: jest.Mock;
  let mockUpdateProjectSourceFilesCache: jest.Mock;
  let mockGetProjectSourceFiles: jest.Mock;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    projects = new Map();
    mockGetProjectGraphAsync = jest.fn();
    mockCachedTreeExists = jest.fn();
    mockUpdateProjectSourceFilesCache = jest.fn();
    mockGetProjectSourceFiles = jest.fn();

    // Setup test projects
    const lib1: ProjectConfiguration = {
      root: 'packages/lib1',
      sourceRoot: 'packages/lib1/src',
      projectType: 'library',
    };
    const lib2: ProjectConfiguration = {
      root: 'packages/lib2',
      sourceRoot: 'packages/lib2/src',
      projectType: 'library',
    };
    projects.set('lib1', lib1);
    projects.set('lib2', lib2);

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('move orchestration', () => {
    it('should execute all move steps in correct order', async () => {
      const ctx: MoveContext = {
        normalizedSource: 'packages/lib1/src/lib/test.ts',
        normalizedTarget: 'packages/lib2/src/lib/test.ts',
        sourceProject: projects.get('lib1')!,
        sourceProjectName: 'lib1',
        targetProject: projects.get('lib2')!,
        targetProjectName: 'lib2',
        fileContent: 'export const test = 1;',
        sourceRoot: 'packages/lib1/src',
        relativeFilePathInSource: 'lib/test.ts',
        isExported: false,
        sourceImportPath: '@my/lib1',
        targetImportPath: '@my/lib2',
        hasImportsInTarget: false,
        isSameProject: false,
      };

      await executeMove(
        tree,
        { file: ctx.normalizedSource, project: 'lib2' },
        projects,
        mockGetProjectGraphAsync,
        ctx,
        mockCachedTreeExists,
        mockUpdateProjectSourceFilesCache,
        mockGetProjectSourceFiles,
        false,
      );

      // Verify order of operations
      expect(createTargetFile).toHaveBeenCalledWith(
        tree,
        ctx.normalizedTarget,
        ctx.fileContent,
      );
      expect(mockUpdateProjectSourceFilesCache).toHaveBeenCalledTimes(2);
      expect(updateMovedFileImportsIfNeeded).toHaveBeenCalledWith(
        tree,
        ctx,
        mockCachedTreeExists,
      );
      expect(handleMoveStrategy).toHaveBeenCalledWith(
        tree,
        mockGetProjectGraphAsync,
        projects,
        ctx,
      );
      expect(updateTargetProjectImportsIfNeeded).toHaveBeenCalledWith(
        tree,
        ctx,
        ctx.sourceImportPath,
        mockGetProjectSourceFiles,
      );
      expect(ensureExportIfNeeded).toHaveBeenCalledWith(
        tree,
        ctx,
        expect.any(Object),
        mockCachedTreeExists,
      );
      expect(finalizeMove).toHaveBeenCalledWith(
        tree,
        ctx.normalizedSource,
        expect.any(Object),
      );
    });

    it('should skip finalization when requested', async () => {
      const ctx: MoveContext = {
        normalizedSource: 'packages/lib1/src/lib/test.ts',
        normalizedTarget: 'packages/lib2/src/lib/test.ts',
        sourceProject: projects.get('lib1')!,
        sourceProjectName: 'lib1',
        targetProject: projects.get('lib2')!,
        targetProjectName: 'lib2',
        fileContent: 'export const test = 1;',
        sourceRoot: 'packages/lib1/src',
        relativeFilePathInSource: 'lib/test.ts',
        isExported: false,
        sourceImportPath: '@my/lib1',
        targetImportPath: '@my/lib2',
        hasImportsInTarget: false,
        isSameProject: false,
      };

      await executeMove(
        tree,
        { file: ctx.normalizedSource, project: 'lib2' },
        projects,
        mockGetProjectGraphAsync,
        ctx,
        mockCachedTreeExists,
        mockUpdateProjectSourceFilesCache,
        mockGetProjectSourceFiles,
        true, // skipFinalization = true
      );

      expect(finalizeMove).not.toHaveBeenCalled();
    });
  });

  describe('cache updates', () => {
    it('should update cache for cross-project move', async () => {
      const ctx: MoveContext = {
        normalizedSource: 'packages/lib1/src/lib/test.ts',
        normalizedTarget: 'packages/lib2/src/lib/test.ts',
        sourceProject: projects.get('lib1')!,
        sourceProjectName: 'lib1',
        targetProject: projects.get('lib2')!,
        targetProjectName: 'lib2',
        fileContent: 'export const test = 1;',
        sourceRoot: 'packages/lib1/src',
        relativeFilePathInSource: 'lib/test.ts',
        isExported: false,
        sourceImportPath: null,
        targetImportPath: null,
        hasImportsInTarget: false,
        isSameProject: false,
      };

      await executeMove(
        tree,
        { file: ctx.normalizedSource, project: 'lib2' },
        projects,
        mockGetProjectGraphAsync,
        ctx,
        mockCachedTreeExists,
        mockUpdateProjectSourceFilesCache,
        mockGetProjectSourceFiles,
        true,
      );

      // Source project cache updated with null (file removed)
      expect(mockUpdateProjectSourceFilesCache).toHaveBeenCalledWith(
        'packages/lib1',
        ctx.normalizedSource,
        null,
      );

      // Target project cache updated with new file
      expect(mockUpdateProjectSourceFilesCache).toHaveBeenCalledWith(
        'packages/lib2',
        '',
        ctx.normalizedTarget,
      );
    });

    it('should update cache for same-project move', async () => {
      const ctx: MoveContext = {
        normalizedSource: 'packages/lib1/src/lib/test.ts',
        normalizedTarget: 'packages/lib1/src/utils/test.ts',
        sourceProject: projects.get('lib1')!,
        sourceProjectName: 'lib1',
        targetProject: projects.get('lib1')!,
        targetProjectName: 'lib1',
        fileContent: 'export const test = 1;',
        sourceRoot: 'packages/lib1/src',
        relativeFilePathInSource: 'lib/test.ts',
        isExported: false,
        sourceImportPath: null,
        targetImportPath: null,
        hasImportsInTarget: false,
        isSameProject: true,
      };

      await executeMove(
        tree,
        { file: ctx.normalizedSource, project: 'lib1' },
        projects,
        mockGetProjectGraphAsync,
        ctx,
        mockCachedTreeExists,
        mockUpdateProjectSourceFilesCache,
        mockGetProjectSourceFiles,
        true,
      );

      // Same project cache updated with new path
      expect(mockUpdateProjectSourceFilesCache).toHaveBeenCalledWith(
        'packages/lib1',
        ctx.normalizedSource,
        ctx.normalizedTarget,
      );
    });
  });
});
```

### Task 8.3: Create `core-operations/create-target-file.ts`

**File**: `packages/workspace/src/generators/move-file/core-operations/create-target-file.ts`

**Purpose**: Creates the target file and updates related caches.

**Implementation**: Extract lines ~376-386 from generator.ts

**Key points**:

- Writes file content to tree
- Updates file existence cache
- Invalidates tree read cache

**Code**:

```typescript
import type { Tree } from '@nx/devkit';
import { treeReadCache } from '../tree-cache';

/**
 * Creates the target file and updates related caches.
 *
 * @param tree - The virtual file system tree.
 * @param normalizedTarget - The normalized target file path.
 * @param fileContent - The content to write to the target file.
 * @param updateFileExistenceCache - Function to update file existence cache.
 */
export function createTargetFile(
  tree: Tree,
  normalizedTarget: string,
  fileContent: string,
  updateFileExistenceCache: (filePath: string, exists: boolean) => void,
): void {
  tree.write(normalizedTarget, fileContent);
  // Update file existence cache
  updateFileExistenceCache(normalizedTarget, true);
  // Invalidate tree read cache for this file
  treeReadCache.invalidateFile(normalizedTarget);
}
```

**Note**: The function signature is updated to accept `updateFileExistenceCache` as a parameter instead of importing it, to avoid circular dependencies and improve testability.

### Task 8.4: Create tests for create-target-file

**File**: `packages/workspace/src/generators/move-file/core-operations/create-target-file.spec.ts`

**Test coverage**:

- Should write file content to tree
- Should update file existence cache to true
- Should invalidate tree read cache
- Should handle empty file content
- Should handle file paths with special characters

**Sample test structure**:

```typescript
import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { createTargetFile } from './create-target-file';
import { treeReadCache } from '../tree-cache';

jest.mock('../tree-cache');

describe('createTargetFile', () => {
  let tree: Tree;
  let mockUpdateFileExistenceCache: jest.Mock;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    mockUpdateFileExistenceCache = jest.fn();
    jest.clearAllMocks();
  });

  it('should write file content to tree', () => {
    const targetPath = 'packages/lib1/src/lib/test.ts';
    const content = 'export const test = 1;';

    createTargetFile(tree, targetPath, content, mockUpdateFileExistenceCache);

    expect(tree.exists(targetPath)).toBe(true);
    expect(tree.read(targetPath, 'utf-8')).toBe(content);
  });

  it('should update file existence cache', () => {
    const targetPath = 'packages/lib1/src/lib/test.ts';
    const content = 'export const test = 1;';

    createTargetFile(tree, targetPath, content, mockUpdateFileExistenceCache);

    expect(mockUpdateFileExistenceCache).toHaveBeenCalledWith(targetPath, true);
  });

  it('should invalidate tree read cache', () => {
    const targetPath = 'packages/lib1/src/lib/test.ts';
    const content = 'export const test = 1;';

    createTargetFile(tree, targetPath, content, mockUpdateFileExistenceCache);

    expect(treeReadCache.invalidateFile).toHaveBeenCalledWith(targetPath);
  });

  it('should handle empty file content', () => {
    const targetPath = 'packages/lib1/src/lib/empty.ts';
    const content = '';

    createTargetFile(tree, targetPath, content, mockUpdateFileExistenceCache);

    expect(tree.exists(targetPath)).toBe(true);
    expect(tree.read(targetPath, 'utf-8')).toBe('');
  });
});
```

### Task 8.5: Create `core-operations/handle-move-strategy.ts`

**File**: `packages/workspace/src/generators/move-file/core-operations/handle-move-strategy.ts`

**Purpose**: Strategy pattern router that selects and executes the appropriate move handler.

**Implementation**: Extract lines ~414-438 from generator.ts

**Key points**:

- Examines move context to determine strategy
- Routes to one of four handlers:
  - Same project move
  - Exported file cross-project move
  - Non-exported with alias move
  - Default fallback move

**Code**:

```typescript
import type { Tree, ProjectConfiguration, ProjectGraph } from '@nx/devkit';
import type { MoveContext } from '../types/move-context';
import { handleSameProjectMove } from './handle-same-project-move';
import { handleExportedMove } from './handle-exported-move';
import { handleNonExportedAliasMove } from './handle-non-exported-alias-move';
import { handleDefaultMove } from './handle-default-move';

/**
 * Decides which move strategy to execute based on the context.
 *
 * @param tree - The virtual file system tree.
 * @param getProjectGraphAsync - Lazy getter for the dependency graph (only creates when needed).
 * @param projects - Map of all projects in the workspace.
 * @param ctx - Resolved move context.
 * @param getCachedDependentProjects - Function to get cached dependent projects.
 * @param getProjectSourceFiles - Function to get project source files with caching.
 * @param cachedTreeExists - Function to check file existence with caching.
 */
export async function handleMoveStrategy(
  tree: Tree,
  getProjectGraphAsync: () => Promise<ProjectGraph>,
  projects: Map<string, ProjectConfiguration>,
  ctx: MoveContext,
  getCachedDependentProjects: (
    projectGraph: ProjectGraph,
    projectName: string,
  ) => Set<string>,
  getProjectSourceFiles: (tree: Tree, projectRoot: string) => string[],
  cachedTreeExists: (tree: Tree, filePath: string) => boolean,
): Promise<void> {
  const { isSameProject, isExported, sourceImportPath, targetImportPath } = ctx;

  if (isSameProject) {
    handleSameProjectMove(tree, ctx, getProjectSourceFiles);
    return;
  }

  if (isExported && sourceImportPath && targetImportPath) {
    await handleExportedMove(
      tree,
      getProjectGraphAsync,
      projects,
      ctx,
      getCachedDependentProjects,
      getProjectSourceFiles,
      cachedTreeExists,
    );
    return;
  }

  if (targetImportPath) {
    handleNonExportedAliasMove(tree, ctx, getProjectSourceFiles);
    return;
  }

  handleDefaultMove(tree, ctx, getProjectSourceFiles);
}
```

### Task 8.6: Create tests for handle-move-strategy

**File**: `packages/workspace/src/generators/move-file/core-operations/handle-move-strategy.spec.ts`

**Test coverage**:

- Should call handleSameProjectMove for same-project moves
- Should call handleExportedMove for exported cross-project moves
- Should call handleNonExportedAliasMove for non-exported moves with target alias
- Should call handleDefaultMove as fallback
- Should not call multiple handlers
- Should handle async operations correctly

### Task 8.7: Create `core-operations/handle-same-project-move.ts`

**File**: `packages/workspace/src/generators/move-file/core-operations/handle-same-project-move.ts`

**Purpose**: Handles moves within the same project by updating imports to relative paths.

**Implementation**: Extract lines ~446-460 from generator.ts

**Code**:

```typescript
import type { Tree } from '@nx/devkit';
import { logger } from '@nx/devkit';
import type { MoveContext } from '../types/move-context';
import { updateImportPathsInProject } from '../import-updates/update-import-paths-in-project';

/**
 * Applies the move behavior when the file remains in the same project.
 *
 * @param tree - The virtual file system tree.
 * @param ctx - Resolved move context.
 * @param getProjectSourceFiles - Function to get project source files with caching.
 */
export function handleSameProjectMove(
  tree: Tree,
  ctx: MoveContext,
  getProjectSourceFiles: (tree: Tree, projectRoot: string) => string[],
): void {
  const { sourceProject, normalizedSource, normalizedTarget } = ctx;

  logger.verbose(
    `Moving within same project, updating imports to relative paths`,
  );

  updateImportPathsInProject(
    tree,
    sourceProject,
    normalizedSource,
    normalizedTarget,
    getProjectSourceFiles,
  );
}
```

### Task 8.8: Create tests for handle-same-project-move

**File**: `packages/workspace/src/generators/move-file/core-operations/handle-same-project-move.spec.ts`

### Task 8.9: Create `core-operations/handle-exported-move.ts`

**File**: `packages/workspace/src/generators/move-file/core-operations/handle-exported-move.ts`

**Purpose**: Handles exported file moves by updating dependent projects and package aliases.

**Implementation**: Extract lines ~470-538 from generator.ts

**Code**:

```typescript
import type { Tree, ProjectConfiguration, ProjectGraph } from '@nx/devkit';
import { logger } from '@nx/devkit';
import { posix as path } from 'node:path';
import type { MoveContext } from '../types/move-context';
import { updateImportPathsInDependentProjects } from '../import-updates/update-import-paths-in-dependent-projects';
import { removeFileExport } from '../export-management/remove-file-export';
import { updateImportPathsToPackageAlias } from '../import-updates/update-import-paths-to-package-alias';

/**
 * Handles the move when the source file is exported and must update dependents.
 *
 * @param tree - The virtual file system tree.
 * @param getProjectGraphAsync - Lazy getter for the dependency graph (only creates when needed).
 * @param projects - Map of all projects in the workspace.
 * @param ctx - Resolved move context.
 * @param getCachedDependentProjects - Function to get cached dependent projects.
 * @param getProjectSourceFiles - Function to get project source files with caching.
 * @param cachedTreeExists - Function to check file existence with caching.
 */
export async function handleExportedMove(
  tree: Tree,
  getProjectGraphAsync: () => Promise<ProjectGraph>,
  projects: Map<string, ProjectConfiguration>,
  ctx: MoveContext,
  getCachedDependentProjects: (
    projectGraph: ProjectGraph,
    projectName: string,
  ) => Set<string>,
  getProjectSourceFiles: (tree: Tree, projectRoot: string) => string[],
  cachedTreeExists: (tree: Tree, filePath: string) => boolean,
): Promise<void> {
  const {
    sourceProjectName,
    sourceImportPath,
    targetImportPath,
    sourceProject,
    targetProject,
    targetProjectName,
    normalizedSource,
    normalizedTarget,
    relativeFilePathInSource,
  } = ctx;

  if (!sourceImportPath || !targetImportPath) {
    return;
  }

  logger.verbose(
    `File is exported from ${sourceImportPath}, updating dependent projects`,
  );

  // Compute the relative path in the target project
  const targetRoot = targetProject.sourceRoot || targetProject.root;
  const relativeFilePathInTarget = path.relative(targetRoot, normalizedTarget);

  // Lazily load project graph only when updating dependent projects.
  // This is the only code path that requires the graph, so we defer creation until here.
  // Same-project moves and non-exported cross-project moves never reach this code.
  const projectGraph = await getProjectGraphAsync();

  await updateImportPathsInDependentProjects(
    tree,
    projectGraph,
    projects,
    sourceProjectName,
    sourceImportPath,
    targetImportPath,
    {
      targetProjectName,
      targetRelativePath: relativeFilePathInTarget,
    },
    getCachedDependentProjects,
    getProjectSourceFiles,
  );

  // Remove the export from source index BEFORE updating imports to package alias
  // This ensures we can find and remove the relative path export before it's
  // converted to a package alias
  removeFileExport(
    tree,
    sourceProject,
    relativeFilePathInSource,
    cachedTreeExists,
  );

  updateImportPathsToPackageAlias(
    tree,
    sourceProject,
    normalizedSource,
    targetImportPath,
    [normalizedTarget], // Exclude the moved file
    getProjectSourceFiles,
  );
}
```

### Task 8.10: Create tests for handle-exported-move

**File**: `packages/workspace/src/generators/move-file/core-operations/handle-exported-move.spec.ts`

### Task 8.11: Create `core-operations/handle-non-exported-alias-move.ts`

**File**: `packages/workspace/src/generators/move-file/core-operations/handle-non-exported-alias-move.ts`

**Purpose**: Handles non-exported files with package aliases.

**Implementation**: Extract lines ~546-570 from generator.ts

**Code**:

```typescript
import type { Tree } from '@nx/devkit';
import { logger } from '@nx/devkit';
import type { MoveContext } from '../types/move-context';
import { updateImportPathsToPackageAlias } from '../import-updates/update-import-paths-to-package-alias';

/**
 * Handles moves across projects when the file is not exported but aliases exist.
 *
 * @param tree - The virtual file system tree.
 * @param ctx - Resolved move context.
 * @param getProjectSourceFiles - Function to get project source files with caching.
 */
export function handleNonExportedAliasMove(
  tree: Tree,
  ctx: MoveContext,
  getProjectSourceFiles: (tree: Tree, projectRoot: string) => string[],
): void {
  const {
    sourceProject,
    normalizedSource,
    normalizedTarget,
    targetImportPath,
  } = ctx;

  if (!targetImportPath) {
    return;
  }

  logger.verbose(
    `File is not exported, updating imports within source project to use target import path`,
  );

  updateImportPathsToPackageAlias(
    tree,
    sourceProject,
    normalizedSource,
    targetImportPath,
    [normalizedTarget], // Exclude the moved file
    getProjectSourceFiles,
  );
}
```

### Task 8.12: Create tests for handle-non-exported-alias-move

**File**: `packages/workspace/src/generators/move-file/core-operations/handle-non-exported-alias-move.spec.ts`

### Task 8.13: Create `core-operations/handle-default-move.ts`

**File**: `packages/workspace/src/generators/move-file/core-operations/handle-default-move.ts`

**Purpose**: Default fallback handler for moves with no aliases or exports.

**Implementation**: Extract lines ~578-590 from generator.ts

**Code**:

```typescript
import type { Tree } from '@nx/devkit';
import { logger } from '@nx/devkit';
import type { MoveContext } from '../types/move-context';
import { updateImportPathsInProject } from '../import-updates/update-import-paths-in-project';

/**
 * Fallback move strategy when no aliases or exports are involved.
 *
 * @param tree - The virtual file system tree.
 * @param ctx - Resolved move context.
 * @param getProjectSourceFiles - Function to get project source files with caching.
 */
export function handleDefaultMove(
  tree: Tree,
  ctx: MoveContext,
  getProjectSourceFiles: (tree: Tree, projectRoot: string) => string[],
): void {
  const { sourceProject, normalizedSource, normalizedTarget } = ctx;

  logger.verbose(`Updating imports within source project to relative paths`);

  updateImportPathsInProject(
    tree,
    sourceProject,
    normalizedSource,
    normalizedTarget,
    getProjectSourceFiles,
  );
}
```

### Task 8.14: Create tests for handle-default-move

**File**: `packages/workspace/src/generators/move-file/core-operations/handle-default-move.spec.ts`

### Task 8.15: Create `core-operations/finalize-move.ts`

**File**: `packages/workspace/src/generators/move-file/core-operations/finalize-move.ts`

**Purpose**: Cleanup and finalization (deletion, formatting).

**Implementation**: Extract lines ~599-611 from generator.ts

**Code**:

```typescript
import type { Tree } from '@nx/devkit';
import { formatFiles } from '@nx/devkit';
import type { MoveFileGeneratorSchema } from '../schema';
import { treeReadCache } from '../tree-cache';

/**
 * Performs cleanup by deleting the source file and formatting if required.
 *
 * @param tree - The virtual file system tree.
 * @param normalizedSource - Normalized path of the original file.
 * @param options - Generator options controlling formatting behavior.
 */
export async function finalizeMove(
  tree: Tree,
  normalizedSource: string,
  options: MoveFileGeneratorSchema,
): Promise<void> {
  tree.delete(normalizedSource);
  // Invalidate tree read cache
  treeReadCache.invalidateFile(normalizedSource);

  if (!options.skipFormat) {
    await formatFiles(tree);
  }
}
```

### Task 8.16: Create tests for finalize-move

**File**: `packages/workspace/src/generators/move-file/core-operations/finalize-move.spec.ts`

**Test coverage**:

- Should delete source file
- Should invalidate tree read cache
- Should format files when skipFormat is false
- Should skip formatting when skipFormat is true

### Task 8.17: Update `generator.ts` to use extracted functions

**Changes to make**:

1. Remove all 8 function definitions (~280 lines total)
2. Add imports from `core-operations/`
3. Update `executeMove` call in `moveFileGenerator` to pass cache functions
4. Update `createTargetFile` signature to accept `updateFileExistenceCache`

**Before** (lines ~319-611):

```typescript
async function executeMove(...) { ... }
function createTargetFile(...) { ... }
async function handleMoveStrategy(...) { ... }
function handleSameProjectMove(...) { ... }
async function handleExportedMove(...) { ... }
function handleNonExportedAliasMove(...) { ... }
function handleDefaultMove(...) { ... }
async function finalizeMove(...) { ... }
```

**After**:

```typescript
import { executeMove } from './core-operations/execute-move';
```

Then update the call to `executeMove` on line ~229:

```typescript
await executeMove(
  tree,
  fileOptions,
  projects,
  getProjectGraphAsync,
  ctx,
  cachedTreeExists,
  updateProjectSourceFilesCache,
  getProjectSourceFiles,
  true,
);
```

## Testing Strategy

### Unit Tests

```bash
# Run only the new core operations tests
npx nx test workspace --testPathPattern=core-operations
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

1. **Build succeeds**:

   ```bash
   npx nx build workspace
   ```

2. **All tests pass**:

   ```bash
   npx nx test workspace
   ```

3. **Linting passes**:

   ```bash
   npx nx lint workspace
   ```

4. **No circular dependencies**:

   ```bash
   npx nx graph
   ```

5. **File count validation**:
   ```bash
   # Should have 16 new files in core-operations/ (8 implementations + 8 tests)
   ls -la packages/workspace/src/generators/move-file/core-operations/
   ```

## Expected Outcomes

### Files Created

```
packages/workspace/src/generators/move-file/core-operations/
├── execute-move.ts                      # Main orchestrator (~95 lines)
├── execute-move.spec.ts                 # ~200 lines
├── create-target-file.ts                # ~25 lines
├── create-target-file.spec.ts           # ~80 lines
├── handle-move-strategy.ts              # ~55 lines
├── handle-move-strategy.spec.ts         # ~150 lines
├── handle-same-project-move.ts          # ~30 lines
├── handle-same-project-move.spec.ts     # ~100 lines
├── handle-exported-move.ts              # ~95 lines
├── handle-exported-move.spec.ts         # ~200 lines
├── handle-non-exported-alias-move.ts    # ~40 lines
├── handle-non-exported-alias-move.spec.ts # ~100 lines
├── handle-default-move.ts               # ~30 lines
├── handle-default-move.spec.ts          # ~100 lines
├── finalize-move.ts                     # ~25 lines
└── finalize-move.spec.ts                # ~80 lines
```

### Files Modified

```
packages/workspace/src/generators/move-file/generator.ts
- Remove 8 core operation functions (~280 lines)
- Add imports for core operations
- Update executeMove call signature
- Net reduction: ~270 lines
- New size: ~360 lines (from ~633 lines)
```

### Test Coverage

- **New unit tests**: ~80-100 tests for core operations
- **Existing tests**: All 553+ generator tests should still pass
- **Total test count**: ~633-653 tests

### Metrics

| Metric                | Before | After | Change   |
| --------------------- | ------ | ----- | -------- |
| generator.ts lines    | 633    | ~160  | -473     |
| Core operation funcs  | 8      | 0     | -8       |
| Test files            | 17     | 25    | +8       |
| Total test coverage   | 553    | ~633  | +80      |
| Functions per file    | Mixed  | 1     | Better ✓ |
| Max file size (lines) | 633    | ~200  | Better ✓ |

## Benefits

1. **Thin Orchestration Layer**: generator.ts reduced to <200 lines of orchestration code
2. **Better Testability**: Each core operation can be tested in isolation
3. **Clear Separation**: Core operations separated from utility functions
4. **Easier Debugging**: Stack traces will point to specific operation files
5. **Better Documentation**: Each operation has clear JSDoc explaining its role
6. **Reduced Complexity**: No more scrolling through 600+ lines to find a function
7. **Modular Design**: Operations can be composed differently in the future

## Commit Message Template

```
refactor(workspace): extract core operations (Phase 8)

Extract core operation functions from generator.ts to core-operations/ directory:
- executeMove - Main orchestrator
- createTargetFile - File creation and cache updates
- handleMoveStrategy - Strategy pattern router
- handleSameProjectMove - Same project handler
- handleExportedMove - Exported file handler
- handleNonExportedAliasMove - Non-exported with alias handler
- handleDefaultMove - Default fallback handler
- finalizeMove - Cleanup and formatting

This is part of the incremental refactoring to improve maintainability
and testability by organizing functions into focused modules.

Changes:
- Created core-operations/ directory with 8 operation functions
- Created comprehensive unit tests (80+ tests)
- Updated generator.ts to import and use core operations
- Reduced generator.ts from 633 to ~160 lines (~473 lines removed)
- generator.ts is now a thin orchestration layer

Testing:
- Added 80+ unit tests for core operations
- All existing 553 generator tests still passing
- 100% test pass rate maintained

BREAKING CHANGE: None - internal refactoring only

Phase 8 of 11 refactoring phases complete
```

## Performance Considerations

### Current Performance

- Core operations execute sequentially as designed
- Each operation is focused and efficient
- Cache updates are incremental
- Project graph is lazily loaded only when needed

### After Phase 8

- Same performance characteristics
- Better code organization for future optimization
- Clear boundaries for performance profiling
- Each operation can be benchmarked independently

### Future Optimization Opportunities

- Add `core-operations.bench.ts` for performance testing
- Profile each operation individually
- Consider parallelization opportunities (where safe)
- Benchmark different move strategies

## Next Phase Preview

**Phase 9: Split Tests**

Tasks:

- Split generator.spec.ts into focused test files
- Create test files per feature/scenario
- Organize tests by domain (same as code organization)
- Improve test maintainability

Estimated effort: 2-3 hours

## Related Documentation

- [REFACTORING_PLAN.md](./REFACTORING_PLAN.md) - Overall refactoring plan
- [REFACTORING_PHASE_7_GUIDE.md](./REFACTORING_PHASE_7_GUIDE.md) - Previous phase
- [packages/workspace/src/generators/move-file/README.md](./packages/workspace/src/generators/move-file/README.md) - Generator documentation

---

**Created**: 2025-10-15  
**Author**: GitHub Copilot  
**Status**: 📋 Ready to Start
