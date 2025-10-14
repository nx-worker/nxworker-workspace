# Refactoring Phase 6: Extract Export Management Functions

## Overview

This document provides a detailed implementation guide for Phase 6 of the refactoring plan. Phase 6 focuses on extracting export management functions from `generator.ts` into a dedicated `export-management/` directory.

**Phase 6 Status**: ✅ **COMPLETE**

## Goals

- Extract all export management functions to `export-management/` directory
- Create comprehensive unit tests for each function
- One function per file (or tightly related helper functions)
- Update imports in `generator.ts`
- Zero functional changes
- Maintain all existing test coverage

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

## Export Management Functions to Extract

Phase 6 extracts 5 export management functions:

1. **ensureExportIfNeeded** - Orchestrates export logic based on move context
2. **shouldExportFile** - Determines if a file should be exported
3. **isFileExported** - Checks if a file is currently exported
4. **ensureFileExported** - Adds export statement to entrypoint
5. **removeFileExport** - Removes export statement from entrypoint

## Risk Level

**Medium Risk** - These functions involve:

- Entrypoint file manipulation
- Export pattern detection and removal
- Coordination with move strategy logic
- Regex-based content matching

## Tasks

### Task 6.1: Create `export-management/ensure-export-if-needed.ts`

**File**: `packages/workspace/src/generators/move-file/export-management/ensure-export-if-needed.ts`

**Purpose**: Orchestrates the export logic based on move context and options.

**Implementation**: Extract lines ~763-782 from generator.ts

**Key points**:

- Checks if target has import path (required for exports)
- Calls `shouldExportFile` to determine if export is needed
- Calls `ensureFileExported` to add the export
- Calculates relative file path in target project

**Code**:

```typescript
import type { Tree } from '@nx/devkit';
import type { ProjectConfiguration } from '@nx/devkit';
import * as path from 'path';
import type { MoveContext } from '../types/move-context';
import type { MoveFileGeneratorSchema } from '../schema';
import { shouldExportFile } from './should-export-file';
import { ensureFileExported } from './ensure-file-exported';

/**
 * Ensures the moved file is exported from the target project when required.
 *
 * @param tree - The virtual file system tree.
 * @param ctx - Resolved move context.
 * @param options - Generator options controlling export behavior.
 */
export function ensureExportIfNeeded(
  tree: Tree,
  ctx: MoveContext,
  options: MoveFileGeneratorSchema,
): void {
  const { targetImportPath, targetProject, normalizedTarget } = ctx;

  if (!targetImportPath) {
    return;
  }

  if (!shouldExportFile(ctx, options)) {
    return;
  }

  const targetRoot = targetProject.sourceRoot || targetProject.root;
  const relativeFilePathInTarget = path.relative(targetRoot, normalizedTarget);

  ensureFileExported(tree, targetProject, relativeFilePathInTarget);
}
```

### Task 6.2: Create tests for ensure-export-if-needed

**File**: `packages/workspace/src/generators/move-file/export-management/ensure-export-if-needed.spec.ts`

**Test coverage**:

- Should call ensureFileExported when shouldExportFile returns true
- Should skip export when targetImportPath is missing
- Should skip export when shouldExportFile returns false
- Should calculate correct relative path for target file
- Should use sourceRoot when available, otherwise root

**Sample test structure**:

```typescript
import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { ensureExportIfNeeded } from './ensure-export-if-needed';
import { shouldExportFile } from './should-export-file';
import { ensureFileExported } from './ensure-file-exported';
import type { MoveContext } from '../types/move-context';

jest.mock('./should-export-file');
jest.mock('./ensure-file-exported');

describe('ensureExportIfNeeded', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    jest.clearAllMocks();
  });

  it('should call ensureFileExported when conditions are met', () => {
    // Test implementation
  });

  it('should skip when targetImportPath is missing', () => {
    // Test implementation
  });

  it('should skip when shouldExportFile returns false', () => {
    // Test implementation
  });

  it('should calculate correct relative path', () => {
    // Test implementation
  });
});
```

### Task 6.3: Create `export-management/should-export-file.ts`

**File**: `packages/workspace/src/generators/move-file/export-management/should-export-file.ts`

**Purpose**: Determines whether the moved file should be exported based on move type and options.

**Implementation**: Extract lines ~791-806 from generator.ts

**Logic**:

- Return false if `skipExport` option is true
- For same-project moves: export only if file was already exported
- For cross-project moves: export if file was exported OR if target project has imports to it

**Code**:

```typescript
import type { MoveContext } from '../types/move-context';
import type { MoveFileGeneratorSchema } from '../schema';

/**
 * Determines whether the moved file should be exported after the move completes.
 *
 * Export logic:
 * - Always skip if skipExport option is true
 * - For same-project moves: maintain existing export status
 * - For cross-project moves: export if previously exported OR if target has imports
 *
 * @param ctx - Resolved move context.
 * @param options - Generator options controlling export behavior.
 * @returns True if an export statement should be ensured.
 */
export function shouldExportFile(
  ctx: MoveContext,
  options: MoveFileGeneratorSchema,
): boolean {
  const { isSameProject, isExported, hasImportsInTarget } = ctx;

  if (options.skipExport) {
    return false;
  }

  if (isSameProject) {
    return isExported;
  }

  return isExported || hasImportsInTarget;
}
```

### Task 6.4: Create tests for should-export-file

**File**: `packages/workspace/src/generators/move-file/export-management/should-export-file.spec.ts`

**Test cases**:

- Should return false when skipExport is true
- Should maintain export status for same-project moves
- Should export if file was exported (cross-project)
- Should export if target has imports (cross-project)
- Should not export if file wasn't exported and no target imports (cross-project)

**Sample test structure**:

```typescript
import { shouldExportFile } from './should-export-file';
import type { MoveContext } from '../types/move-context';
import type { MoveFileGeneratorSchema } from '../schema';

describe('shouldExportFile', () => {
  const createMockContext = (overrides = {}): MoveContext =>
    ({
      isSameProject: false,
      isExported: false,
      hasImportsInTarget: false,
      ...overrides,
    }) as MoveContext;

  const createMockOptions = (overrides = {}): MoveFileGeneratorSchema =>
    ({
      skipExport: false,
      ...overrides,
    }) as MoveFileGeneratorSchema;

  it('should return false when skipExport is true', () => {
    const ctx = createMockContext();
    const options = createMockOptions({ skipExport: true });
    expect(shouldExportFile(ctx, options)).toBe(false);
  });

  it('should maintain export status for same-project moves', () => {
    const ctx = createMockContext({ isSameProject: true, isExported: true });
    const options = createMockOptions();
    expect(shouldExportFile(ctx, options)).toBe(true);
  });

  // Add more tests...
});
```

### Task 6.5: Create `export-management/is-file-exported.ts`

**File**: `packages/workspace/src/generators/move-file/export-management/is-file-exported.ts`

**Purpose**: Checks if a file is currently exported from a project's entrypoint.

**Implementation**: Extract lines ~833-859 from generator.ts

**Dependencies**:

- `getProjectEntryPointPaths` from '../project-analysis/get-project-entry-point-paths'
- `removeSourceFileExtension` from '../path-utils/remove-source-file-extension'
- `escapeRegex` from '../security-utils/escape-regex'
- `cachedTreeExists` from '../cache/cached-tree-exists'
- `treeReadCache` from '../tree-cache'

**Logic**:

1. Get all possible entrypoint paths for the project
2. Remove file extension from the file path
3. Check each entrypoint for export statement matching the file
4. Support various export patterns: `export *`, `export { ... }`, etc.

**Code**:

```typescript
import type { Tree } from '@nx/devkit';
import type { ProjectConfiguration } from '@nx/devkit';
import { getProjectEntryPointPaths } from '../project-analysis/get-project-entry-point-paths';
import { removeSourceFileExtension } from '../path-utils/remove-source-file-extension';
import { escapeRegex } from '../security-utils/escape-regex';
import { cachedTreeExists } from '../cache/cached-tree-exists';
import { treeReadCache } from '../tree-cache';

/**
 * Checks if a file is exported from the project's entrypoint.
 *
 * This function scans project entrypoint files (index.ts, index.tsx, etc.)
 * and checks for export statements matching the given file.
 *
 * Supported export patterns:
 * - export * from "path"
 * - export { Something } from "path"
 * - export Something from "path"
 *
 * @param tree - The virtual file system tree.
 * @param project - Project configuration.
 * @param file - Relative file path within project (e.g., "lib/utils.ts").
 * @returns True if the file is exported from any entrypoint.
 */
export function isFileExported(
  tree: Tree,
  project: ProjectConfiguration,
  file: string,
): boolean {
  const indexPaths = getProjectEntryPointPaths(tree, project);

  const fileWithoutExt = removeSourceFileExtension(file);
  const escapedFile = escapeRegex(fileWithoutExt);

  return indexPaths.some((indexPath) => {
    if (!cachedTreeExists(tree, indexPath)) {
      return false;
    }
    const content = treeReadCache.read(tree, indexPath, 'utf-8');
    if (!content) {
      return false;
    }
    // Support: export ... from "path"
    // Support: export * from "path"
    // Support: export { Something } from "path"
    const exportPattern = new RegExp(
      `export\\s+(?:\\*|\\{[^}]+\\}|.+)\\s+from\\s+['"]\\.?\\.?/.*${escapedFile}['"]`,
    );
    return exportPattern.test(content);
  });
}
```

### Task 6.6: Create tests for is-file-exported

**File**: `packages/workspace/src/generators/move-file/export-management/is-file-exported.spec.ts`

**Test cases**:

- Should detect `export * from` pattern
- Should detect `export { ... } from` pattern
- Should detect `export Something from` pattern
- Should return false when entrypoint doesn't exist
- Should return false when no export statement found
- Should match files without extension
- Should handle relative paths correctly
- Should escape special regex characters in file paths

**Sample test structure**:

```typescript
import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { isFileExported } from './is-file-exported';
import type { ProjectConfiguration } from '@nx/devkit';

describe('isFileExported', () => {
  let tree: Tree;
  let project: ProjectConfiguration;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    project = {
      root: 'libs/mylib',
      sourceRoot: 'libs/mylib/src',
      name: 'mylib',
    } as ProjectConfiguration;
  });

  it('should detect export * from pattern', () => {
    tree.write('libs/mylib/src/index.ts', `export * from './lib/utils';\n`);
    expect(isFileExported(tree, project, 'lib/utils.ts')).toBe(true);
  });

  it('should detect export { ... } from pattern', () => {
    tree.write(
      'libs/mylib/src/index.ts',
      `export { helperFn } from './lib/utils';\n`,
    );
    expect(isFileExported(tree, project, 'lib/utils.ts')).toBe(true);
  });

  it('should return false when no export found', () => {
    tree.write('libs/mylib/src/index.ts', `// No exports\n`);
    expect(isFileExported(tree, project, 'lib/utils.ts')).toBe(false);
  });

  // Add more tests...
});
```

### Task 6.7: Create `export-management/ensure-file-exported.ts`

**File**: `packages/workspace/src/generators/move-file/export-management/ensure-file-exported.ts`

**Purpose**: Adds an export statement for a file to the project's entrypoint.

**Implementation**: Extract lines ~900-927 from generator.ts

**Dependencies**:

- `getProjectEntryPointPaths` from '../project-analysis/get-project-entry-point-paths'
- `removeSourceFileExtension` from '../path-utils/remove-source-file-extension'
- `cachedTreeExists` from '../cache/cached-tree-exists'
- `treeReadCache` from '../tree-cache'
- `logger` from '@nx/devkit'

**Logic**:

1. Get all entrypoint paths for the project
2. Find the first existing index file, or use the first path if none exist
3. Read existing content or start with empty string
4. Generate export statement: `export * from './file';`
5. Check if export already exists to avoid duplicates
6. Write updated content and invalidate cache

**Code**:

```typescript
import type { Tree } from '@nx/devkit';
import type { ProjectConfiguration } from '@nx/devkit';
import { logger } from '@nx/devkit';
import { getProjectEntryPointPaths } from '../project-analysis/get-project-entry-point-paths';
import { removeSourceFileExtension } from '../path-utils/remove-source-file-extension';
import { cachedTreeExists } from '../cache/cached-tree-exists';
import { treeReadCache } from '../tree-cache';

/**
 * Ensures the file is exported from the target project's entrypoint.
 *
 * This function adds an export statement to the project's index file.
 * If the export already exists, it does nothing to avoid duplicates.
 *
 * @param tree - The virtual file system tree.
 * @param project - Project configuration.
 * @param file - Relative file path within project (e.g., "lib/utils.ts").
 */
export function ensureFileExported(
  tree: Tree,
  project: ProjectConfiguration,
  file: string,
): void {
  const indexPaths = getProjectEntryPointPaths(tree, project);

  // Find the first existing index file
  const indexPath =
    indexPaths.find((p) => cachedTreeExists(tree, p)) || indexPaths[0];

  let content = '';
  if (cachedTreeExists(tree, indexPath)) {
    content = treeReadCache.read(tree, indexPath, 'utf-8') || '';
  }

  // Add export for the moved file
  const fileWithoutExt = removeSourceFileExtension(file);
  const exportStatement = `export * from './${fileWithoutExt}';\n`;

  // Check if export already exists
  if (!content.includes(exportStatement.trim())) {
    content += exportStatement;
    tree.write(indexPath, content);
    treeReadCache.invalidateFile(indexPath);
    logger.verbose(`Added export to ${indexPath}`);
  }
}
```

### Task 6.8: Create tests for ensure-file-exported

**File**: `packages/workspace/src/generators/move-file/export-management/ensure-file-exported.spec.ts`

**Test cases**:

- Should add export statement to existing entrypoint
- Should create new entrypoint with export
- Should not duplicate existing export statements
- Should use first existing entrypoint
- Should use first path when no entrypoint exists
- Should invalidate tree cache after writing
- Should log verbose message when adding export
- Should handle files without extension

**Sample test structure**:

```typescript
import { Tree, logger } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { ensureFileExported } from './ensure-file-exported';
import type { ProjectConfiguration } from '@nx/devkit';

describe('ensureFileExported', () => {
  let tree: Tree;
  let project: ProjectConfiguration;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    project = {
      root: 'libs/mylib',
      sourceRoot: 'libs/mylib/src',
      name: 'mylib',
    } as ProjectConfiguration;
    jest.spyOn(logger, 'verbose').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should add export statement to existing entrypoint', () => {
    tree.write('libs/mylib/src/index.ts', '// Existing exports\n');
    ensureFileExported(tree, project, 'lib/utils.ts');

    const content = tree.read('libs/mylib/src/index.ts', 'utf-8');
    expect(content).toContain(`export * from './lib/utils';`);
  });

  it('should not duplicate existing exports', () => {
    tree.write('libs/mylib/src/index.ts', `export * from './lib/utils';\n`);
    ensureFileExported(tree, project, 'lib/utils.ts');

    const content = tree.read('libs/mylib/src/index.ts', 'utf-8');
    const matches = content.match(/export \* from '\.\/lib\/utils'/g);
    expect(matches).toHaveLength(1);
  });

  // Add more tests...
});
```

### Task 6.9: Create `export-management/remove-file-export.ts`

**File**: `packages/workspace/src/generators/move-file/export-management/remove-file-export.ts`

**Purpose**: Removes export statements for a file from the project's entrypoint.

**Implementation**: Extract lines ~932-983 from generator.ts

**Dependencies**:

- `getProjectEntryPointPaths` from '../project-analysis/get-project-entry-point-paths'
- `removeSourceFileExtension` from '../path-utils/remove-source-file-extension'
- `escapeRegex` from '../security-utils/escape-regex'
- `cachedTreeExists` from '../cache/cached-tree-exists'
- `treeReadCache` from '../tree-cache'
- `logger` from '@nx/devkit'

**Logic**:

1. Get all entrypoint paths
2. For each existing entrypoint:
   - Read the content
   - Remove export statements matching the file
   - Support multiple export patterns (export \*, export { ... })
   - If file becomes empty, add `export {};` to prevent runtime errors
   - Write updated content and invalidate cache

**Code**:

```typescript
import type { Tree } from '@nx/devkit';
import type { ProjectConfiguration } from '@nx/devkit';
import { logger } from '@nx/devkit';
import { getProjectEntryPointPaths } from '../project-analysis/get-project-entry-point-paths';
import { removeSourceFileExtension } from '../path-utils/remove-source-file-extension';
import { escapeRegex } from '../security-utils/escape-regex';
import { cachedTreeExists } from '../cache/cached-tree-exists';
import { treeReadCache } from '../tree-cache';

/**
 * Removes the export for a file from the project's entrypoint.
 *
 * This function removes all export statements matching the file from
 * all entrypoint files. If removing the export leaves the file empty,
 * it adds `export {};` to prevent runtime errors.
 *
 * Supported patterns to remove:
 * - export * from "path"
 * - export { ... } from "path"
 *
 * @param tree - The virtual file system tree.
 * @param project - Project configuration.
 * @param file - Relative file path within project (e.g., "lib/utils.ts").
 */
export function removeFileExport(
  tree: Tree,
  project: ProjectConfiguration,
  file: string,
): void {
  const indexPaths = getProjectEntryPointPaths(tree, project);

  // Find existing index files
  indexPaths.forEach((indexPath) => {
    if (!cachedTreeExists(tree, indexPath)) {
      return;
    }

    const content = treeReadCache.read(tree, indexPath, 'utf-8');
    if (!content) {
      return;
    }

    // Remove export for the file
    const fileWithoutExt = removeSourceFileExtension(file);
    const escapedFile = escapeRegex(fileWithoutExt);

    // Match various export patterns
    const exportPatterns = [
      new RegExp(
        `export\\s+\\*\\s+from\\s+['"]\\.\\.?/${escapedFile}['"];?\\s*\\n?`,
        'g',
      ),
      new RegExp(
        `export\\s+\\{[^}]+\\}\\s+from\\s+['"]\\.\\.?/${escapedFile}['"];?\\s*\\n?`,
        'g',
      ),
    ];

    let updatedContent = content;
    exportPatterns.forEach((pattern) => {
      updatedContent = updatedContent.replace(pattern, '');
    });

    if (updatedContent !== content) {
      // If the file becomes empty or whitespace-only, add export {}
      // to prevent runtime errors when importing from the package
      if (updatedContent.trim() === '') {
        updatedContent = 'export {};\n';
      }

      tree.write(indexPath, updatedContent);
      treeReadCache.invalidateFile(indexPath);
      logger.verbose(`Removed export from ${indexPath}`);
    }
  });
}
```

### Task 6.10: Create tests for remove-file-export

**File**: `packages/workspace/src/generators/move-file/export-management/remove-file-export.spec.ts`

**Test cases**:

- Should remove `export *` pattern
- Should remove `export { ... }` pattern
- Should remove multiple export patterns
- Should add `export {}` when file becomes empty
- Should handle multiple entrypoints
- Should skip non-existent entrypoints
- Should invalidate tree cache after writing
- Should log verbose message when removing export
- Should handle files without extension
- Should not modify file if no matching export found

**Sample test structure**:

```typescript
import { Tree, logger } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { removeFileExport } from './remove-file-export';
import type { ProjectConfiguration } from '@nx/devkit';

describe('removeFileExport', () => {
  let tree: Tree;
  let project: ProjectConfiguration;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    project = {
      root: 'libs/mylib',
      sourceRoot: 'libs/mylib/src',
      name: 'mylib',
    } as ProjectConfiguration;
    jest.spyOn(logger, 'verbose').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should remove export * pattern', () => {
    tree.write(
      'libs/mylib/src/index.ts',
      `export * from './lib/utils';\nexport * from './lib/helpers';\n`,
    );
    removeFileExport(tree, project, 'lib/utils.ts');

    const content = tree.read('libs/mylib/src/index.ts', 'utf-8');
    expect(content).not.toContain(`export * from './lib/utils'`);
    expect(content).toContain(`export * from './lib/helpers'`);
  });

  it('should remove export { ... } pattern', () => {
    tree.write(
      'libs/mylib/src/index.ts',
      `export { helperFn } from './lib/utils';\n`,
    );
    removeFileExport(tree, project, 'lib/utils.ts');

    const content = tree.read('libs/mylib/src/index.ts', 'utf-8');
    expect(content).not.toContain(`export { helperFn } from './lib/utils'`);
  });

  it('should add export {} when file becomes empty', () => {
    tree.write('libs/mylib/src/index.ts', `export * from './lib/utils';\n`);
    removeFileExport(tree, project, 'lib/utils.ts');

    const content = tree.read('libs/mylib/src/index.ts', 'utf-8');
    expect(content).toBe('export {};\n');
  });

  // Add more tests...
});
```

### Task 6.11: Update `generator.ts`

**Changes**:

1. Add imports at top of the file:

```typescript
import { ensureExportIfNeeded } from './export-management/ensure-export-if-needed';
import { isFileExported } from './export-management/is-file-exported';
import { removeFileExport } from './export-management/remove-file-export';
```

2. Remove these function definitions:
   - `ensureExportIfNeeded` (lines ~763-782)
   - `shouldExportFile` (lines ~791-806)
   - `isFileExported` (lines ~833-859)
   - `ensureFileExported` (lines ~900-927)
   - `removeFileExport` (lines ~932-983)

3. Keep `checkForImportsInProject` in generator.ts (used by resolveAndValidate)

4. Update line counts:
   - Total lines removed: ~190 lines of function definitions
   - Total lines added: ~3 lines of imports
   - Net reduction: ~187 lines

### Task 6.12: Verification Steps

1. **Run all tests**:

   ```bash
   npx nx test workspace
   ```

2. **Check all tests pass**:

   ```bash
   npx nx test workspace --testPathPattern=move-file
   ```

3. **Verify export-management tests**:

   ```bash
   npx nx test workspace --testPathPattern=export-management
   ```

4. **Check test coverage**:

   ```bash
   npx nx test workspace --coverage --testPathPattern=move-file
   ```

5. **Verify line counts**:

   ```bash
   wc -l packages/workspace/src/generators/move-file/generator.ts
   wc -l packages/workspace/src/generators/move-file/export-management/*.ts
   ```

6. **Run end-to-end tests**:

   ```bash
   npx nx e2e workspace-e2e
   ```

## Expected Outcomes

### Before Phase 6

- `generator.ts`: ~988 lines (after Phase 5)
- Export management functions inline (5 functions, ~190 lines)
- Limited isolated testing of export logic
- All 471 tests passing

### After Phase 6

- `generator.ts`: ~800 lines (~187 lines removed, ~3 lines imports added)
- `export-management/` directory:
  - 5 function files (~200 lines total)
  - 5 test files (~400 lines total)
- All 471+ existing tests still passing
- 40-60+ new unit tests for export management
- Better test coverage for export logic

## Benefits

1. **Modularity**: Export management logic cleanly separated from main generator
2. **Testability**: Each export strategy tested independently with mocks
3. **Maintainability**: Clear boundaries between export detection, addition, and removal
4. **Debuggability**: Easier to trace export-related issues
5. **Reusability**: Functions can be used by other generators

## Risks & Mitigation

### Risk 1: Regex Pattern Matching

**Risk**: Export detection uses regex patterns which can be fragile  
**Mitigation**:

- Comprehensive test coverage with various export formats
- Edge case testing (special characters, nested paths)
- Existing behavior preserved exactly

### Risk 2: Entrypoint File Manipulation

**Risk**: Writing to index files affects public API surface  
**Mitigation**:

- Check for existing exports before adding
- Add `export {}` when file becomes empty to prevent errors
- Invalidate caches after modifications
- Test with multiple entrypoint scenarios

### Risk 3: Cache Invalidation

**Risk**: Tree cache must be invalidated after writes  
**Mitigation**:

- Always call `treeReadCache.invalidateFile()` after writes
- Test cache invalidation behavior
- Document cache dependencies clearly

## Implementation Checklist

- [x] Task 6.1: Create ensure-export-if-needed.ts
- [x] Task 6.2: Create ensure-export-if-needed.spec.ts
- [x] Task 6.3: Create should-export-file.ts
- [x] Task 6.4: Create should-export-file.spec.ts
- [x] Task 6.5: Create is-file-exported.ts
- [x] Task 6.6: Create is-file-exported.spec.ts
- [x] Task 6.7: Create ensure-file-exported.ts
- [x] Task 6.8: Create ensure-file-exported.spec.ts
- [x] Task 6.9: Create remove-file-export.ts
- [x] Task 6.10: Create remove-file-export.spec.ts
- [x] Task 6.11: Update generator.ts imports and remove functions
- [x] Task 6.12: Run verification steps and confirm all tests pass

## Success Criteria

✅ All 10 new files created (5 implementations + 5 test files)  
✅ All 471+ existing tests still passing  
✅ 40-60+ new tests added with >90% coverage  
✅ generator.ts reduced by ~187 lines  
✅ No functional changes to move-file behavior  
✅ All imports correctly resolved  
✅ Performance remains same or improves

## Commit Message Template

```
refactor(workspace): extract export management functions (Phase 6)

Extract export management functions from generator.ts into export-management/ directory

Changes:
- Created export-management/ directory with 5 functions
- Added 40-60+ unit tests for export management logic
- Reduced generator.ts by ~187 lines (from ~988 to ~800 lines)
- All 471+ existing tests passing
- Zero functional changes

Functions extracted:
- ensureExportIfNeeded
- shouldExportFile
- isFileExported
- ensureFileExported
- removeFileExport

BREAKING CHANGE: None - internal refactoring only

Phase 6 of 11 refactoring phases complete
```

## Performance Considerations

### Current Performance

- Export operations are string-based (fast)
- Regex pattern matching is efficient for small index files
- Tree cache reduces file reads

### After Phase 6

- Same performance characteristics
- Better code organization makes optimization easier
- Clear boundaries for adding benchmarks later

### Future Optimization Opportunities

- Add `export-management.bench.ts` for performance testing
- Profile regex performance with large index files
- Consider AST-based export detection for complex cases

## Next Phase Preview

**Phase 7: Extract Validation Functions**

Functions to extract:

- `resolveAndValidate` - Main validation and resolution function
- `resolveWildcardAlias` - Resolves wildcard paths
- `checkForImportsInProject` - Checks for imports (move from generator.ts)

Similar pattern:

- Create `validation/` directory
- Extract functions with tests
- Update generator.ts imports
- Verify all tests pass

Estimated effort: 2-3 hours

## Related Documentation

- [REFACTORING_PLAN.md](./REFACTORING_PLAN.md) - Overall refactoring plan
- [REFACTORING_PHASE_5_GUIDE.md](./REFACTORING_PHASE_5_GUIDE.md) - Previous phase
- [packages/workspace/src/generators/move-file/README.md](./packages/workspace/src/generators/move-file/README.md) - Generator documentation

---

**Created**: 2025-10-14  
**Author**: GitHub Copilot  
**Status**: ✅ Complete

## Phase 6 Completion Summary

**Completed**: 2025-10-14

### Implementation Results

- ✅ Created `export-management/` directory with 5 function files
- ✅ Extracted all 5 export management functions plus helpers
- ✅ Reduced `generator.ts` from 985 to 819 lines (166 lines removed)
- ✅ All 523 existing tests passing (52 new tests added)
- ✅ Zero functional changes
- ✅ Updated all function calls to use new module structure

### Functions Extracted

1. **ensureExportIfNeeded** - Orchestrates export logic based on move context
2. **shouldExportFile** - Determines if a file should be exported
3. **isFileExported** - Checks if a file is currently exported
4. **ensureFileExported** - Adds export statement to entrypoint
5. **removeFileExport** - Removes export statement from entrypoint

### Test Coverage

- 52 new unit tests added
- All export strategies tested with mocks
- Cache integration properly handled
- Edge cases covered (empty files, special characters, multiple entrypoints)

### Notes

- Functions accept `cachedTreeExists` as a parameter to work with the caching system
- Tests pre-create index files to match integration test patterns
- All tree cache properly cleared between tests
- Compiler paths cache properly cleared to avoid test pollution

### Next Phase

Phase 7 will extract validation functions (resolveAndValidate, resolveWildcardAlias, checkForImportsInProject).
