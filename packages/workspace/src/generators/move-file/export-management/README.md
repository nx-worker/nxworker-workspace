# Export Management

Export management functions for the move-file generator.

## Purpose

This module provides functions for managing exports in project entry points (index files). When files are moved, exports need to be added to the target project's entrypoint and removed from the source project's entrypoint (unless the file wasn't exported).

## Functions

- **index-exports-cache.ts** - Cache system for parsing and storing export information (both re-exports and local exports) from index files
- **is-file-exported.ts** - Check if a file is re-exported from a project's entry point
- **ensure-file-exported.ts** - Add an export statement to a project's entry point if not already present
- **remove-file-export.ts** - Remove export statements for a file from a project's entry point
- **should-export-file.ts** - Determine if a file should be exported based on generator options
- **ensure-export-if-needed.ts** - Conditionally export a file based on strategy

## Index Exports Cache

The `index-exports-cache` module provides a cache system for parsing export information from index/entrypoint files. It supports:

### Export Detection

1. **Re-exports** (`reexports` Set)
   - `export * from './lib/utils'`
   - `export { foo, bar } from './lib/helpers'`
   - `export type { User } from './types'`

2. **Local Named Exports** (`exports` Set)
   - Named declarations: `export const FOO = ...`, `export function fn() {}`, `export class C {}`
   - TypeScript declarations: `export interface I {}`, `export type T = ...`, `export enum E {}`
   - Named lists: `export { a, b as c }` (without `from`)

3. **Default Exports** (`defaultExport` optional string)
   - Named: `export default MyComponent`
   - Anonymous: `export default function() {}`
   - Expressions: `export default { ... }`

### API

```typescript
import { getIndexExports } from './index-exports-cache';

const exports = getIndexExports(tree, 'libs/mylib/src/index.ts');

// Check re-exports
exports.reexports.has('./lib/utils'); // boolean

// Check local exports
exports.exports.has('MyClass'); // boolean

// Check default export
exports.defaultExport === 'MyComponent'; // boolean
```

## Usage

```typescript
import { isFileExported } from './export-management/is-file-exported';
import { ensureFileExported } from './export-management/ensure-file-exported';
import { removeFileExport } from './export-management/remove-file-export';

// Check if file is exported
const isExported = isFileExported(
  tree,
  project,
  'lib/utils.ts',
  cachedTreeExists,
);

// Add export to project
ensureFileExported(tree, project, 'lib/new-file.ts', cachedTreeExists);

// Remove export from project
removeFileExport(tree, project, 'lib/old-file.ts', cachedTreeExists);
```

## Export Patterns

This module handles various export patterns:

- **Named exports**: `export { Button } from './components/button';`
- **Wildcard exports**: `export * from './components/button';`
- **Default exports**: `export { default as Button } from './components/button';`
- **Barrel files**: Index files that re-export multiple modules
- **Local exports**: `export const FOO = ...`, `export function fn() {}`, etc.

## Entry Point Detection

The module finds entry points by:

1. Reading `package.json` for `main`, `module`, `exports` fields
2. Falling back to common patterns (`src/index.ts`, `index.ts`)
3. Caching entry point paths for performance
4. Supporting multiple entry points (ES and CJS)

## Testing

All export management functions have comprehensive unit tests covering:

- Export detection in various formats (re-exports and local exports)
- Export addition with proper formatting
- Export removal without breaking other exports
- Cache functionality and invalidation
- Edge cases (no entry point, duplicate exports, etc.)

**Total: 80+ tests** including comprehensive index-exports-cache coverage

## Performance

The index exports cache uses jscodeshift for AST parsing, which provides:

- Accurate parsing of all export patterns
- Automatic caching to avoid re-parsing
- Integration with existing AST cache
- Efficient cache invalidation when files change

See `../benchmarks/index-exports-cache.bench.ts` for performance benchmarks.

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
- [Benchmarks](../benchmarks/README.md) - Performance benchmarks including export management
