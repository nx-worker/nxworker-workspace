# @nxworker/workspace:move-file

The `@nxworker/workspace:move-file` generator safely moves a file between Nx projects and keeps every import, export, and dependent project aligned.

## Requirements

- Nx 19.8-21.x with `@nx/devkit` installed
- Node.js 18, 20, or 22 (same as Nx)
- ECMAScript Modules (ESM) only, no CommonJS (CJS) support

## Usage

```bash
nx generate @nxworker/workspace:move-file <source-file-path> --project <target-project-name>
```

The generator moves the specified file to the target project, creating any missing destination folders.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `file` | `string` | – | Source file path relative to the workspace root. Can be right-clicked in VS Code for context menu generation. |
| `project` | `string` | – | Name of the target Nx project. Provides a dropdown in Nx Console. |
| `projectDirectory` | `string` | – | Optional directory within the target project's `lib` folder (e.g., `utils` or `features/auth`). Files are placed at `sourceRoot/lib/<projectDirectory>` or `projectRoot/src/lib/<projectDirectory>`. When not specified, files go directly to `sourceRoot/lib` or `projectRoot/src/lib`. |
| `skipExport` | `boolean` | `false` | Skip adding the moved file to the target project's entrypoint if you plan to manage exports manually. |
| `allowUnicode` | `boolean` | `false` | Permit Unicode characters in file paths (less restrictive; use with caution). |

### Examples

```shell
# Move a utility to another project using default directory (lib)
nx generate @nxworker/workspace:move-file packages/lib1/src/utils/helper.ts --project lib2

# Move a file to a specific subdirectory within the target project's lib folder
nx generate @nxworker/workspace:move-file packages/lib1/src/utils/helper.ts --project lib2 --projectDirectory utils

# Move a file within the same project to a different directory
nx generate @nxworker/workspace:move-file packages/lib1/src/utils/helper.ts --project lib1 --projectDirectory features

# Move an exported file without re-exporting it automatically
nx generate @nxworker/workspace:move-file \
  packages/lib1/src/utils/helper.ts \
  --project lib2 \
  --projectDirectory utils \
  --skip-export

# Allow Unicode filenames when moving between projects
nx generate @nxworker/workspace:move-file \
  packages/lib1/src/файл.ts \
  --project lib2 \
  --projectDirectory files \
  --allow-unicode

# Right-click a file in VS Code and select "Generate" to use the context menu
# (requires Nx Console extension)
```

## Behaviour

- Detects the source and target Nx projects as well as their TypeScript path aliases
- Uses the Nx project graph to resolve dependencies for optimal performance
- Rewrites imports automatically, covering
  - Relative paths inside the source project
  - Project alias imports across projects
  - Dynamic `import()` expressions, including chained `.then()` access
- Updates dependent projects when exported files move, ensuring they resolve the target project's import alias
- Removes stale exports from the source entrypoint and adds exports to the target entrypoint unless `--skip-export` is set
- Places files in the target project at `sourceRoot/lib/<projectDirectory>` with `lib` always included in the path

## Security Hardening

- Normalises and sanitises user-supplied paths to block traversal attempts (e.g. `../../..`)
- Rejects regex-special characters that could lead to ReDoS when constructing search expressions
- Provides an explicit `--allowUnicode` escape hatch for workspaces that rely on non-ASCII file names
