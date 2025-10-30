# E2E Test Harness Utilities

This directory contains shared test harness utilities for end-to-end testing of the `@nxworker/workspace` plugin.

## Overview

The harness provides three main utilities:

1. **Verdaccio Controller** - Manages a local npm registry lifecycle
2. **Workspace Scaffold** - Creates minimal Nx workspaces with configurable libraries and applications
3. **Cleanup Utilities** - Removes temporary workspaces and clears Nx cache

## Usage

### Basic Example

```typescript
import {
  startRegistry,
  createWorkspace,
  addSourceFile,
  cleanupWorkspace,
} from './harness';

// Start the local registry (reuses existing instance if already running)
const registry = await startRegistry({ portPreferred: 4873 });

// Create a workspace with 3 libraries and an app
const workspace = await createWorkspace({
  libs: 3,
  includeApp: true,
});

// Install the plugin from the local registry
execSync(`npm install @nxworker/workspace@e2e`, {
  cwd: workspace.path,
});

// Add a source file to one of the libraries
await addSourceFile({
  workspacePath: workspace.path,
  project: workspace.libs[0], // 'lib-a'
  relativePath: 'src/lib/utils.ts',
  contents: 'export function util() { return "hello"; }',
});

// ... perform tests ...

// Clean up
await cleanupWorkspace({ workspacePath: workspace.path });
registry.stop();
```

## API Reference

### Verdaccio Controller

#### `startRegistry(options?)`

Starts the local Verdaccio registry with port fallback logic.

**Options:**

- `portPreferred` (number, default: 4873) - Preferred port for the registry
- `maxFallbackAttempts` (number, default: 2) - Maximum number of port fallback attempts
- `localRegistryTarget` (string, default: '@nxworker/source:local-registry') - Local registry target
- `storage` (string, default: './tmp/local-registry/storage') - Storage folder
- `verbose` (boolean, default: false) - Enable verbose logging

**Returns:** `Promise<RegistryInfo>`

- `port` - Port on which the registry is running
- `url` - URL of the registry
- `stop` - Function to stop the registry

**Example:**

```typescript
const registry = await startRegistry({ portPreferred: 4873 });
console.log(`Registry running on ${registry.url}`);
```

#### `stopRegistry()`

Stops the local Verdaccio registry.

**Example:**

```typescript
stopRegistry();
```

#### `isRegistryRunning()`

Checks if the registry is currently running.

**Returns:** `boolean`

#### `getRegistryPort()`

Gets the current registry port.

**Returns:** `number | undefined`

#### `getRegistryUrl()`

Gets the current registry URL.

**Returns:** `string | undefined`

### Workspace Scaffold

#### `createWorkspace(options?)`

Creates a minimal Nx workspace with configurable libraries and optional application.

**Options:**

- `name` (string, default: auto-generated) - Name of the workspace
- `libs` (number, default: 2) - Number of libraries to generate
- `includeApp` (boolean, default: false) - Whether to include an application
- `nxVersion` (number, optional) - Nx major version to use
- `baseDir` (string, default: 'process.cwd()/tmp') - Base directory for temporary workspaces

**Returns:** `Promise<WorkspaceInfo>`

- `name` - Name of the workspace
- `path` - Absolute path to the workspace directory
- `libs` - Array of generated library names (e.g., ['lib-a', 'lib-b'])
- `app` - Name of the generated application (if `includeApp` was true)

**Example:**

```typescript
const workspace = await createWorkspace({
  libs: 3,
  includeApp: true,
});
console.log(`Workspace created at ${workspace.path}`);
console.log(`Libraries: ${workspace.libs.join(', ')}`);
console.log(`Application: ${workspace.app}`);
```

#### `addSourceFile(options)`

Adds a source file to a project in the workspace.

**Options:**

- `workspacePath` (string, required) - Absolute path to the workspace directory
- `project` (string, required) - Name of the project
- `relativePath` (string, required) - Relative path within the project
- `contents` (string, required) - File contents

**Example:**

```typescript
await addSourceFile({
  workspacePath: workspace.path,
  project: 'lib-a',
  relativePath: 'src/lib/utils.ts',
  contents: 'export function util() { return "hello"; }',
});
```

#### `getProjectImportAlias(workspacePath, projectName)`

Gets the import alias for a project from tsconfig.base.json.

**Parameters:**

- `workspacePath` (string) - Absolute path to the workspace
- `projectName` (string) - Name of the project

**Returns:** `string` - The import alias (e.g., '@my-workspace/lib-a')

**Example:**

```typescript
const alias = getProjectImportAlias(workspace.path, 'lib-a');
// => '@test-workspace-abc123/lib-a'
```

### Cleanup Utilities

#### `cleanupWorkspace(options)`

Removes a temporary workspace directory with retry logic for Windows file locking.

**Options:**

- `workspacePath` (string, required) - Absolute path to the workspace directory
- `maxRetries` (number, default: 5) - Maximum retry attempts
- `retryDelay` (number, default: 200) - Delay in milliseconds between retries

**Example:**

```typescript
await cleanupWorkspace({
  workspacePath: '/tmp/test-workspace-abc123',
});
```

#### `clearNxCache(options)`

Clears the Nx cache for a workspace.

**Options:**

- `workspacePath` (string, required) - Absolute path to the workspace directory
- `stopDaemon` (boolean, default: true) - Whether to stop the Nx daemon

**Example:**

```typescript
await clearNxCache({
  workspacePath: workspace.path,
  stopDaemon: true,
});
```

#### `cleanupWorkspaces(workspacePaths, options?)`

Cleans up multiple workspaces in parallel.

**Parameters:**

- `workspacePaths` (string[]) - Array of workspace paths to clean up
- `options` (optional) - Cleanup options to apply to all workspaces

**Example:**

```typescript
await cleanupWorkspaces([
  '/tmp/workspace1',
  '/tmp/workspace2',
  '/tmp/workspace3',
]);
```

## Design Principles

### Logging Policy

All harness utilities follow the repository's logging policy:

- Use `logger.verbose()` for operational logs by default
- Only use `logger.info()` or higher levels when explicitly instructed
- Keeps test output clean while still providing visibility when needed with `--verbose`

### Error Handling

- All functions include comprehensive error handling
- Windows-specific issues (EBUSY, ENOTEMPTY) are handled with retry logic
- Path validation and sanitization to prevent security issues

### Deterministic Fixture Creation

- Libraries are created with deterministic names (lib-a, lib-b, etc.)
- Unique workspace names use cryptographic random IDs to avoid collisions
- Short paths to stay within OS limits

### Registry Reuse

- The Verdaccio controller implements a singleton pattern
- Multiple calls to `startRegistry()` reuse the existing instance
- Reduces test execution time and resource usage

## Testing

The harness utilities include comprehensive unit and integration tests:

- `cleanup.spec.ts` - Tests for cleanup utilities
- `workspace-scaffold.spec.ts` - Tests for workspace scaffolding
- `verdaccio-controller.spec.ts` - Tests for registry controller

Run tests with:

```bash
npx nx test workspace-e2e
```

Integration tests that actually start Verdaccio are skipped by default and only run in CI environments.

## Implementation Notes

### File Organization

The harness follows the one-function-per-file pattern established in the move-file generator refactoring:

- Each module exports focused functionality
- Co-located tests verify each module independently
- Index file provides convenient barrel export

### Windows Compatibility

Special handling for Windows platform:

- Retry logic for EBUSY and ENOTEMPTY errors
- File handle cleanup before directory removal
- Process exit handlers to ensure cleanup

### Performance

- Workspace creation is the slowest operation (~30-60 seconds)
- Registry reuse eliminates startup overhead
- Parallel cleanup for multiple workspaces
- Short unique IDs keep paths manageable

## Future Enhancements

Potential improvements for the harness utilities:

1. **Workspace Templates** - Pre-configured workspace templates for common scenarios
2. **Parallel Workspace Creation** - Create multiple workspaces concurrently
3. **Snapshot Restoration** - Save/restore workspace state for faster test iterations
4. **Metrics Collection** - Gather performance metrics during test execution
5. **Custom Generators** - Helper for adding custom generators to test workspaces
