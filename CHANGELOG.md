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

### Compatibility

- Nx 19.8-21.x with `@nx/devkit` and `@nx/workspace` installed
- Node.js 18, 20, or 22 (same as Nx)
- Linux, Windows, or macOS with x64/arm64
- Supports all common file extensions and module formats
  - ES Modules (ESM) and CommonJS (CJS)
  - TypeScript and JavaScript
  - TSX and JSX
  - Static and dynamic imports
