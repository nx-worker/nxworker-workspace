# Path Utilities

Path manipulation and resolution functions for the move-file generator.

## Purpose

This module provides utilities for working with file paths, building glob patterns, calculating target paths, and generating import specifiers. These functions handle the core path manipulation logic needed to move files and update imports.

## Functions

- **build-file-names.ts** - Construct file name patterns from base names and extensions
- **build-patterns.ts** - Build glob patterns for finding files to move
- **build-target-path.ts** - Calculate the target file path for a move operation
- **get-relative-import-specifier.ts** - Generate relative import paths between files
- **has-source-file-extension.ts** - Check if a path has a source file extension (.ts, .tsx, .js, .jsx)
- **remove-source-file-extension.ts** - Remove source file extensions from paths for imports
- **split-patterns.ts** - Split compound path patterns (comma-separated, glob patterns)
- **strip-file-extension.ts** - Strip file extensions from paths
- **to-absolute-workspace-path.ts** - Convert relative paths to absolute workspace paths

## Usage

```typescript
import { buildTargetPath } from './path-utils/build-target-path';
import { getRelativeImportSpecifier } from './path-utils/get-relative-import-specifier';
import { splitPatterns } from './path-utils/split-patterns';

// Build target path for a move
const targetPath = buildTargetPath(
  ctx.sourceFilePath,
  ctx.targetProject,
  ctx.projectDirectory,
  ctx.deriveProjectDirectory,
);

// Get relative import path
const importPath = getRelativeImportSpecifier(
  '/src/components/button.ts',
  '/src/utils/helpers.ts',
);

// Split comma-separated patterns
const patterns = splitPatterns('src/**/*.ts,test/**/*.spec.ts');
```

## Path Handling

This module handles various path formats:

- **Absolute paths**: `/home/user/workspace/src/file.ts`
- **Relative paths**: `src/file.ts`, `./utils/helper.ts`
- **Glob patterns**: `src/**/*.ts`, `src/*.{ts,tsx}`
- **Import specifiers**: `@mylib/utils`, `./utils/helper`

## Extension Handling

The module works with common file extensions:

- **Source files**: `.ts`, `.tsx`, `.js`, `.jsx`
- **Entry points**: `index.ts`, `index.js`
- **Strippable extensions**: `.ts`, `.tsx`, `.js`, `.jsx` (removed for imports)

## Testing

All path utility functions have comprehensive unit tests covering:

- Various path formats (absolute, relative, with/without extensions)
- Glob pattern parsing and building
- Edge cases (empty strings, special characters, etc.)
- Cross-platform compatibility (Windows/Unix paths)

Total: **103 tests**

## Performance

Path utilities are highly optimized:

- Pure functions with no I/O
- String manipulation only
- Sub-millisecond execution
- Heavily used across the generator

See [Benchmarks](../benchmarks/README.md) for performance data.

## Related

- [Project Analysis](../project-analysis/README.md) - Uses path utils for project resolution
- [Import Updates](../import-updates/README.md) - Uses path utils for import path generation
- [Validation](../validation/README.md) - Uses path utils for path sanitization
- [Constants](../constants/README.md) - File extension constants
