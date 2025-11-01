# E2E Test Scenarios

This directory contains scenario modules for the cost-efficient end-to-end test suite. Each scenario validates a specific aspect of the `@nxworker/workspace` plugin.

## Scenario Interface

Each scenario module must export a `run()` function that executes the test logic:

```typescript
export async function run(context: ScenarioContext): Promise<void> {
  // Scenario implementation
}
```

**ScenarioContext** provides:

- `workspaceInfo: WorkspaceInfo` - Information about the test workspace
- `logger: Logger` - Logging utilities
- Additional utilities as needed

## Scenario Catalogue

The following 16 scenarios are defined in [issue #319](https://github.com/nx-worker/nxworker-workspace/issues/319):

### Local Registry

- **REG-START** - Start Verdaccio and confirm package availability

### Publish Flow

- **PUBLISH** - Local publish of plugin (dry + actual)

### Install Flow

- **INSTALL** - Create new workspace, install plugin, import check

### Basic Generator

- **MOVE-SMALL** - Move single file lib→lib (2 libs) default options

### App to Lib Move

- **APP-TO-LIB** - Move file from application to library

### Explicit Directory

- **MOVE-PROJECT-DIR** - Move with projectDirectory specified

### Derive Directory

- **MOVE-DERIVE-DIR** - Move with deriveProjectDirectory=true

### Skip Export

- **MOVE-SKIP-EXPORT** - Move exported file with skipExport flag

### Skip Format

- **MOVE-SKIP-FORMAT** - Move file with skipFormat=true

### Allow Unicode

- **MOVE-UNICODE** - Move file with Unicode characters in path

### Remove Empty Project

- **MOVE-REMOVE-EMPTY** - Move last source files triggering project removal

### Path Aliases

- **PATH-ALIASES** - Workspace with 3 libs; multiple alias moves

### Export Updates

- **EXPORTS** - Move exported file and verify index updated

### Repeat/Idempotence

- **REPEAT-MOVE** - Re-run MOVE-PROJECT-DIR ensuring no duplicates

### Graph Reaction

- **GRAPH-REACTION** - Force project graph rebuild after moves

### Scale Sanity

- **SCALE-LIBS** - Generate 10+ libs then one lib→lib move

### Smoke Sentinel

- **SMOKE-SENTINEL** - Combined publish+install+single move

## Implementation Status

> **Note:** Scenario implementations will be added in [issue #322](https://github.com/nx-worker/nxworker-workspace/issues/322).

Currently, this directory contains placeholder documentation. Each scenario will be implemented as a separate module following the interface defined above.

## Guidelines

When implementing scenarios:

- Keep scenario code < ~100 lines
- Single domain focus per scenario
- Use direct Nx commands with stdio: 'inherit'
- Minimize logging noise (use logger.verbose by default)
- Assert only critical invariants
- Keep fixtures small (2-3 libs; app only when needed)

## Cleanup Strategy

### Pattern: Try-Finally with Graceful Failure

All scenarios follow this cleanup pattern to ensure resources are released even when tests fail:

```typescript
let workspace: WorkspaceInfo | undefined;

try {
  workspace = await createWorkspace({ ... });
  // ... test operations ...
} finally {
  if (workspace) {
    try {
      await cleanupWorkspace(workspace.path);
    } catch (error) {
      // Non-critical: Windows file locking
      logger.warn(`Cleanup failed (non-critical): ${error}`);
    }
  }
}
```

### Why Cleanup Failures Are Non-Critical

**Windows File Locking:**

- Node.js processes may hold file handles longer than expected
- Nx daemon, npm, or IDE processes can lock files
- These locks prevent immediate deletion but clear after process exit
- CI runners clean up entire workspace after job completion anyway

**CI Reliability:**

- Unique workspace names (via `uniqueId()`) prevent conflicts between runs
- Each test gets fresh isolation even if previous cleanup failed
- Jest global teardown stops registry and clears temp directories
- Failed cleanup warnings help identify Windows-specific issues without failing tests

**Local Development:**

- Developers can manually delete `tmp/` directory if needed
- Failed cleanup doesn't affect subsequent test runs due to unique names
- Warnings visible in logs for troubleshooting

### Best Practices

1. **Always use try-finally**: Guarantees cleanup attempt even on assertion failure

   ```typescript
   try {
     workspace = await createWorkspace(...);
     // test code
   } finally {
     if (workspace) await cleanupWorkspace(workspace.path);
   }
   ```

2. **Check workspace existence**: Guard against cleanup when workspace wasn't created

   ```typescript
   if (workspace) {
     await cleanupWorkspace(workspace.path);
   }
   ```

3. **Nested try-catch for cleanup**: Prevents cleanup errors from masking test failures

   ```typescript
   finally {
     if (workspace) {
       try {
         await cleanupWorkspace(workspace.path);
       } catch (error) {
         logger.warn(`Cleanup failed: ${error}`);
       }
     }
   }
   ```

4. **Use logger.warn for cleanup failures**: Makes them visible but non-blocking

   ```typescript
   catch (error) {
     logger.warn(`Cleanup failed (non-critical): ${error instanceof Error ? error.message : String(error)}`);
   }
   ```

5. **Unique workspace names**: Include `uniqueId()` to avoid conflicts

   ```typescript
   const workspaceName = `move-small-${uniqueId('ws')}`;
   ```

6. **Short workspace paths**: Helps avoid Windows MAX_PATH issues

   ```typescript
   // Good: Short, flat path
   workspace = await createWorkspace({ name: 'test-ws' });

   // Avoid: Deeply nested paths that may exceed MAX_PATH on Windows
   ```

### Debugging Cleanup Issues

If cleanup consistently fails on your machine:

1. **Check for lingering processes:**
   - Windows: Open Task Manager and look for Node.js/npm processes
   - Linux/Mac: Use `ps aux | grep node` to find processes

2. **Stop Nx daemon:**

   ```bash
   npx nx reset
   ```

3. **Manually delete temp directory:**

   ```bash
   # Windows PowerShell
   Remove-Item -Recurse -Force tmp/

   # Linux/Mac
   rm -rf tmp/
   ```

4. **Check antivirus/file indexing:**
   - Some antivirus software locks files during scans
   - Windows Search Indexer may hold file handles
   - Consider excluding `tmp/` directory from real-time scanning

5. **Use verbose logging:**
   ```bash
   npx nx e2e workspace-e2e --verbose
   ```
   This shows detailed cleanup logs including which files failed to delete

### When Cleanup Matters

Cleanup failures are **non-critical** for:

- CI runs (workspace cleaned after job)
- Local test runs (unique names prevent conflicts)

Cleanup failures **may matter** for:

- Low disk space situations
- Repeated local test runs filling up disk
- Debugging file system issues

In these cases, manually clean `tmp/` directory or restart development environment.

## Timeout Configuration

All scenario tests use a 120-second (2-minute) timeout to accommodate:

```typescript
it('SCENARIO: Description', async () => {
  await runScenario(context);
}, 120000); // 2 min: workspace creation (~30s) + npm install (~20s) + generator execution (~40s) + assertions + cleanup (~30s)
```

**Breakdown:**

- **Workspace creation** (~30s): Creating Nx workspace with `create-nx-workspace`
- **npm install** (~20s): Installing plugin from local registry
- **Generator execution** (~40s): Running move-file generator with file analysis and transformations
- **Assertions** (<5s): Verifying file moves, import updates, and export updates
- **Cleanup** (~30s): Removing temporary workspace directory

**Note:** Times are approximate and may vary based on system performance. CI systems may be slower than local development machines.

## Helpers

Shared utilities for scenarios are located in `./helpers/`:

### `verify-exports.ts`

Verifies that library index files export expected modules after move operations:

```typescript
import { verifyExportInIndex } from './helpers/verify-exports';

// Verify library exports the moved file
verifyExportInIndex(workspace.path, 'lib-shared', 'helper');
```

This helper:

- Reads the library's `src/index.ts` file
- Checks for the expected export name
- Throws descriptive error with file contents if export not found
- Reduces code duplication across scenarios
