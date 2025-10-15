# Export Management

Export management functions for the move-file generator.

## Purpose

This module provides functions for managing exports in project entry points (index files). When files are moved, exports need to be added to the target project's entrypoint and removed from the source project's entrypoint (unless the file wasn't exported).

## Functions

- **add-export-to-entrypoint.ts** - Add an export statement to a project's entry point file
- **is-exported-from-project.ts** - Check if a file is exported from a project's entry point
- **remove-export-from-entrypoint.ts** - Remove an export statement from a project's entry point
- **should-export-file.ts** - Determine if a file should be exported based on generator options
- **update-exports-in-entry-points.ts** - Update exports in both source and target entry points

## Usage

```typescript
import { isExportedFromProject } from './export-management/is-exported-from-project';
import { addExportToEntrypoint } from './export-management/add-export-to-entrypoint';
import { removeExportFromEntrypoint } from './export-management/remove-export-from-entrypoint';

// Check if file is exported
const isExported = isExportedFromProject(
  tree,
  sourceFilePath,
  sourceProject,
  entryPointPaths,
);

// Add export to target project
addExportToEntrypoint(
  tree,
  targetFilePath,
  targetProject,
  targetEntryPointPaths,
);

// Remove export from source project
removeExportFromEntrypoint(
  tree,
  sourceFilePath,
  sourceProject,
  sourceEntryPointPaths,
);
```

## Export Patterns

This module handles various export patterns:

- **Named exports**: `export { Button } from './components/button';`
- **Wildcard exports**: `export * from './components/button';`
- **Default exports**: `export { default as Button } from './components/button';`
- **Barrel files**: Index files that re-export multiple modules

## Entry Point Detection

The module finds entry points by:

1. Reading `package.json` for `main`, `module`, `exports` fields
2. Falling back to common patterns (`src/index.ts`, `index.ts`)
3. Caching entry point paths for performance
4. Supporting multiple entry points (ES and CJS)

## Testing

All export management functions have comprehensive unit tests covering:

- Export detection in various formats
- Export addition with proper formatting
- Export removal without breaking other exports
- Edge cases (no entry point, duplicate exports, etc.)

Total: **52 tests**

## Formatting

Export updates preserve code formatting:

- Maintains existing import/export order
- Uses consistent quote style
- Preserves newlines and spacing
- Works with Prettier/ESLint formatted code

## Related

- [Core Operations](../core-operations/README.md) - Orchestrates export updates
- [Project Analysis](../project-analysis/README.md) - Provides entry point paths
- [Import Updates](../import-updates/README.md) - Complementary import updates
