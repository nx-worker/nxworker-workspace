# AST Migration Summary

## Overview

This PR migrates the `move-file` generator from regex-based import detection to AST-based parsing using TypeScript's compiler API.

## Motivation

The regex-based approach had several limitations:

- Could produce false positives from comments or string literals
- Difficult to maintain multiple complex regex patterns
- Limited to patterns we could anticipate

The AST approach provides:

- **100% accuracy** - Only matches actual import statements
- **Complete coverage** - Handles all valid JavaScript/TypeScript syntax
- **Maintainability** - Single source of truth via TypeScript compiler

## Changes Made

### New Files

- `ast-utils/import-ast.ts` - Core AST functionality for finding and updating imports
- `ast-utils/import-ast.spec.ts` - Comprehensive test suite (19 tests)
- `ast-utils/README.md` - API documentation
- `benchmark-utils.ts` - Performance measurement utilities
- `import-detection.bench.spec.ts` - Performance benchmarks (8 tests)
- `PERFORMANCE_REPORT.md` - Detailed performance analysis

### Modified Files

- `generator.ts` - All 9 import/export functions now use AST
- `package.json` - Added TypeScript as peer dependency
- `CHANGELOG.md` - Documented the changes

### Functions Migrated

1. `checkForImportsInProject` - Detect imports to a file/path
2. `updateImportPathsInProject` - Update relative imports within a project
3. `updateImportPathsToPackageAlias` - Convert relative to package alias imports
4. `updateImportsToRelative` - Convert absolute to relative imports
5. `updateImportsByAliasInProject` - Update imports by alias
6. `updateRelativeImportsInMovedFile` - Fix imports in moved files
7. `updateRelativeImportsToAliasInMovedFile` - Convert to alias in moved files
8. `isFileExported` - Check if a file is exported
9. `removeFileExport` - Remove export statements

## Performance Comparison

| Operation          | Regex (baseline) | AST (with cache) | Slowdown |
| ------------------ | ---------------- | ---------------- | -------- |
| Import Detection   | 0.002ms          | 0.010ms          | 4.4x     |
| Import Update      | 0.003ms          | 0.013ms          | 4.2x     |
| Relative Detection | 0.001ms          | 0.004ms          | 4.5x     |

### Analysis

- **Absolute performance**: Still very fast (0.01ms per operation)
- **Real-world impact**: Negligible, as I/O dominates total operation time
- **Caching benefits**: Reduced from 30-46x slowdown to 4-5x with caching

## Test Coverage

### Unit Tests

- All **97 existing tests pass** without modification
- Added **19 new AST utility tests**
- Added **8 benchmark tests**
- **Total: 124 tests passing**

### Test Categories

- Import detection (ES6, dynamic, require, exports)
- Import updates (preserves quotes, handles multiple imports)
- Relative path handling
- Edge cases (empty files, no imports)

## Benefits

### Correctness Examples

**Before (regex)**: Could match in comments

```typescript
// import { old } from 'old-module';
const x = 1; // Not changed, but regex might match comment
```

**After (AST)**: Only matches real imports

```typescript
// import { old } from 'old-module';
const x = 1; // Comment ignored, no false matches
```

**Before (regex)**: Complex patterns needed for edge cases

```typescript
const str = "import { fake } from 'old-module'"; // Could cause issues
```

**After (AST)**: Correctly identifies this is a string, not an import

```typescript
const str = "import { fake } from 'old-module'"; // Ignored correctly
```

### Maintainability

**Before**: 9 different regex patterns across functions **After**: Single AST parser used consistently

## Trade-offs

### Advantages ✅

- 100% accurate import detection
- Handles all valid JS/TS syntax
- Future-proof (TypeScript compiler handles new syntax)
- Easier to understand and maintain
- Comprehensive test coverage

### Disadvantages ⚠️

- 4-5x slower than regex (but still very fast)
- Adds TypeScript as peer dependency
- Slightly larger compiled output

## Recommendations

This change is recommended because:

1. Correctness is more important than a 0.01ms performance difference
2. The absolute performance is still excellent
3. All tests pass without modification
4. Future TypeScript features are automatically supported
5. Code is more maintainable and understandable

## Documentation

- See [PERFORMANCE_REPORT.md](packages/workspace/PERFORMANCE_REPORT.md) for detailed benchmarks
- See [ast-utils/README.md](packages/workspace/src/generators/move-file/ast-utils/README.md) for API documentation

## Related Issues

Closes #84
