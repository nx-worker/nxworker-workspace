# Changelog

## 19.0.0-dev

### Features

- `@nxworker/workspace:move-file` generator: Safely move files between Nx projects while automatically updating all imports, exports, and dependent projects
  - Detects source and target Nx projects and their TypeScript path aliases
  - Uses the Nx project graph to resolve dependencies for optimal performance
  - Rewrites imports automatically across the workspace
    - Relative paths inside the source project
    - Project alias imports across projects
  - Updates dependent projects when exported files move
  - Removes stale exports from source entrypoint and adds exports to target entrypoint
    - Optional `--skip-export` flag to prevent creating a new export
  - Supports bulk moves by passing a comma-separated list and/or glob pattern(s)
  - Optional `--derive-project-directory` flag automatically preserves the directory structure from the source project in the target project (useful for bulk moves)
  - Security hardening with path sanitization, regex escaping, and traversal blocking
  - Optional Unicode parameter support via `--allow-unicode` flag
  - Optional `--remove-empty-project` flag cleans up source projects that no longer contain source code files after the file move
- `nx add @nxworker/workspace` support
  - The `@nxworker/workspace:init` generator installs the plugin's peer dependencies (`@nx/devkit` and `@nx/workspace`) matching your workspace's Nx version

### Refactoring & Maintainability

The move-file generator has undergone a comprehensive 11-phase refactoring to improve maintainability, testability, and performance:

- **Modular Architecture**: Code organized into 10 domain-specific directories (cache, validation, path-utils, import-updates, export-management, project-analysis, core-operations, constants, types, security-utils, plus benchmarks)
- **Improved Testability**: 601 tests total (88 integration + 497 unit + 16 benchmark tests), up from 141 tests
- **Better Maintainability**: generator.ts reduced from 1,967 to 307 lines (85% reduction)
- **Performance Benchmarks**: 16 benchmark tests with documented baselines to prevent regressions
- **Comprehensive Documentation**: 10 module-level README files, architecture decision record (ADR), and 11-phase refactoring guides
- **One Function Per File**: 55+ functions extracted into focused, testable modules
- **Domain Organization**: Functions grouped by purpose for easy navigation and understanding

See [REFACTORING_INDEX.md](./REFACTORING_INDEX.md) for complete refactoring documentation.

### Compatibility

- Nx 19.8-21.x with `@nx/devkit` and `@nx/workspace` installed
- Node.js 18, 20, or 22 (same as Nx)
- Linux, Windows, or macOS with x64/arm64
- Supports all common file extensions and module formats
  - ES Modules (ESM) and CommonJS (CJS)
  - TypeScript and JavaScript
  - TSX and JSX
  - Static and dynamic imports
