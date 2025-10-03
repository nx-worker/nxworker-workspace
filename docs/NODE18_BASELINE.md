# Node.js 18 Baseline Support

This document describes the Node.js 18 baseline support implementation for this workspace.

## Overview

The repository has been configured to enforce Node.js 18 as the minimum supported runtime version to match Nx 19 compatibility requirements. This ensures the codebase doesn't use features that are only available in Node.js 20+ or 22+.

## Changes Made

### 1. Version Requirements

- **`.node-version`**: Set to `lts/jod` (Node.js 22 LTS) for development
- **`package.json#engines`**:
  - Node.js: `>=18.0.0` (supports Node.js 18 or newer)
  - npm: `>=10.0.0` (supports npm 10 or newer)
- **`@types/node`**: `^18.19.68` (matches the baseline Node.js 18)

**Note**: While development uses Node.js 22 LTS, the codebase is tested and compatible with Node.js 18+. CI should use a matrix strategy to test across multiple Node.js versions (18, 20, 22).

### 2. Build Targets

- **TypeScript (`tsconfig.base.json`)**:
  - `target`: `ES2022` (up from `es2015`)
  - `lib`: `["ES2022"]` (changed from `["es2020", "dom"]`)

- **SWC (`packages/workspace/.swcrc`)**:
  - `target`: `es2022` (up from `es2017`)

**Rationale**: ES2022 is fully supported by Node.js 18 and provides modern JavaScript features while remaining compatible with the baseline.

### 3. ESLint Rules

Added `eslint-plugin-es-x` (v9.1.0) to enforce Node.js 18 compatibility by banning features that are not available or stable in Node.js 18:

#### Banned Features (Node.js 22+)

- `es-x/no-regexp-v-flag`: RegExp Unicode Sets + `/v` flag
- `es-x/no-promise-withresolvers`: Promise.withResolvers()

#### Banned Features (Node.js 20+)

- `es-x/no-array-prototype-toreversed`: Array.prototype.toReversed()
- `es-x/no-array-prototype-tosorted`: Array.prototype.toSorted()
- `es-x/no-array-prototype-tospliced`: Array.prototype.toSpliced()
- `es-x/no-array-prototype-with`: Array.prototype.with()
- `es-x/no-array-prototype-findlast-findlastindex`: Array.prototype.findLast() / findLastIndex()

#### Banned Experimental Features

- Iterator helpers (map, filter, take, drop, flatMap, forEach, reduce, toArray, some, every, find)
- Set methods (union, intersection, difference, symmetricDifference, isSubsetOf, isSupersetOf, isDisjointFrom)

## Safe Features in Node.js 18

The following features are **safe to use** in Node.js 18:

- `structuredClone()` - Stable
- `Object.hasOwn()` - Stable
- Error `cause` option - Stable
- Top-level `await` in ES modules - Stable
- `fetch`, `Request`, `Response`, `FormData` - Stable (with minor edge case differences)
- Web Streams (`ReadableStream`, `TransformStream`) - Available
- `WeakRef` & `FinalizationRegistry` - Present (avoid timing assertions)

## Testing

A test file (`packages/workspace/src/lib/node18-baseline.spec.ts`) has been added to:

1. Document which features are banned
2. Verify Node.js 18 compatible features work correctly
3. Serve as examples for developers

## Validation

To verify compliance:

```bash
# Check linting (will fail if banned features are used)
npx nx lint workspace

# Run tests
npx nx test workspace

# Build the project
npx nx build workspace
```

## Future Upgrades

When upgrading to a newer Node.js baseline (e.g., Node.js 20):

1. Update `.node-version` and `package.json#engines`
2. Update `@types/node` version
3. Review and adjust ESLint rules in `eslint.config.js`
4. Update documentation (README.md, AGENTS.md)
5. Run full test suite to verify compatibility

## References

- [Node.js 18 Release Notes](https://nodejs.org/en/blog/release/v18.0.0)
- [ECMAScript Compatibility Table](https://kangax.github.io/compat-table/es2016plus/)
- [eslint-plugin-es-x Documentation](https://eslint-community.github.io/eslint-plugin-es-x/)
