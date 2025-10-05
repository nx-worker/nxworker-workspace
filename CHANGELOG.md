# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [19.0.0-alpha.0] - 2024-10-05

### Added

- **move-file generator**: Safely move files between Nx projects while automatically updating all imports, exports, and dependent projects
  - Detects source and target Nx projects and their TypeScript path aliases
  - Uses the Nx project graph to resolve dependencies for optimal performance
  - Rewrites imports automatically across the workspace:
    - Relative paths inside the source project
    - Project alias imports across projects
    - Dynamic `import()` expressions, including chained `.then()` access
  - Updates dependent projects when exported files move
  - Removes stale exports from source entrypoint and adds exports to target entrypoint
  - Security hardening with path sanitization, regex escaping, and traversal blocking
  - Optional Unicode filename support via `--allowUnicode` flag
  - Platform support: Linux (x64/arm64), Windows (x64/arm64), macOS (x64/arm64)
  - Node.js support: 18, 20, 22 (matching Nx 19 compatibility)

### Requirements

- Nx 19.8 or later
- Node.js 18.0.0 or later
- npm 10.0.0 or later

[19.0.0-alpha.0]: https://github.com/nx-worker/nxworker-workspace/releases/tag/19.0.0-alpha.0
