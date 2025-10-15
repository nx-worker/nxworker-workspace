# Constants

Shared constants for the move-file generator.

## Purpose

This module defines all constants used throughout the move-file generator, including file extension patterns, source file types, and strippable extensions. Centralizing constants improves maintainability and ensures consistency.

## Functions

- **file-extensions.ts** - All file extension constants (source files, entry points, strippable extensions)

## Constants Defined

### Source File Extensions

Extensions for files that contain source code:

```typescript
export const SOURCE_FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'] as const;
```

### Entry Point Extensions

Extensions for project entry point files (index files):

```typescript
export const ENTRY_POINT_EXTENSIONS = ['.ts', '.js'] as const;
```

### Strippable Extensions

Extensions that should be removed from import paths:

```typescript
export const STRIPPABLE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'] as const;
```

## Usage

```typescript
import {
  SOURCE_FILE_EXTENSIONS,
  ENTRY_POINT_EXTENSIONS,
  STRIPPABLE_EXTENSIONS,
} from './constants/file-extensions';

// Check if file is a source file
const isSource = SOURCE_FILE_EXTENSIONS.some((ext) => path.endsWith(ext));

// Check if file is an entry point
const isEntry = ENTRY_POINT_EXTENSIONS.some((ext) => path.endsWith(ext));

// Check if extension should be stripped
const shouldStrip = STRIPPABLE_EXTENSIONS.some((ext) => path.endsWith(ext));
```

## Type Safety

All constants are defined with `as const` for maximum type safety:

- TypeScript infers literal types (e.g., `'.ts'` instead of `string`)
- Prevents accidental modification
- Enables better autocomplete and type checking

## Testing

Constants have dedicated unit tests covering:

- Array contents and order
- Type inference (readonly, literal types)
- No duplicates or invalid values

Total: **20 tests**

## Why Centralize Constants?

1. **Single Source of Truth**: Change extension handling in one place
2. **Consistency**: All code uses the same extension lists
3. **Type Safety**: TypeScript ensures correct usage
4. **Testability**: Constants can be tested independently
5. **Documentation**: Clear what extensions are supported

## Related

- [Path Utils](../path-utils/README.md) - Uses extension constants for path manipulation
- [Project Analysis](../project-analysis/README.md) - Uses entry point extensions
- [Validation](../validation/README.md) - Uses source file extensions
