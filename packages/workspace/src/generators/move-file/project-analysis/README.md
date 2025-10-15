# Project Analysis

Project analysis and resolution functions for the move-file generator.

## Purpose

This module provides functions for analyzing Nx projects, resolving project metadata, working with TypeScript compiler paths, and understanding project relationships. These functions are essential for determining where files should go and how imports should be updated.

## Functions

- **build-reverse-dependency-map.ts** - Build a reverse dependency map for efficient lookup of dependent projects
- **derive-project-directory-from-source.ts** - Derive the target project directory from the source file path
- **find-project-for-file.ts** - Find which Nx project a file belongs to
- **get-dependent-project-names.ts** - Get names of projects that depend on a target project
- **get-fallback-entry-point-paths.ts** - Get fallback entry point paths when primary paths don't exist
- **get-project-entry-point-paths.ts** - Get entry point paths for a project from package.json
- **get-project-import-path.ts** - Get the import path/alias for a project
- **is-index-file-path.ts** - Check if a path is an index file (index.ts, index.js, etc.)
- **is-project-empty.ts** - Check if a project has no source files (safe to delete)
- **is-wildcard-alias.ts** - Check if an import uses a wildcard path alias
- **points-to-project-index.ts** - Check if an import path points to a project's index file
- **read-compiler-paths.ts** - Read TypeScript compiler path mappings from tsconfig
- **to-first-path.ts** - Helper to extract the first path from an array or string

## Usage

```typescript
import { findProjectForFile } from './project-analysis/find-project-for-file';
import { getProjectImportPath } from './project-analysis/get-project-import-path';
import { getDependentProjectNames } from './project-analysis/get-dependent-project-names';

// Find which project owns a file
const project = findProjectForFile(tree, projects, '/src/components/button.ts');

// Get import alias for a project
const importPath = getProjectImportPath(
  tree,
  'my-library',
  projectConfig,
  compilerPaths,
);

// Get dependent projects
const dependents = getDependentProjectNames(
  'my-library',
  projectGraph,
  cachedDependentProjects,
);
```

## Project Resolution

This module handles various project resolution scenarios:

- **Source project detection**: Automatically find which project a file belongs to
- **Target project validation**: Verify target projects exist and are valid
- **Import path resolution**: Resolve TypeScript path aliases to actual projects
- **Dependency analysis**: Understand which projects depend on which
- **Entry point handling**: Find and validate project entry points

## Compiler Paths

The module works with TypeScript compiler paths:

- Reads `tsconfig.base.json` for path mappings
- Caches compiler paths for performance
- Supports wildcard paths (`@mylib/*`)
- Handles both direct and wildcard aliases

## Testing

All project analysis functions have comprehensive unit tests covering:

- Project resolution (found/not found scenarios)
- Compiler path parsing and caching
- Dependency graph traversal
- Entry point detection
- Edge cases (empty projects, missing files, etc.)

Total: **170 tests**

## Performance

Project analysis is optimized with caching:

- Compiler paths cached after first read
- Dependency graph cached for repeated lookups
- Project resolution uses fast maps and sets
- Minimal file I/O operations

See [Cache](../cache/README.md) for caching details.

## Related

- [Cache](../cache/README.md) - Caching for project data
- [Validation](../validation/README.md) - Uses project analysis for validation
- [Import Updates](../import-updates/README.md) - Uses project analysis for import paths
- [Core Operations](../core-operations/README.md) - Uses project analysis for move decisions
