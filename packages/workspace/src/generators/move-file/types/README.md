# Types

Shared TypeScript types for the move-file generator.

## Purpose

This module defines TypeScript types and interfaces used throughout the move-file generator. The main type is `MoveContext`, which contains all the data needed to execute a file move operation.

## Types Defined

### MoveContext

The central context object that flows through the entire move operation:

```typescript
export interface MoveContext {
  // Source file information
  sourceFilePath: string;
  sourceProject: ProjectConfiguration;
  sourceProjectName: string;
  sourceEntryPointPaths: string[];

  // Target file information
  targetFilePath: string;
  targetProject: ProjectConfiguration;
  targetProjectName: string;
  targetEntryPointPaths: string[];

  // Move options
  projectDirectory?: string;
  deriveProjectDirectory: boolean;
  skipExport: boolean;
  removeEmptyProject: boolean;

  // Export status
  isExportedFromSource: boolean;
  hasAliasImport: boolean;
}
```

## Usage

```typescript
import { MoveContext } from './types/move-context';

// Create context during validation
const ctx: MoveContext = {
  sourceFilePath: '/src/utils/helper.ts',
  sourceProject: projects['my-lib'],
  sourceProjectName: 'my-lib',
  // ... other properties
};

// Pass context through operations
executeMove(tree, ctx, ...);
```

## Why Centralize Types?

1. **Type Safety**: Ensures all operations use the correct data structure
2. **Documentation**: The type itself documents what data is needed
3. **Refactoring**: Easy to add/modify context properties
4. **IDE Support**: Better autocomplete and type checking
5. **Consistency**: All code uses the same context shape

## Testing

Types are implicitly tested through usage in all other modules. The MoveContext type is used in:

- Validation (creates the context)
- Core operations (consumes the context)
- Import updates (reads context data)
- Export management (reads context data)

Total: Tested indirectly through **601 tests** across all modules

## Related

- [Validation](../validation/README.md) - Creates MoveContext during validation
- [Core Operations](../core-operations/README.md) - Consumes MoveContext for move execution
- All other modules use MoveContext for type safety
