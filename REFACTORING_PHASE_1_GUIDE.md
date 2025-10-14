# Refactoring Phase 1: Extract Constants and Types

**Status**: ✅ **COMPLETED**

## Overview

This document provides a detailed implementation guide for Phase 1 of the refactoring plan. Phase 1 focuses on extracting constants and types from `generator.ts` into dedicated modules.

**Phase 1 has been successfully completed!** All constants and types have been extracted to dedicated modules with comprehensive test coverage.

## Goals

- Extract all constants to `constants/` directory
- Extract all types to `types/` directory
- One constant group per file
- Unit tests for constant validation
- Update imports in `generator.ts`
- Zero functional changes

## Tasks

### Task 1.1: Create `constants/file-extensions.ts`

**File**: `packages/workspace/src/generators/move-file/constants/file-extensions.ts`

```typescript
/**
 * File extension constants used throughout the move-file generator.
 * These constants define which file types are processed during moves.
 */

/**
 * File extensions that can be used for project entry points.
 * Frozen array to prevent modifications.
 */
export const entrypointExtensions = Object.freeze([
  'ts',
  'mts',
  'cts',
  'mjs',
  'cjs',
  'js',
  'tsx',
  'jsx',
] as const);

/**
 * Base names for primary entry point files.
 * These are commonly used names for the main export file in a project.
 */
export const primaryEntryBaseNames = Object.freeze([
  'public-api',
  'index',
] as const);

/**
 * File extensions for TypeScript and JavaScript source files.
 * Used for identifying files to process during import updates.
 */
export const sourceFileExtensions = Object.freeze([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.mjs',
  '.cts',
  '.cjs',
] as const);

/**
 * File extensions that should be stripped from imports.
 * ESM-specific extensions (.mjs, .mts, .cjs, .cts) are excluded as they are
 * required by the ESM specification.
 */
export const strippableExtensions = Object.freeze([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
] as const);

/**
 * Type representing valid source file extensions.
 */
export type SourceFileExtension = (typeof sourceFileExtensions)[number];

/**
 * Type representing valid strippable extensions.
 */
export type StrippableExtension = (typeof strippableExtensions)[number];

/**
 * Type representing valid entry point extensions.
 */
export type EntrypointExtension = (typeof entrypointExtensions)[number];

/**
 * Type representing valid entry point base names.
 */
export type PrimaryEntryBaseName = (typeof primaryEntryBaseNames)[number];
```

### Task 1.2: Create `constants/file-extensions.spec.ts`

**File**: `packages/workspace/src/generators/move-file/constants/file-extensions.spec.ts`

```typescript
import {
  entrypointExtensions,
  primaryEntryBaseNames,
  sourceFileExtensions,
  strippableExtensions,
} from './file-extensions';

describe('file-extensions', () => {
  describe('entrypointExtensions', () => {
    it('should be frozen', () => {
      expect(Object.isFrozen(entrypointExtensions)).toBe(true);
    });

    it('should contain TypeScript extensions', () => {
      expect(entrypointExtensions).toContain('ts');
      expect(entrypointExtensions).toContain('mts');
      expect(entrypointExtensions).toContain('cts');
      expect(entrypointExtensions).toContain('tsx');
    });

    it('should contain JavaScript extensions', () => {
      expect(entrypointExtensions).toContain('js');
      expect(entrypointExtensions).toContain('mjs');
      expect(entrypointExtensions).toContain('cjs');
      expect(entrypointExtensions).toContain('jsx');
    });

    it('should have exactly 8 extensions', () => {
      expect(entrypointExtensions.length).toBe(8);
    });
  });

  describe('primaryEntryBaseNames', () => {
    it('should be frozen', () => {
      expect(Object.isFrozen(primaryEntryBaseNames)).toBe(true);
    });

    it('should contain standard entry point names', () => {
      expect(primaryEntryBaseNames).toContain('index');
      expect(primaryEntryBaseNames).toContain('public-api');
    });

    it('should have exactly 2 base names', () => {
      expect(primaryEntryBaseNames.length).toBe(2);
    });
  });

  describe('sourceFileExtensions', () => {
    it('should be frozen', () => {
      expect(Object.isFrozen(sourceFileExtensions)).toBe(true);
    });

    it('should contain TypeScript extensions with dots', () => {
      expect(sourceFileExtensions).toContain('.ts');
      expect(sourceFileExtensions).toContain('.tsx');
      expect(sourceFileExtensions).toContain('.mts');
      expect(sourceFileExtensions).toContain('.cts');
    });

    it('should contain JavaScript extensions with dots', () => {
      expect(sourceFileExtensions).toContain('.js');
      expect(sourceFileExtensions).toContain('.jsx');
      expect(sourceFileExtensions).toContain('.mjs');
      expect(sourceFileExtensions).toContain('.cjs');
    });

    it('should have exactly 8 extensions', () => {
      expect(sourceFileExtensions.length).toBe(8);
    });

    it('should all start with a dot', () => {
      sourceFileExtensions.forEach((ext) => {
        expect(ext.startsWith('.')).toBe(true);
      });
    });
  });

  describe('strippableExtensions', () => {
    it('should be frozen', () => {
      expect(Object.isFrozen(strippableExtensions)).toBe(true);
    });

    it('should contain only non-ESM extensions', () => {
      expect(strippableExtensions).toContain('.ts');
      expect(strippableExtensions).toContain('.tsx');
      expect(strippableExtensions).toContain('.js');
      expect(strippableExtensions).toContain('.jsx');
    });

    it('should NOT contain ESM-specific extensions', () => {
      expect(strippableExtensions).not.toContain('.mjs');
      expect(strippableExtensions).not.toContain('.mts');
      expect(strippableExtensions).not.toContain('.cjs');
      expect(strippableExtensions).not.toContain('.cts');
    });

    it('should have exactly 4 extensions', () => {
      expect(strippableExtensions.length).toBe(4);
    });

    it('should all start with a dot', () => {
      strippableExtensions.forEach((ext) => {
        expect(ext.startsWith('.')).toBe(true);
      });
    });
  });

  describe('relationship between constants', () => {
    it('should have entrypointExtensions without dots', () => {
      entrypointExtensions.forEach((ext) => {
        expect(ext.startsWith('.')).toBe(false);
      });
    });

    it('should have sourceFileExtensions with dots', () => {
      sourceFileExtensions.forEach((ext) => {
        expect(ext.startsWith('.')).toBe(true);
      });
    });

    it('should have strippableExtensions be a subset of sourceFileExtensions', () => {
      strippableExtensions.forEach((ext) => {
        expect(sourceFileExtensions).toContain(ext);
      });
    });
  });
});
```

### Task 1.3: Create `types/move-context.ts`

**File**: `packages/workspace/src/generators/move-file/types/move-context.ts`

```typescript
import type { ProjectConfiguration } from '@nx/devkit';

/**
 * Context data for a single file move operation.
 * Contains all resolved paths and metadata needed to execute the move.
 */
export interface MoveContext {
  /**
   * Normalized absolute path of the source file.
   */
  normalizedSource: string;

  /**
   * Normalized absolute path of the target file.
   */
  normalizedTarget: string;

  /**
   * Name of the source project.
   */
  sourceProjectName: string;

  /**
   * Name of the target project.
   */
  targetProjectName: string;

  /**
   * Source project configuration.
   */
  sourceProject: ProjectConfiguration;

  /**
   * Target project configuration.
   */
  targetProject: ProjectConfiguration;

  /**
   * Content of the source file.
   */
  fileContent: string;

  /**
   * Import path/alias for the source project (if available).
   * Example: '@myorg/source-lib'
   */
  sourceImportPath: string | null;

  /**
   * Import path/alias for the target project (if available).
   * Example: '@myorg/target-lib'
   */
  targetImportPath: string | null;

  /**
   * Whether the file is currently exported from the source project's entry point.
   */
  isExportedFromSource: boolean;
}
```

### Task 1.4: Update `generator.ts`

**Changes to make in `generator.ts`**:

1. Remove the constant declarations (lines 28-54):

```typescript
// REMOVE THESE LINES:
const entrypointExtensions = Object.freeze([...]);
const primaryEntryBaseNames = Object.freeze([...]);
const sourceFileExtensions = Object.freeze([...]);
const strippableExtensions = Object.freeze([...]);
```

2. Add imports at the top:

```typescript
// ADD THESE IMPORTS:
import {
  entrypointExtensions,
  primaryEntryBaseNames,
  sourceFileExtensions,
  strippableExtensions,
} from './constants/file-extensions';
import type { MoveContext } from './types/move-context';
```

3. Remove the `MoveContext` type declaration (currently around line 575):

```typescript
// REMOVE THIS LINE:
type MoveContext = ReturnType<typeof resolveAndValidate>;
```

4. Update `resolveAndValidate` return type:

```typescript
// CHANGE FROM:
function resolveAndValidate(
  tree: Tree,
  options: MoveFileGeneratorSchema,
  projects: Map<string, ProjectConfiguration>,
) {
  // ... function body ...
}

// TO:
function resolveAndValidate(
  tree: Tree,
  options: MoveFileGeneratorSchema,
  projects: Map<string, ProjectConfiguration>,
): MoveContext {
  // ... function body ...
}
```

## Testing Strategy

### Unit Tests

```bash
# Run only the new constant tests
npx nx test workspace --testPathPattern=constants/file-extensions.spec.ts
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

## Expected Outcomes

### Before

- `generator.ts`: 1,967 lines, all constants inline
- No type definitions for MoveContext
- No tests for constants

### After

- `generator.ts`: ~1,940 lines (27 lines removed)
- `constants/file-extensions.ts`: ~90 lines
- `constants/file-extensions.spec.ts`: ~120 lines
- `types/move-context.ts`: ~60 lines
- All 140+ tests still pass
- 6+ new tests for constants

## Benefits

1. **Better organization**: Constants are separate from logic
2. **Type safety**: MoveContext explicitly typed
3. **Testability**: Constants can be validated independently
4. **Reusability**: Constants can be imported by other modules
5. **Documentation**: JSDoc on constants explains their purpose

## Phase 1 Completion Status

✅ **All tasks completed successfully:**

- ✅ Created `constants/file-extensions.ts` with all file extension constants
- ✅ Created `constants/file-extensions.spec.ts` with 20 comprehensive tests
- ✅ Created `types/move-context.ts` with MoveContext interface
- ✅ Updated `generator.ts` imports and removed inline constants/types
- ✅ All 140+ existing tests passing
- ✅ All 20 new constant tests passing
- ✅ Build successful
- ✅ Linting passed

## Next Steps

✅ Phase 1 Complete! → **Move to Phase 2: Extract cache functions**

- Follow [REFACTORING_PHASE_2_GUIDE.md](./REFACTORING_PHASE_2_GUIDE.md)
- Use similar pattern: extract → test → verify → commit
- Continue gradually reducing size of generator.ts

## Rollback Plan

If issues arise:

1. Revert the commit
2. All functionality returns to previous state
3. Zero risk since changes are purely organizational

## Commit Message

```
refactor(move-file): extract constants and types to dedicated modules

- Create constants/file-extensions.ts with all file extension constants
- Create types/move-context.ts with MoveContext interface
- Add comprehensive unit tests for constants
- Update imports in generator.ts
- No functional changes, purely organizational

Part of refactoring plan to improve maintainability.
See REFACTORING_PLAN.md for full details.
```
