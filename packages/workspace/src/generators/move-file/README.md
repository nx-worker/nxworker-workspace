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
| `projectDirectory` | `string` | – | Optional subdirectory within the target project's base folder (e.g., `utils` or `features/auth`). For library projects, files are placed at `sourceRoot/lib/<projectDirectory>`. For application projects, files are placed at `sourceRoot/app/<projectDirectory>`. When not specified, files go to `sourceRoot/lib` for libraries or `sourceRoot/app` for applications. |
| `skipExport` | `boolean` | `false` | Skip adding the moved file to the target project's entrypoint if you plan to manage exports manually. |
| `allowUnicode` | `boolean` | `false` | Permit Unicode characters in file paths (less restrictive; use with caution). |

### Examples

```shell
# Move a utility to a library project using default directory
# Target: packages/lib2/src/lib/helper.ts
nx generate @nxworker/workspace:move-file packages/lib1/src/utils/helper.ts --project lib2

# Move a file to a specific subdirectory within a library's lib folder
# Target: packages/lib2/src/lib/utils/helper.ts
nx generate @nxworker/workspace:move-file packages/lib1/src/utils/helper.ts --project lib2 --project-directory utils

# Move a file to an application project
# Target: packages/app1/src/app/helper.ts
nx generate @nxworker/workspace:move-file packages/lib1/src/utils/helper.ts --project app1

# Move a file to a specific subdirectory within an application's app folder
# Target: packages/app1/src/app/utils/helper.ts
nx generate @nxworker/workspace:move-file packages/lib1/src/utils/helper.ts --project app1 --project-directory utils

# Move a file within the same library to a different directory
# Target: packages/lib1/src/lib/features/helper.ts
nx generate @nxworker/workspace:move-file packages/lib1/src/utils/helper.ts --project lib1 --project-directory features

# Move an exported file without re-exporting it automatically
# Target: packages/lib2/src/lib/utils/helper.ts
nx generate @nxworker/workspace:move-file \
  packages/lib1/src/utils/helper.ts \
  --project lib2 \
  --project-directory utils \
  --skip-export

# Allow Unicode filenames when moving between projects
# Target: packages/lib2/src/lib/files/файл.ts
nx generate @nxworker/workspace:move-file \
  packages/lib1/src/файл.ts \
  --project lib2 \
  --project-directory files \
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
- Places files in the target project at `sourceRoot/lib/<projectDirectory>` for libraries or `sourceRoot/app/<projectDirectory>` for applications, with the base directory (`lib` or `app`) always included in the path

## Security Hardening

- Normalises and sanitises user-supplied paths to block traversal attempts (e.g. `../../..`)
- Rejects regex-special characters that could lead to ReDoS when constructing search expressions
- Provides an explicit `--allowUnicode` escape hatch for workspaces that rely on non-ASCII file names
