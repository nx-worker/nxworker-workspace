# Move File Generator

The `move-file` generator moves a file from one Nx project to another and automatically updates import paths throughout the workspace.

## Usage

```bash
nx generate @nxworker/workspace:move-file <file> --project=<source-project> --targetProject=<target-project>
```

## Options

### file (required)

Type: `string`

Path to the file relative to the source project's source root.

**Example:**
```bash
nx generate @nxworker/workspace:move-file utils/helper.ts --project=lib1 --targetProject=lib2
```

### project (required)

Type: `string`

The name of the source Nx project containing the file to move.

**Example:**
```bash
--project=lib1
```

### targetProject (required)

Type: `string`

The name of the target Nx project where the file should be moved.

**Example:**
```bash
--targetProject=lib2
```

## Behavior

### Non-Exported Files

If the file is **not** exported from the source project's entrypoint:
1. The file is moved to the same relative path in the target project
2. The file is exported from the target project's entrypoint
3. Import statements in the source project are updated to use the target project's TypeScript path alias

### Exported Files

If the file **is** exported from the source project's entrypoint:
1. The file is moved to the same relative path in the target project
2. The file is exported from the target project's entrypoint
3. The Nx project graph is analyzed to find all dependent projects
4. Import paths in all dependent projects are updated from the source project's path alias to the target project's path alias

## Examples

### Example 1: Moving a Non-Exported Utility File

```bash
# File structure before:
# lib1/src/utils/helper.ts
# lib1/src/index.ts (does not export helper.ts)

nx generate @nxworker/workspace:move-file utils/helper.ts --project=lib1 --targetProject=lib2

# File structure after:
# lib2/src/utils/helper.ts
# lib2/src/index.ts (exports helper.ts)
# lib1 files that imported './utils/helper' now import '@workspace/lib2'
```

### Example 2: Moving an Exported Module

```bash
# File structure before:
# lib1/src/utils/helper.ts
# lib1/src/index.ts (exports helper.ts)
# app1/src/main.ts (imports from '@workspace/lib1')

nx generate @nxworker/workspace:move-file utils/helper.ts --project=lib1 --targetProject=lib2

# File structure after:
# lib2/src/utils/helper.ts
# lib2/src/index.ts (exports helper.ts)
# app1/src/main.ts (imports from '@workspace/lib2')
```

## Technical Details

The generator:
- Uses the Nx devkit to read and update the virtual file system
- Parses `tsconfig.base.json` to find TypeScript path aliases
- Uses regular expressions to update import statements
- Automatically formats updated files using Prettier (if configured)
- Validates that source and target projects exist before making changes
- Throws descriptive errors if the source file does not exist

## See Also

- [Nx Generators](https://nx.dev/concepts/generators)
- [Nx Project Graph](https://nx.dev/concepts/mental-model#the-project-graph)
