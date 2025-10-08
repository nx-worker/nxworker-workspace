# @nxworker/workspace:move-file

The `@nxworker/workspace:move-file` generator safely moves files — single paths, glob patterns, and/or comma-separated lists — between Nx projects and keeps every import, export, and dependent project aligned. It can optionally remove empty source projects.

## Requirements

- Nx 19.8-21.x with `@nx/devkit` and `@nx/workspace` installed
- Node.js 18, 20, or 22 (same as Nx)
- Supports both ECMAScript Modules (ESM) and CommonJS (CJS)

## Usage

```bash
nx generate @nxworker/workspace:move-file <source-file-path> --project <target-project-name>
```

The generator moves the specified file to the target project, creating any missing destination folders.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `file` | `string` | – | Source file path relative to the workspace root. Supports glob patterns (e.g., `packages/lib1/**/*.ts`) and comma-separated list of patterns to move multiple files at once. |
| `project` | `string` | – | Name of the target Nx project. Provides a dropdown in Nx Console. |
| `projectDirectory` | `string` | – | Optional subdirectory within the target project's base folder (e.g., `utils` or `features/auth`). For library projects, files are placed at `sourceRoot/lib/<projectDirectory>`. For application projects, files are placed at `sourceRoot/app/<projectDirectory>`. When not specified, files go to `sourceRoot/lib` for libraries or `sourceRoot/app` for applications. Cannot be used together with `deriveProjectDirectory`. |
| `deriveProjectDirectory` | `boolean` | `false` | Automatically derive the project directory from the source file path. When enabled, the directory structure from the source project will be preserved in the target project (e.g., moving `libs/ui/src/lib/components/button/button.ts` to project `design-system` will place it at `packages/design-system/src/lib/components/button/button.ts`). This is especially useful for bulk moves with glob patterns. Cannot be used together with `projectDirectory`. |
| `skipExport` | `boolean` | `false` | Skip adding the moved file to the target project's entrypoint if you plan to manage exports manually. |
| `removeEmptyProject` | `boolean` | `false` | Automatically remove source projects that become empty after moving files (only index file and configuration files remain). Requires `@nx/workspace` peer dependency. |
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

# Move all files from lib1 to lib2 and remove lib1 if it becomes empty
# Target: packages/lib2/src/lib/helper.ts (and lib1 is removed if empty)
nx generate @nxworker/workspace:move-file \
  packages/lib1/src/lib/helper.ts \
  --project lib2 \
  --remove-empty-project

# Right-click a file in VS Code and select "Generate" to use the context menu
# (requires Nx Console extension)

# Move all TypeScript files from a directory using glob pattern
# Target: packages/lib2/src/lib/file1.ts, packages/lib2/src/lib/file2.ts, etc.
nx generate @nxworker/workspace:move-file \
  'packages/lib1/src/lib/*.ts' \
  --project lib2

# Move all spec files using glob pattern
# Target: packages/lib2/src/lib/component.spec.ts, packages/lib2/src/lib/service.spec.ts, etc.
nx generate @nxworker/workspace:move-file \
  'packages/lib1/**/*.spec.ts' \
  --project lib2

# Derive project directory from source path for a single file
# Source: libs/ui/src/lib/components/button/button.component.ts
# Target: packages/design-system/src/lib/components/button/button.component.ts
nx generate @nxworker/workspace:move-file \
  'libs/ui/src/lib/components/button/button.component.ts' \
  --project design-system \
  --derive-project-directory

# Derive project directory for bulk moves with glob pattern
# Source: libs/ui/src/lib/components/**/*.ts
# Target: packages/design-system/src/lib/components/**/*.ts (preserving directory structure)
nx generate @nxworker/workspace:move-file \
  'libs/ui/src/lib/components/**/*.ts' \
  --project design-system \
  --derive-project-directory

# Derive project directory for multiple component files
# Target: Each file preserves its directory structure in the target project
nx generate @nxworker/workspace:move-file \
  'libs/ui/src/lib/features/auth/**/*.{ts,html,css}' \
  --project design-system \
  --derive-project-directory

# Move multiple files using comma-separated glob patterns
# Target: All .ts and .css files from lib1 to lib2
nx generate @nxworker/workspace:move-file \
  'packages/lib1/src/lib/*.ts,packages/lib1/src/lib/*.css' \
  --project lib2

# Combine direct paths and glob patterns
# Target: Specific file and all spec files
nx generate @nxworker/workspace:move-file \
  'packages/lib1/src/lib/helper.ts,packages/lib1/**/*.spec.ts' \
  --project lib2
```

## Behaviour

- Detects the source and target Nx projects as well as their TypeScript path aliases
- Uses the Nx project graph to resolve dependencies for optimal performance
- Rewrites imports automatically using AST-based transformations (jscodeshift), covering:
  - **ESM**: Static `import`, dynamic `import()`, and re-exports (`export * from`)
  - **CommonJS**: `require()`, `require.resolve()`, `module.exports`, and `exports`
  - Relative paths inside the source project
  - Project alias imports across projects
  - Dynamic `import()` expressions, including chained `.then()` access
- Updates dependent projects when exported files move, ensuring they resolve the target project's import alias
- Removes stale exports from the source entrypoint and adds exports to the target entrypoint unless `--skip-export` is set
- Supports comma-separated file paths and/or glob patterns to bulk move files
- Removes source projects that become empty when `--remove-empty-project` is enabled
- Places files in the target project at `sourceRoot/lib/<projectDirectory>` for libraries or `sourceRoot/app/<projectDirectory>` for applications, with the base directory (`lib` or `app`) always included in the path

## Security Hardening

- Normalises and sanitises user-supplied paths to block traversal attempts (e.g. `../../..`)
- Rejects regex-special characters that could lead to ReDoS when constructing search expressions
- Provides an explicit `--allowUnicode` escape hatch for workspaces that rely on non-ASCII file names
