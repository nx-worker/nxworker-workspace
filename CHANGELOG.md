# Changelog

## 19.0.0-dev

### Features

- `@nxworker/workspace:move-file` generator: Safely move files between Nx projects while automatically updating all imports, exports, and dependent projects
  - Detects source and target Nx projects and their TypeScript path aliases
  - Uses the Nx project graph to resolve dependencies for optimal performance
  - **AST-based transformations**: Uses jscodeshift for reliable, syntax-aware import updates instead of regex patterns
  - **Full CommonJS support**: Updates `require()`, `require.resolve()`, `module.exports`, and `exports` statements
  - Rewrites imports automatically across the workspace:
    - ESM: Static `import`, dynamic `import()`, and re-exports (`export * from`)
    - CommonJS: `require()`, `require.resolve()`, `module.exports`, and `exports`
    - Relative paths inside the source project
    - Project alias imports across projects
    - Dynamic `import()` expressions, including chained `.then()` access
  - Updates dependent projects when exported files move
  - Removes stale exports from source entrypoint and adds exports to target entrypoint
    - Optional `--skip-export` flag to prevent creating a new export
  - Supports moving multiple files at once:
    - Comma-separated list of file paths
    - Glob patterns (e.g., `packages/lib1/**/*.ts`)
    - Combination of direct paths and glob patterns
  - Properly handles files with multiple dots in the filename (e.g., `util.helper.ts`)
  - Security hardening with path sanitization, regex escaping, and traversal blocking
  - Optional Unicode parameter support via `--allow-unicode` flag
  - Platform support: Linux, Windows, macOS, all x64/arm64
  - Supports both ECMAScript Modules (ESM) and CommonJS (CJS)

### Requirements

- Nx 19.8-21.x with `@nx/devkit` installed
- Node.js 18, 20, or 22 (same as Nx)
