# Cache Management

Cache management functions for the move-file generator.

## Purpose

This module provides functions for managing multiple caches used by the move-file generator to optimize performance. The caches store frequently accessed data like file existence checks, project source files, compiler paths, and dependency graphs.

## Functions

- **cached-tree-exists.ts** - Check file existence with caching to avoid redundant tree operations
- **clear-all-caches.ts** - Clear all generator caches (file existence, project source files, compiler paths, dependency graph)
- **get-cached-dependent-projects.ts** - Retrieve cached dependent project information from the dependency graph
- **get-project-source-files.ts** - Get cached list of source files for a project
- **update-file-existence-cache.ts** - Update the file existence cache with new data
- **update-project-source-files-cache.ts** - Update the project source files cache

## Usage

```typescript
import { cachedTreeExists } from './cache/cached-tree-exists';
import { clearAllCaches } from './cache/clear-all-caches';
import { getProjectSourceFiles } from './cache/get-project-source-files';

// Check if file exists with caching
const exists = cachedTreeExists(tree, '/path/to/file.ts');

// Get cached project source files
const sourceFiles = getProjectSourceFiles(projectName, tree, projectConfig);

// Clear all caches when done
clearAllCaches();
```

## Cache Types

The generator uses four main caches:

1. **File Existence Cache**: Stores results of tree.exists() calls to avoid redundant file system checks
2. **Project Source Files Cache**: Stores lists of source files per project to avoid repeated glob operations
3. **Compiler Paths Cache**: Stores TypeScript compiler path mappings to avoid repeated tsconfig reads
4. **Dependency Graph Cache**: Stores dependent project lookups to avoid repeated graph traversals

## Testing

All cache functions have comprehensive unit tests covering:

- Cache hits and misses
- Cache invalidation
- Cache updates
- Edge cases (null values, empty arrays, etc.)

Total: **37 tests**

## Performance Impact

Caching provides significant performance improvements:

- File existence checks: ~10x faster on cache hits
- Project source files: ~50x faster for repeated access
- Compiler paths: Eliminates repeated file I/O
- Dependency graph: ~100x faster for large workspaces

## Related

- [Project Analysis](../project-analysis/README.md) - Uses cached data for project analysis
- [Import Updates](../import-updates/README.md) - Uses cached dependent projects
- [Benchmarks](../benchmarks/README.md) - Performance benchmarks for cache operations
