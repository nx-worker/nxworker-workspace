# @internal/e2e-util

E2E test harness utilities for the `@nxworker/workspace` plugin and future e2e benchmarks.

## Purpose

This library provides shared utilities for end-to-end testing across the workspace:

- Managing a local Verdaccio registry lifecycle
- Scaffolding minimal Nx workspaces with configurable libraries and applications
- Cleaning up temporary workspaces and cache

## Features

- **Verdaccio Controller**: Start/stop local npm registry with port fallback and singleton pattern
- **Workspace Scaffold**: Create minimal test workspaces with deterministic library names
- **Cleanup Utilities**: Remove temp directories with Windows-compatible retry logic
- **Type-Safe**: Full TypeScript support with comprehensive JSDoc
- **Well-Tested**: 24+ unit and integration tests

## Usage

See the [comprehensive README](./src/README.md) for full API documentation and examples.

### Quick Example

```typescript
import {
  startRegistry,
  createWorkspace,
  addSourceFile,
  cleanupWorkspace,
} from '@internal/e2e-util';

// Start registry
const registry = await startRegistry();

// Create workspace with 3 libs + app
const workspace = await createWorkspace({
  libs: 3,
  includeApp: true,
});

// Add source files
await addSourceFile({
  workspacePath: workspace.path,
  project: workspace.libs[0],
  relativePath: 'src/lib/utils.ts',
  contents: 'export function util() { return "hello"; }',
});

// Clean up
await cleanupWorkspace({ workspacePath: workspace.path });
registry.stop();
```

## Development

```bash
# Build
npx nx build e2e-util

# Test
npx nx test e2e-util

# Lint
npx nx lint e2e-util
```

## Non-Publishable

This is an internal library (marked as `private: true`) intended for use within the monorepo only.
