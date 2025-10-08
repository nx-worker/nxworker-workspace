# @nxworker/workspace

`@nxworker/workspace` is an Nx plugin that ships the `@nxworker/workspace:move-file` generator for safely moving source files between Nx projects while keeping every import, export, and dependent project in sync.

## Highlights

- Moves files across Nx projects, updating import and re-export statements automatically
- Handles single files, glob patterns, and comma-separated file lists/glob patterns so you can move multiple files in one run
- Understands Nx project graphs: re-wires dependent projects when exported files move and preserves package entrypoints
- Runs with strong input validation (path sanitisation, regex escaping, traversal blocking, optional Unicode opt-in)
- Can optionally remove source project(s) that become empty after a move by opting into `--remove-empty-project`

## Requirements

- Nx 19.8-21.x with `@nx/devkit` and `@nx/workspace` installed
- Node.js 18, 20, or 22 (same as Nx)

## Platform & Architecture Support

The generator has been validated through automated CI and e2e suites on multiple operating systems and CPU architectures:

- **Linux**: Ubuntu x64/arm64
- **Windows**: Windows Server x64 and Windows 11 arm64
- **macOS**: macOS x64/arm64
- **CPU architectures**: x64/arm64

## Installation and usage

Install the plugin in your Nx workspace using `nx add`:

```shell
nx add @nxworker/workspace
nx add @nx/devkit
nx add @nx/workspace

nx generate @nxworker/workspace:move-file <source-file-path> --project <target-project-name>
```

Use glob patterns (e.g. `packages/lib1/**/*.ts`) or comma-separated lists to move several files at once, and pass `--remove-empty-project` when you want the generator to clean up source project(s) that no longer have any source code files after the move.

Alternatively, you can install manually with npm:

```shell
npm install --save-dev @nxworker/workspace @nx/devkit @nx/workspace
```
