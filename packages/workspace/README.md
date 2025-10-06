# @nxworker/workspace

`@nxworker/workspace` is an Nx plugin that ships the `@nxworker/workspace:move-file` generator for safely moving source files between Nx projects while keeping every import, export, and dependent project in sync.

## Highlights

- Moves files across Nx projects, updating static `import`, dynamic `import()`, and re-export statements automatically
- Understands Nx project graphs: re-wires dependent projects when exported files move and preserves package entrypoints
- Runs with strong input validation (path sanitisation, regex escaping, traversal blocking, optional Unicode opt-in)
- Formats affected files with Prettier unless `--skipFormat` is provided
- Backed by an extensive Jest unit suite and 20+ Verdaccio-powered end-to-end scenarios that exercise OS, architecture, and Node.js edge cases

## Requirements

- Nx 19 or later (up to Nx 21)
- Node.js 18, 20, or 22 (same as Nx)

## Platform & Architecture Support

The generator has been validated through automated CI and e2e suites on multiple operating systems and CPU architectures:

- **Linux**: Ubuntu x64/arm64
- **Windows**: Windows Server x64 and Windows 11 arm64
- **macOS**: macOS x64/arm64
- **CPU architectures**: x64/arm64

## Installation and usage

Install the plugin in your Nx workspace and run a plugin with an Nx Console editor extension or the Nx CLI:

```shell
npm install --save-dev @nxworker/workspace

nx generate @nxworker/workspace:move-file <from-file-path> <to-file-path>
```
