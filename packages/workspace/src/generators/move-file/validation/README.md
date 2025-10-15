# Validation Functions

Validation and resolution functions for the move-file generator.

## Purpose

This module provides functions for validating user input, resolving file paths, and ensuring that move operations are safe and valid before execution. It handles path sanitization, project resolution, and import validation.

## Functions

- **resolve-and-validate.ts** - Main validation orchestrator that resolves paths, validates projects, and builds the move context
- **check-for-imports-in-project.ts** - Check if a file has any imports from a specific project (used for validation)

## Usage

```typescript
import { resolveAndValidate } from './validation/resolve-and-validate';
import { checkForImportsInProject } from './validation/check-for-imports-in-project';

// Validate and resolve a move operation
const ctx = resolveAndValidate(
  tree,
  fileOptions,
  projects,
  cachedTreeExists,
  getProjectSourceFiles,
);

// Check if file imports from a project
const hasImports = checkForImportsInProject(
  sourceContent,
  targetProjectName,
  compilerPaths,
);
```

## Validation Checks

The validation module performs these critical checks:

1. **Path Security**: Sanitizes and validates paths to prevent traversal attacks
2. **File Existence**: Verifies source files exist before attempting moves
3. **Project Resolution**: Resolves source and target projects from the workspace
4. **Glob Expansion**: Expands glob patterns and validates all matched files
5. **Target Validation**: Ensures target project exists and is valid
6. **Import Analysis**: Checks for circular dependencies and import conflicts

## Error Handling

The module throws descriptive errors for common issues:

- `Source file not found: <path>`
- `Source project not found for file: <path>`
- `Target project '<name>' not found in workspace`
- `Cannot move file to itself`
- `Invalid path: contains directory traversal`

## Testing

All validation functions have comprehensive unit tests covering:

- Valid inputs and successful validation
- Invalid paths (traversal, malformed, etc.)
- Missing files and projects
- Glob pattern expansion
- Edge cases (empty strings, null values, etc.)

Total: **30 tests**

## Security

This module is critical for security:

- All user-supplied paths are sanitized
- Directory traversal attempts are blocked
- Regex-special characters are escaped
- Unicode validation (when allowed)

See [Security Utils](../security-utils/README.md) for low-level security functions.

## Related

- [Security Utils](../security-utils/README.md) - Path sanitization and validation
- [Project Analysis](../project-analysis/README.md) - Project resolution helpers
- [Path Utils](../path-utils/README.md) - Path manipulation utilities
- [Core Operations](../core-operations/README.md) - Uses validation results to execute moves
