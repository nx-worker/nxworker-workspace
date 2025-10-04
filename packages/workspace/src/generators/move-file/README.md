# @nxworker/workspace:move-file

The `@nxworker/workspace:move-file` generator safely moves a file between Nx projects and keeps every import, export, and dependent project aligned.

## Requirements

- Nx 19.8
- Node.js 18, 20, or 22 (same as Nx)
- ECMAScript Modules (ESM) only, no CommonJS (CJS) support

## Usage

```bash
nx generate @nxworker/workspace:move-file <from-file-path> <to-file-path>
```

The generator infers source and target projects from the provided paths, creating any missing destination folders.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `from` | `string` | – | Source file path relative to the workspace root. |
| `to` | `string` | – | Target file path relative to the workspace root. Missing directories are auto-created. |
| `skipExport` | `boolean` | `false` | Skip adding the moved file to the target project's entrypoint if you plan to manage exports manually. |
| `allowUnicode` | `boolean` | `false` | Permit Unicode characters in the `from`/`to` paths (less restrictive; use with caution). |

### Examples

```shell
# Move a utility within the same project and keep defaults
nx generate @nxworker/workspace:move-file packages/lib1/src/utils/helper.ts packages/lib1/src/features/helper.ts

# Move an exported file to another project without re-exporting it automatically
nx generate @nxworker/workspace:move-file \
  packages/lib1/src/utils/helper.ts \
  packages/lib2/src/utils/helper.ts \
  --skip-export

# Allow Unicode filenames when moving between projects
nx generate @nxworker/workspace:move-file \
  packages/lib1/src/файл.ts \
  packages/lib2/src/файл.ts \
  --allow-unicode
```

## Behaviour

- Detects the source and target Nx projects as well as their TypeScript path aliases
- Uses the Nx project graph to resolve dependencyies for optimal performance
- Rewrites imports automatically, covering
  - Relative paths inside the source project
  - Project alias imports across projects
  - Dynamic `import()` expressions, including chained `.then()` access
- Updates dependent projects when exported files move, ensuring they resolve the target project's import alias
- Removes stale exports from the source entrypoint and adds exports to the target entrypoint unless `--skip-export` is set

## Security Hardening

- Normalises and sanitises user-supplied paths to block traversal attempts (e.g. `../../..`)
- Rejects regex-special characters that could lead to ReDoS when constructing search expressions
- Provides an explicit `--allowUnicode` escape hatch for workspaces that rely on non-ASCII file names
