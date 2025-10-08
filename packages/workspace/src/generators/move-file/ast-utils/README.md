# AST-based Import Utilities

This module provides AST-based utilities for detecting and updating import statements in TypeScript and JavaScript files.

## Features

- **Accurate import detection** using TypeScript's compiler API
- **Support for all import types**:
  - ES6 imports: `import { x } from 'module'`
  - Dynamic imports: `import('module')`
  - CommonJS requires: `require('module')`
  - Export re-exports: `export { x } from 'module'`
- **Support for all quote styles**: single quotes, double quotes, and backticks (template literals without interpolation)
- **Comprehensive file type support**:
  - TypeScript: `.ts`, `.tsx`, `.mts`, `.cts`
  - JavaScript: `.js`, `.jsx`, `.mjs`, `.cjs`
- **Source file caching** using SHA-256 hashing for improved performance
- **Preserves formatting**: Quote style, whitespace, comments

## Supported File Types

### TypeScript Files

- **`.ts`** - Standard TypeScript files with ES6 imports and type imports
- **`.tsx`** - TypeScript JSX files (React components)
- **`.mts`** - TypeScript ES Module files (ESM with explicit `.mts` extension)
- **`.cts`** - TypeScript CommonJS files (allows both `require()` and `import`)

### JavaScript Files

- **`.js`** - Standard JavaScript files (supports both ESM and CommonJS)
- **`.jsx`** - JavaScript JSX files (React components)
- **`.mjs`** - JavaScript ES Module files (ESM with explicit `.mjs` extension)
- **`.cjs`** - JavaScript CommonJS files (traditional `require()`/`module.exports`)

### CommonJS Support

Full support for CommonJS in all file types:

```javascript
// .cjs files - pure CommonJS
const express = require('express');
const router = require('./routes');
module.exports = { express, router };

// .cts files - TypeScript with CommonJS
import type { Config } from './types';
const validator = require('./validator');

// .js files - can mix ESM and CommonJS
import { modern } from './modern';
const legacy = require('./legacy');
```

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

**Quote style preservation:**

```typescript
// Preserves single quotes
const code1 = `import { a } from 'old';`;
// Result: `import { a } from 'new';`

// Preserves double quotes
const code2 = `import { a } from "old";`;
// Result: `import { a } from "new";`

// Preserves backticks
const code3 = 'import { a } from `old`;';
// Result: 'import { a } from `new`;'
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

The utilities use SHA-256-based caching to optimize performance:

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

## Testing

Comprehensive test coverage includes:

- All file types (`.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.mjs`, `.cjs`, `.cts`)
- CommonJS `require()` statements in all supported files
- Mixed ESM and CommonJS in the same project
- Quote style preservation (single, double, backticks)
- Template literals with and without interpolation
- Edge cases and error conditions

See [import-ast.spec.ts](./import-ast.spec.ts) for the complete test suite.
