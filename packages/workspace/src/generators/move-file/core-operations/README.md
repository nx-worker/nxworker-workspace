# Core Operations

Core move operation functions for the move-file generator.

## Purpose

This module contains the main orchestration logic for executing file moves. It implements the strategy pattern to handle different move scenarios and coordinates all the lower-level operations (validation, path resolution, import updates, export management, etc.).

## Functions

- **execute-move.ts** - Main move orchestrator that coordinates the entire move operation
- **create-target-file.ts** - Create the target file and necessary directories
- **handle-move-strategy.ts** - Strategy pattern router that selects the appropriate move handler
- **handle-same-project-move.ts** - Handle moves within the same project
- **handle-exported-move.ts** - Handle moves of exported files (updates dependent projects)
- **handle-non-exported-alias-move.ts** - Handle moves of non-exported files that use aliases
- **handle-default-move.ts** - Default fallback move handler
- **finalize-move.ts** - Finalize the move (delete source, format, etc.)

## Usage

```typescript
import { executeMove } from './core-operations/execute-move';

// Execute a complete move operation
await executeMove(
  tree,
  ctx,
  projects,
  projectGraph,
  compilerPaths,
  cachedTreeExists,
  getProjectSourceFiles,
);
```

## Move Strategies

The module implements different strategies based on move characteristics:

1. **Same Project Move**: File stays in the same project
   - Update relative imports within the file
   - No export updates needed
   - Minimal dependent project impact

2. **Exported File Move**: File is exported from source project
   - Update imports in all dependent projects
   - Remove export from source entrypoint
   - Add export to target entrypoint
   - Maximum workspace impact

3. **Non-Exported Alias Move**: File uses project aliases but isn't exported
   - Update imports in source and target projects only
   - No export updates needed
   - Medium workspace impact

4. **Default Move**: Fallback for other scenarios
   - Basic import updates
   - Export updates if needed
   - Standard workspace impact

## Orchestration Flow

The execute-move function coordinates these steps:

1. **Validate**: Ensure move is safe and valid (done before calling)
2. **Create Target**: Create target file and directories
3. **Select Strategy**: Choose appropriate move handler
4. **Execute Strategy**: Perform strategy-specific import/export updates
5. **Finalize**: Delete source file, format code, cleanup

## Error Handling

Core operations provide detailed error messages:

- File creation failures
- Import update failures
- Export update failures
- Filesystem errors

All errors include context about which file and operation failed.

## Testing

All core operation functions have comprehensive unit tests covering:

- Each move strategy independently
- Error conditions and edge cases
- Integration with other modules
- End-to-end move scenarios

Total: **32 tests**

## Performance

Core operations are optimized for:

- Minimal file system operations
- Batch processing where possible
- Early exit for no-op scenarios
- Efficient AST transformations

The generator can move hundreds of files in seconds.

## Related

- [Validation](../validation/README.md) - Validates before executing moves
- [Import Updates](../import-updates/README.md) - Handles import path updates
- [Export Management](../export-management/README.md) - Handles export updates
- [Project Analysis](../project-analysis/README.md) - Provides project metadata
- [Cache](../cache/README.md) - Caches data for performance
