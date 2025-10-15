# Import Updates

Import path update functions for the move-file generator.

## Purpose

This module provides functions for updating import statements when files are moved. It handles updating imports in the moved file itself, updating imports in other files that reference the moved file, and converting between relative and alias imports.

## Functions

- **update-import-paths-in-dependent-projects.ts** - Update imports in projects that depend on the source project
- **update-import-paths-in-project.ts** - Update all imports within a single project
- **update-import-paths-to-package-alias.ts** - Convert imports to use package aliases (e.g., `@mylib/utils`)
- **update-imports-by-alias-in-project.ts** - Update imports that use project aliases
- **update-imports-to-relative.ts** - Convert alias imports to relative imports
- **update-moved-file-imports-if-needed.ts** - Update imports in the moved file if necessary
- **update-relative-imports-in-moved-file.ts** - Update relative imports within the moved file
- **update-relative-imports-to-alias-in-moved-file.ts** - Convert relative imports to aliases in the moved file
- **update-target-project-imports-if-needed.ts** - Update imports in the target project after receiving the file

## Usage

```typescript
import { updateImportPathsInDependentProjects } from './import-updates/update-import-paths-in-dependent-projects';
import { updateMovedFileImportsIfNeeded } from './import-updates/update-moved-file-imports-if-needed';
import { updateImportsToRelative } from './import-updates/update-imports-to-relative';

// Update imports in dependent projects
updateImportPathsInDependentProjects(
  tree,
  ctx,
  compilerPaths,
  getProjectSourceFiles,
);

// Update imports in the moved file
updateMovedFileImportsIfNeeded(tree, ctx, compilerPaths);

// Convert alias imports to relative
updateImportsToRelative(
  tree,
  sourceFilePath,
  oldProjectName,
  newProjectName,
  compilerPaths,
);
```

## Import Update Scenarios

This module handles various import update scenarios:

1. **Same project move**: Update relative imports within the moved file
2. **Cross-project move**: Convert relative imports to aliases or vice versa
3. **Exported file move**: Update imports in dependent projects
4. **Non-exported move**: Update imports within source and target projects only
5. **Alias to relative**: Convert project aliases to relative imports when appropriate
6. **Relative to alias**: Convert relative imports to aliases when crossing project boundaries

## AST Transformations

Import updates use jscodeshift for AST transformations:

- Parse source code into AST
- Find and modify import statements
- Generate updated code with preserved formatting
- Handle both ES modules and CommonJS

See `jscodeshift-utils.ts` for low-level AST utilities.

## Testing

All import update functions have comprehensive unit tests covering:

- Same-project import updates
- Cross-project import updates
- Alias to relative conversions
- Relative to alias conversions
- Edge cases (circular imports, dynamic imports, etc.)

Total: Tests included in generator.spec.ts integration tests

## Performance

Import updates are optimized with:

- AST caching to avoid re-parsing files
- Batch processing of multiple files
- Targeted updates (only files that need changes)
- Efficient string manipulation

See [Benchmarks](../benchmarks/README.md) for performance data.

## Related

- [Project Analysis](../project-analysis/README.md) - Provides project and import path data
- [Path Utils](../path-utils/README.md) - Path manipulation for import paths
- [Cache](../cache/README.md) - Caching for dependent projects
- [Core Operations](../core-operations/README.md) - Orchestrates import updates
