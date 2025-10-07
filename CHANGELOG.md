# Changelog

## 19.0.0-dev

### Features

- `@nxworker/workspace:move-file` generator: Safely move files between Nx projects while automatically updating all imports, exports, and dependent projects
  - **AST-based import detection and updates**: Uses TypeScript's compiler API for accurate import/export detection and modification
    - Eliminates false positives from comments or string literals
    - Handles all valid JavaScript/TypeScript syntax correctly
    - Performance: 4-5x slower than regex but still very fast (0.01ms per operation)
    - See [PERFORMANCE_REPORT.md](packages/workspace/PERFORMANCE_REPORT.md) for detailed benchmarks
  - Detects source and target Nx projects and their TypeScript path aliases
  - Uses the Nx project graph to resolve dependencies for optimal performance
  - Rewrites imports automatically across the workspace:
    - Relative paths inside the source project
    - Project alias imports across projects
    - Dynamic `import()` expressions, including chained `.then()` access
  - Updates dependent projects when exported files move
  - Removes stale exports from source entrypoint and adds exports to target entrypoint
    - Optional `--skip-export` flag to prevent creating a new export
  - Supports moving multiple files at once by passing a comma-separated list
  - Security hardening with path sanitization and traversal blocking
  - Optional Unicode parameter support via `--allow-unicode` flag
  - Platform support: Linux, Windows, macOS, all x64/arm64
  - ECMAScript Modules (ESM) only, no CommonJS (CJS) support

### Requirements

- Nx 19.8-21.x with `@nx/devkit` installed
- Node.js 18, 20, or 22 (same as Nx)
