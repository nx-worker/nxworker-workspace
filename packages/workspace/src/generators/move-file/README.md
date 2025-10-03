# Move File Generator

The `move-file` generator moves a file from one Nx project to another and automatically updates import paths throughout the workspace.

## Usage

```bash
nx generate @nxworker/workspace:move-file <source> <target>
```

## Options

### source (required)

Type: `string`

Path to the source file relative to workspace root.

**Example:**

```bash
nx generate @nxworker/workspace:move-file packages/lib1/src/utils/helper.ts packages/lib2/src/utils/helper.ts
```

### target (required)

Type: `string`

Path to the target file relative to workspace root.

**Example:**

```bash
nx generate @nxworker/workspace:move-file packages/lib1/src/utils/helper.ts packages/lib2/src/utils/helper.ts
```

### skipExport (optional)

Type: `boolean`  
Default: `false`

Skip adding the export to the target project's index file.

**Example:**

```bash
nx generate @nxworker/workspace:move-file \
  packages/lib1/src/utils/helper.ts \
  packages/lib2/src/utils/helper.ts \
  --skipExport
```

### skipFormat (optional)

Type: `boolean`  
Default: `false`

Skip formatting files with Prettier after moving.

**Example:**

```bash
nx generate @nxworker/workspace:move-file \
  packages/lib1/src/utils/helper.ts \
  packages/lib2/src/utils/helper.ts \
  --skipFormat
```

### allowUnicode (optional)

Type: `boolean` Default: `false`

When set, the generator will accept Unicode characters in the `from` and `to` paths (for example, file names in Cyrillic, Chinese, etc.). This is less restrictive and may accept characters that could be interpreted as patterns in some contexts — use with caution.

**Example:**

```bash
nx generate @nxworker/workspace:move-file \
  packages/lib1/src/файл.ts \
  packages/lib2/src/файл.ts \
  --allowUnicode
```

## Behavior

The generator automatically determines the source and target projects from the provided file paths.

### Non-Exported Files

If the file is **not** exported from the source project's entrypoint:

1. The file is moved to the target path
2. The file is exported from the target project's entrypoint
3. Import statements in the source project are updated to use the target project's TypeScript path alias

### Exported Files

If the file **is** exported from the source project's entrypoint:

1. The file is moved to the target path
2. The file is exported from the target project's entrypoint
3. The Nx project graph is analyzed to find all dependent projects
4. Import paths in all dependent projects are updated from the source project's path alias to the target project's path alias

## Examples

### Example 1: Moving a Non-Exported Utility File

```bash
# File structure before:
# packages/lib1/src/utils/helper.ts
# packages/lib1/src/index.ts (does not export helper.ts)

nx generate @nxworker/workspace:move-file \
  packages/lib1/src/utils/helper.ts \
  packages/lib2/src/utils/helper.ts

# File structure after:
# packages/lib2/src/utils/helper.ts
# packages/lib2/src/index.ts (exports helper.ts)
# lib1 files that imported './utils/helper' now import '@workspace/lib2'
```

### Example 2: Moving an Exported Module

```bash
# File structure before:
# packages/lib1/src/utils/helper.ts
# packages/lib1/src/index.ts (exports helper.ts)
# packages/app1/src/main.ts (imports from '@workspace/lib1')

nx generate @nxworker/workspace:move-file \
  packages/lib1/src/utils/helper.ts \
  packages/lib2/src/utils/helper.ts

# File structure after:
# packages/lib2/src/utils/helper.ts
# packages/lib2/src/index.ts (exports helper.ts)
# packages/app1/src/main.ts (imports from '@workspace/lib2')
```

## Technical Details

The generator:

- Automatically determines source and target projects from file paths
- Uses the Nx devkit to read and update the virtual file system
- Parses `tsconfig.base.json` to find TypeScript path aliases
- Uses regular expressions to update import statements with proper escaping to prevent ReDoS attacks
- Sanitizes file paths to prevent path traversal attacks
- Automatically formats updated files using Prettier (if configured)
- Validates that source file exists before making changes
- Throws descriptive errors if projects cannot be determined from file paths

### Security

The generator implements several security measures:

- **Path Traversal Prevention**: Input paths are normalized and validated to prevent directory traversal attacks (e.g., `../../etc/passwd`)
- **ReDoS Prevention**: All user input used in regular expressions is properly escaped to prevent Regular Expression Denial of Service attacks

## See Also

- [Nx Generators](https://nx.dev/concepts/generators)
- [Nx Project Graph](https://nx.dev/concepts/mental-model#the-project-graph)
