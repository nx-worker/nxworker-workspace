# AST-based Import Utilities

This module provides AST-based utilities for detecting and updating import statements in TypeScript and JavaScript files.

## Features

- **Accurate import detection** using TypeScript's compiler API
- **Support for all import types**:
  - ES6 imports: `import { x } from 'module'`
  - Dynamic imports: `import('module')`
  - CommonJS requires: `require('module')`
  - Export re-exports: `export { x } from 'module'`
- **Source file caching** for improved performance
- **Preserves formatting**: Quote style, whitespace, comments

## API

### `findImports(sourceCode: string, filePath: string): ImportStatement[]`

Parses source code and returns all import/require statements.

```typescript
const code = `
  import { foo } from 'module1';
  const bar = import('module2');
  const baz = require('module3');
`;

const imports = findImports(code, 'file.ts');
// Returns: [
//   { moduleSpecifier: 'module1', type: 'import', ... },
//   { moduleSpecifier: 'module2', type: 'dynamic-import', ... },
//   { moduleSpecifier: 'module3', type: 'require', ... }
// ]
```

### `hasImportToPath(sourceCode: string, filePath: string, targetPath: string): boolean`

Checks if source code has an import to a specific path.

```typescript
const code = `import { foo } from './target';`;
const hasImport = hasImportToPath(code, 'file.ts', './target');
// Returns: true
```

### `updateImports(sourceCode: string, filePath: string, replacements: Map<string, string>): string | null`

Updates import statements based on a replacement map.

```typescript
const code = `import { foo } from 'old-module';`;
const replacements = new Map([['old-module', 'new-module']]);
const updated = updateImports(code, 'file.ts', replacements);
// Returns: "import { foo } from 'new-module';"
```

### `updateImportsMatching(sourceCode: string, filePath: string, matcher: (moduleSpecifier: string) => string | null): string | null`

Updates imports based on a matcher function.

```typescript
const code = `
  import { a } from './relative';
  import { b } from 'absolute';
`;

const updated = updateImportsMatching(code, 'file.ts', (spec) => {
  if (spec.startsWith('./')) {
    return spec.replace('./', '../new/');
  }
  return null;
});
// Updates only relative imports
```

### `clearCache(): void`

Clears the source file cache. Call this periodically when processing many files to free memory.

```typescript
// After processing a batch of files
clearCache();
```

## Performance

The utilities use caching to optimize performance:

- First parse of a file: ~0.01ms
- Subsequent operations on the same file: ~0.001ms (from cache)

See [PERFORMANCE_REPORT.md](../PERFORMANCE_REPORT.md) for detailed benchmarks.

## Usage in the Generator

The move-file generator uses these utilities to:

1. **Detect imports** to files being moved
2. **Update import paths** when files are relocated
3. **Convert between relative and absolute** imports
4. **Update exports** in index files

All with guaranteed correctness and no false positives from regex limitations.
