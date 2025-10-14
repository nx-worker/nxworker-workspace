# Refactoring Phase 7: Extract Validation Functions

## Overview

This document provides a detailed implementation guide for Phase 7 of the refactoring plan. Phase 7 focuses on extracting validation functions from `generator.ts` into a dedicated `validation/` directory.

**Phase 7 Status**: 📋 **READY TO IMPLEMENT**

## Goals

- Extract all validation functions to `validation/` directory
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

✅ Phase 6 must be complete:

- `export-management/` directory with 5 export management functions
- All Phase 6 tests passing

## Validation Functions to Extract

Phase 7 extracts 2 validation functions:

1. **resolveAndValidate** - Main validation and resolution function that orchestrates all validation steps
2. **checkForImportsInProject** - Checks if a project has imports to a given file/path (move from generator.ts to validation/)

**Note**: `resolveWildcardAlias` mentioned in the original plan is already extracted as a private function in `project-analysis/get-project-import-path.ts`, so it does not need to be moved.

## Risk Level

**Low-Medium Risk** - These functions involve:

- Input validation and sanitization
- File existence checks
- Project resolution
- Path construction
- Error handling with clear messages

## Tasks

### Task 7.1: Create `validation/resolve-and-validate.ts`

**File**: `packages/workspace/src/generators/move-file/validation/resolve-and-validate.ts`

**Purpose**: Normalizes, validates, and gathers metadata about the source and target files. This is the main orchestrator for all validation logic.

**Implementation**: Extract lines ~312-477 from generator.ts

**Key points**:

- Validates user input for file path and project name
- Checks file existence using cache
- Finds source and target projects
- Validates project directory options
- Constructs and validates target path
- Reads file content
- Checks export status
- Gets import paths
- Checks for imports in target project
- Returns complete MoveContext

**Code**:

```typescript
import { Tree, ProjectConfiguration } from '@nx/devkit';
import { posix as path } from 'node:path';
import { MoveFileGeneratorSchema } from '../schema';
import { sanitizePath } from '../security-utils/sanitize-path';
import { isValidPathInput } from '../security-utils/is-valid-path-input';
import { treeReadCache } from '../tree-cache';
import type { MoveContext } from '../types/move-context';
import { buildTargetPath } from '../path-utils/build-target-path';
import { findProjectForFile } from '../project-analysis/find-project-for-file';
import { deriveProjectDirectoryFromSource } from '../project-analysis/derive-project-directory-from-source';
import { getProjectImportPath } from '../project-analysis/get-project-import-path';
import { isFileExported } from '../export-management/is-file-exported';
import { checkForImportsInProject } from './check-for-imports-in-project';

/**
 * Normalizes, validates, and gathers metadata about the source and target files.
 *
 * @param tree - The virtual file system tree.
 * @param options - Raw options supplied to the generator.
 * @param projects - Map of all projects in the workspace.
 * @param cachedTreeExists - Function to check if a file exists (with caching).
 * @param getProjectSourceFiles - Function to get project source files (with caching).
 * @returns Resolved context data describing the move operation.
 */
export function resolveAndValidate(
  tree: Tree,
  options: MoveFileGeneratorSchema,
  projects: Map<string, ProjectConfiguration>,
  cachedTreeExists: (tree: Tree, filePath: string) => boolean,
  getProjectSourceFiles: (tree: Tree, projectRoot: string) => string[],
): MoveContext {
  // Check if the file input contains glob characters
  const isGlobPattern = /[*?[\]{}]/.test(options.file);

  // Validate user input to avoid accepting regex-like patterns or dangerous characters
  if (
    !isValidPathInput(options.file, {
      allowUnicode: !!options.allowUnicode,
      allowGlobPatterns: isGlobPattern,
    })
  ) {
    throw new Error(
      `Invalid path input for 'file': contains disallowed characters: "${options.file}"`,
    );
  }

  // Validate project name
  if (
    !isValidPathInput(options.project, {
      allowUnicode: !!options.allowUnicode,
    })
  ) {
    throw new Error(
      `Invalid project name: contains disallowed characters: "${options.project}"`,
    );
  }

  // Validate project name exists
  const targetProject = projects.get(options.project);
  if (!targetProject) {
    throw new Error(
      `Target project "${options.project}" not found in workspace`,
    );
  }

  // Validate that deriveProjectDirectory and projectDirectory are not both set
  if (options.deriveProjectDirectory && options.projectDirectory) {
    throw new Error(
      'Cannot use both "deriveProjectDirectory" and "projectDirectory" options at the same time',
    );
  }

  // Validate projectDirectory if provided
  if (
    options.projectDirectory &&
    !isValidPathInput(options.projectDirectory, {
      allowUnicode: !!options.allowUnicode,
    })
  ) {
    throw new Error(
      `Invalid path input for 'projectDirectory': contains disallowed characters: "${options.projectDirectory}"`,
    );
  }

  const normalizedSource = sanitizePath(options.file);

  // Verify source file exists before deriving directory
  if (!cachedTreeExists(tree, normalizedSource)) {
    throw new Error(`Source file "${normalizedSource}" not found`);
  }

  // Find which project the source file belongs to (needed for deriving directory)
  const sourceProjectInfo = findProjectForFile(projects, normalizedSource);

  if (!sourceProjectInfo) {
    throw new Error(
      `Could not determine source project for file "${normalizedSource}"`,
    );
  }

  const { project: sourceProject, name: sourceProjectName } = sourceProjectInfo;

  // Derive or use provided projectDirectory
  let sanitizedProjectDirectory: string | undefined;

  if (options.deriveProjectDirectory) {
    // Derive the directory from the source file path
    const derivedDirectory = deriveProjectDirectoryFromSource(
      normalizedSource,
      sourceProject,
    );
    sanitizedProjectDirectory = derivedDirectory
      ? sanitizePath(derivedDirectory)
      : undefined;
  } else if (options.projectDirectory) {
    // Sanitize projectDirectory to prevent path traversal
    sanitizedProjectDirectory = sanitizePath(options.projectDirectory);
  }

  // Construct target path from project and optional directory
  const normalizedTarget = buildTargetPath(
    targetProject,
    normalizedSource,
    sanitizedProjectDirectory,
  );

  // Verify target file does not exist
  if (cachedTreeExists(tree, normalizedTarget)) {
    throw new Error(`Target file "${normalizedTarget}" already exists`);
  }

  const targetProjectName = options.project;

  // Read the file content using cached read for better performance
  const fileContent = treeReadCache.read(tree, normalizedSource, 'utf-8');
  if (!fileContent) {
    throw new Error(`Could not read file "${normalizedSource}"`);
  }

  // Get the relative path within the source project to check if it's exported
  const sourceRoot = sourceProject.sourceRoot || sourceProject.root;
  const relativeFilePathInSource = path.relative(sourceRoot, normalizedSource);

  // Check if file is exported from source project entrypoint
  const isExported = isFileExported(
    tree,
    sourceProject,
    relativeFilePathInSource,
    cachedTreeExists,
  );

  // Get import paths for both projects
  const sourceImportPath = getProjectImportPath(
    tree,
    sourceProjectName,
    sourceProject,
  );
  const targetImportPath = getProjectImportPath(
    tree,
    targetProjectName,
    targetProject,
  );

  // Check if target project already has imports to this file
  const hasImportsInTarget =
    !!targetImportPath &&
    checkForImportsInProject(
      tree,
      targetProject,
      sourceImportPath || normalizedSource,
      getProjectSourceFiles,
    );

  // Check if moving within the same project
  const isSameProject = sourceProjectName === targetProjectName;

  return {
    normalizedSource,
    normalizedTarget,
    sourceProject,
    sourceProjectName,
    targetProject,
    targetProjectName,
    fileContent,
    sourceRoot,
    relativeFilePathInSource,
    isExported,
    sourceImportPath,
    targetImportPath,
    hasImportsInTarget,
    isSameProject,
  };
}
```

### Task 7.2: Create comprehensive tests for resolve-and-validate

**File**: `packages/workspace/src/generators/move-file/validation/resolve-and-validate.spec.ts`

**Purpose**: Test all validation scenarios and error paths

**Test scenarios**:

1. **Input Validation Tests**
   - Valid file path with valid project name
   - Invalid file path with special characters
   - Invalid project name with special characters
   - File path with glob patterns (valid when glob is intended)
   - Unicode characters when allowed/disallowed

2. **Project Validation Tests**
   - Target project exists
   - Target project does not exist
   - Both deriveProjectDirectory and projectDirectory set (error)
   - Invalid projectDirectory with path traversal characters

3. **File Existence Tests**
   - Source file exists
   - Source file does not exist
   - Target file does not exist
   - Target file already exists (error)

4. **Project Resolution Tests**
   - Source project can be determined
   - Source project cannot be determined (error)
   - File in project sourceRoot
   - File in project root (no sourceRoot)

5. **Directory Derivation Tests**
   - Derive directory from source file path
   - Use provided project directory
   - No directory provided or derived

6. **Export Status Tests**
   - File is exported from source project
   - File is not exported from source project

7. **Import Path Tests**
   - Both projects have import paths
   - Source project has import path, target doesn't
   - Target project has import path, source doesn't
   - Neither project has import path

8. **Import Check Tests**
   - Target project has imports to file
   - Target project has no imports to file

9. **Same Project Tests**
   - Moving within same project
   - Moving to different project

**Example test code**:

```typescript
import { Tree, ProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { resolveAndValidate } from './resolve-and-validate';
import { MoveFileGeneratorSchema } from '../schema';

describe('resolveAndValidate', () => {
  let tree: Tree;
  let projects: Map<string, ProjectConfiguration>;
  let mockCachedTreeExists: jest.Mock;
  let mockGetProjectSourceFiles: jest.Mock;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    projects = new Map();
    mockCachedTreeExists = jest.fn();
    mockGetProjectSourceFiles = jest.fn().mockReturnValue([]);

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
  });

  describe('input validation', () => {
    it('should validate file path successfully', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
      };

      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      expect(result.normalizedSource).toBe('packages/lib1/src/lib/test.ts');
      expect(result.targetProjectName).toBe('lib2');
    });

    it('should throw error for invalid file path with disallowed characters', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/../../../etc/passwd',
        project: 'lib2',
      };

      expect(() =>
        resolveAndValidate(
          tree,
          options,
          projects,
          mockCachedTreeExists,
          mockGetProjectSourceFiles,
        ),
      ).toThrow(/Invalid path input for 'file'/);
    });

    it('should throw error for invalid project name', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: '../invalid',
      };

      expect(() =>
        resolveAndValidate(
          tree,
          options,
          projects,
          mockCachedTreeExists,
          mockGetProjectSourceFiles,
        ),
      ).toThrow(/Invalid project name/);
    });

    it('should allow glob patterns when intended', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/*.ts',
        project: 'lib2',
      };

      // Note: glob expansion happens before this function is called
      // This test verifies the validation allows glob characters
      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      // Should not throw for glob pattern
      expect(() =>
        resolveAndValidate(
          tree,
          options,
          projects,
          mockCachedTreeExists,
          mockGetProjectSourceFiles,
        ),
      ).toThrow(/Source file.*not found/); // Fails at file existence, not validation
    });
  });

  describe('project validation', () => {
    it('should throw error when target project does not exist', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'nonexistent',
      };

      expect(() =>
        resolveAndValidate(
          tree,
          options,
          projects,
          mockCachedTreeExists,
          mockGetProjectSourceFiles,
        ),
      ).toThrow(/Target project "nonexistent" not found/);
    });

    it('should throw error when both deriveProjectDirectory and projectDirectory are set', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
        deriveProjectDirectory: true,
        projectDirectory: 'custom',
      };

      expect(() =>
        resolveAndValidate(
          tree,
          options,
          projects,
          mockCachedTreeExists,
          mockGetProjectSourceFiles,
        ),
      ).toThrow(
        /Cannot use both "deriveProjectDirectory" and "projectDirectory"/,
      );
    });

    it('should throw error for invalid projectDirectory with path traversal', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
        projectDirectory: '../../../etc',
      };

      expect(() =>
        resolveAndValidate(
          tree,
          options,
          projects,
          mockCachedTreeExists,
          mockGetProjectSourceFiles,
        ),
      ).toThrow(/Invalid path input for 'projectDirectory'/);
    });
  });

  describe('file existence validation', () => {
    it('should throw error when source file does not exist', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/nonexistent.ts',
        project: 'lib2',
      };

      mockCachedTreeExists.mockReturnValue(false);

      expect(() =>
        resolveAndValidate(
          tree,
          options,
          projects,
          mockCachedTreeExists,
          mockGetProjectSourceFiles,
        ),
      ).toThrow(/Source file.*not found/);
    });

    it('should throw error when target file already exists', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
      };

      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');
      tree.write('packages/lib2/src/lib/test.ts', 'export const test = 2;');

      mockCachedTreeExists.mockImplementation((t, filePath) => {
        return tree.exists(filePath);
      });

      expect(() =>
        resolveAndValidate(
          tree,
          options,
          projects,
          mockCachedTreeExists,
          mockGetProjectSourceFiles,
        ),
      ).toThrow(/Target file.*already exists/);
    });

    it('should validate successfully when source exists and target does not', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
      };

      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');

      mockCachedTreeExists.mockImplementation((t, filePath) => {
        return tree.exists(filePath);
      });

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      expect(result.normalizedSource).toBe('packages/lib1/src/lib/test.ts');
      expect(result.normalizedTarget).toBe('packages/lib2/src/lib/test.ts');
    });
  });

  describe('project resolution', () => {
    it('should throw error when source project cannot be determined', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'unknown/path/test.ts',
        project: 'lib2',
      };

      tree.write('unknown/path/test.ts', 'export const test = 1;');
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      expect(() =>
        resolveAndValidate(
          tree,
          options,
          projects,
          mockCachedTreeExists,
          mockGetProjectSourceFiles,
        ),
      ).toThrow(/Could not determine source project/);
    });

    it('should determine source project from file path', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
      };

      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      expect(result.sourceProjectName).toBe('lib1');
      expect(result.sourceProject.root).toBe('packages/lib1');
    });
  });

  describe('same project detection', () => {
    it('should detect same project move', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib1',
      };

      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      expect(result.isSameProject).toBe(true);
    });

    it('should detect cross-project move', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
      };

      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      expect(result.isSameProject).toBe(false);
    });
  });

  describe('file content reading', () => {
    it('should read file content successfully', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
      };

      const content = 'export const test = 1;';
      tree.write('packages/lib1/src/lib/test.ts', content);
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      expect(result.fileContent).toBe(content);
    });

    it('should throw error when file content cannot be read', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
      };

      // File exists but cannot be read (simulated by not writing it)
      mockCachedTreeExists.mockReturnValue(true);

      expect(() =>
        resolveAndValidate(
          tree,
          options,
          projects,
          mockCachedTreeExists,
          mockGetProjectSourceFiles,
        ),
      ).toThrow(/Could not read file/);
    });
  });

  describe('directory handling', () => {
    it('should use provided projectDirectory', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
        projectDirectory: 'custom',
      };

      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      expect(result.normalizedTarget).toBe('packages/lib2/src/custom/test.ts');
    });

    it('should derive directory from source file path', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils/test.ts',
        project: 'lib2',
        deriveProjectDirectory: true,
      };

      tree.write(
        'packages/lib1/src/lib/utils/test.ts',
        'export const test = 1;',
      );
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      // Directory derived from source path structure
      expect(result.normalizedTarget).toContain('lib/utils');
    });
  });
});
```

### Task 7.3: Move `check-for-imports-in-project` from `import-updates/` to `validation/`

**Current location**: `packages/workspace/src/generators/move-file/import-updates/check-for-imports-in-project.ts`

**Target location**: `packages/workspace/src/generators/move-file/validation/check-for-imports-in-project.ts`

**Note**: This function is currently in `import-updates/` but is actually a validation function used by `resolveAndValidate`. It should be moved to the `validation/` directory.

**Current implementation**:

```typescript
import { Tree, ProjectConfiguration } from '@nx/devkit';
import { hasImportSpecifier } from '../jscodeshift-utils';

/**
 * Checks if a project has imports to a given file/path
 *
 * @param tree - The virtual file system tree.
 * @param project - The project configuration.
 * @param importPath - The import path to check for.
 * @param getProjectSourceFilesFn - Function to get project source files.
 * @returns True if any file in the project imports the given path.
 */
export function checkForImportsInProject(
  tree: Tree,
  project: ProjectConfiguration,
  importPath: string,
  getProjectSourceFilesFn: (tree: Tree, projectRoot: string) => string[],
): boolean {
  const sourceFiles = getProjectSourceFilesFn(tree, project.root);

  for (const filePath of sourceFiles) {
    // Use jscodeshift to check for imports
    if (hasImportSpecifier(tree, filePath, importPath)) {
      return true;
    }
  }

  return false;
}
```

**Action**:

1. Move the file from `import-updates/` to `validation/`
2. Update import in `validation/resolve-and-validate.ts` to use local import
3. Update any other imports (check generator.ts)

### Task 7.4: Update `generator.ts` imports and remove inline functions

**Changes to make**:

1. Remove `resolveAndValidate` function definition (lines ~312-477)
2. Remove `checkForImportsInProject` function definition (lines ~787-802)
3. Add imports at the top:

```typescript
import { resolveAndValidate } from './validation/resolve-and-validate';
```

4. Update the call to `resolveAndValidate` on line ~216 to pass the required cache functions:

```typescript
return resolveAndValidate(
  tree,
  fileOptions,
  projects,
  cachedTreeExists,
  getProjectSourceFiles,
);
```

**Before**:

```typescript
function resolveAndValidate(
  tree: Tree,
  options: MoveFileGeneratorSchema,
  projects: Map<string, ProjectConfiguration>,
): MoveContext {
  // ... 165 lines ...
}
```

**After**:

```typescript
// At top of file
import { resolveAndValidate } from './validation/resolve-and-validate';

// In moveFileGenerator function
const ctx = resolveAndValidate(
  tree,
  fileOptions,
  projects,
  cachedTreeExists,
  getProjectSourceFiles,
);
```

## Testing Strategy

### Unit Tests

```bash
# Run only the new validation tests
npx nx test workspace --testPathPattern=validation/resolve-and-validate.spec.ts
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
   # Should have 2 new files in validation/
   ls -la packages/workspace/src/generators/move-file/validation/
   ```

## Expected Outcomes

### Files Created

```
packages/workspace/src/generators/move-file/validation/
├── resolve-and-validate.ts           # Main validation orchestrator
├── resolve-and-validate.spec.ts      # ~300 lines, comprehensive tests
└── check-for-imports-in-project.ts   # Moved from import-updates/
```

### Files Modified

```
packages/workspace/src/generators/move-file/generator.ts
- Remove resolveAndValidate function (~165 lines)
- Remove checkForImportsInProject function (~15 lines)
- Add import for resolveAndValidate
- Update resolveAndValidate call to pass cache functions
- Net reduction: ~180 lines
```

### Test Coverage

- **New unit tests**: ~30-40 tests for resolveAndValidate
- **Existing tests**: All 94+ generator tests should still pass
- **Total test count**: ~134-144 tests

### Metrics

| Metric                | Before | After | Change   |
| --------------------- | ------ | ----- | -------- |
| generator.ts lines    | 819    | ~639  | -180     |
| Validation functions  | 2      | 0     | -2       |
| Test files            | 10     | 11    | +1       |
| Total test coverage   | 94     | ~134  | +40      |
| Functions per file    | Mixed  | 1-2   | Better ✓ |
| Max file size (lines) | 819    | ~300  | Better ✓ |

## Commit Message Template

```
refactor(workspace): extract validation functions (Phase 7)

Extract validation functions from generator.ts to validation/ directory:
- resolveAndValidate
- checkForImportsInProject (moved from import-updates/)

This is part of the incremental refactoring to improve maintainability
and testability by organizing functions into focused modules.

Changes:
- Created validation/resolve-and-validate.ts with main validation logic
- Moved validation/check-for-imports-in-project.ts from import-updates/
- Created validation/resolve-and-validate.spec.ts with comprehensive tests
- Updated generator.ts to import and use validation functions
- Reduced generator.ts from 819 to ~639 lines (~180 lines removed)

Testing:
- Added 40+ unit tests for validation scenarios
- All existing 94 generator tests still passing
- 100% test pass rate maintained

BREAKING CHANGE: None - internal refactoring only

Phase 7 of 11 refactoring phases complete
```

## Performance Considerations

### Current Performance

- Input validation is string-based (very fast)
- File existence checks use cache
- Project resolution is O(n) where n = number of projects
- Import path resolution reads tsconfig once (cached)

### After Phase 7

- Same performance characteristics
- Better code organization for future optimization
- Clear boundaries for adding validation-specific optimizations

### Future Optimization Opportunities

- Add `validation.bench.ts` for performance testing
- Profile validation time for large workspaces
- Consider caching validation results for repeated calls
- Benchmark regex patterns vs. string methods

## Next Phase Preview

**Phase 8: Extract Core Operations**

Functions to extract:

- `moveFileGenerator` - Main entry point (likely stays in generator.ts)
- `executeMove` - Main orchestrator
- `handleMoveStrategy` - Strategy pattern implementation
- `finalizeMove` - Cleanup and finalization

Similar pattern:

- Create `core/` directory
- Extract orchestration functions
- Keep generator.ts minimal
- Verify all tests pass

Estimated effort: 3-4 hours

## Related Documentation

- [REFACTORING_PLAN.md](./REFACTORING_PLAN.md) - Overall refactoring plan
- [REFACTORING_PHASE_6_GUIDE.md](./REFACTORING_PHASE_6_GUIDE.md) - Previous phase
- [packages/workspace/src/generators/move-file/README.md](./packages/workspace/src/generators/move-file/README.md) - Generator documentation

---

**Created**: 2025-10-14  
**Author**: GitHub Copilot  
**Status**: 📋 Ready to implement
