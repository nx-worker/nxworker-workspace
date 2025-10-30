# @internal/e2e-util

Internal e2e test harness utilities for cost-efficient testing.

## Overview

This library provides shared test harness utilities to support the consolidated e2e benchmark/correctness suite:

1. **Verdaccio Controller**: Local registry lifecycle management (start, port fallback, reuse, teardown)
2. **Workspace Scaffold Helper**: Creates minimal Nx workspaces with configurable libraries and optional applications
3. **Cleanup Utilities**: Manages temporary directories and Nx cache

## Features

- Deterministic, minimal fixture creation (2-3 libs; optional app) with pinned versions
- Centralized temp workspace path logic (short paths; unique seeding via uniqueId)
- Reuse a single Verdaccio instance across all scenarios
- Fast failure if publish/install sanity checks fail
- Enforces logging policy (logger.verbose by default; minimal info logs)

## Usage

### Verdaccio Controller

```typescript
import { startLocalRegistry, stopLocalRegistry } from '@internal/e2e-util';

// Start registry with preferred port and fallback support
const stop = await startLocalRegistry({ port: 4873, maxFallbackAttempts: 2 });

// ... run tests ...

// Stop registry when done
await stopLocalRegistry(stop);
```

### Workspace Scaffold Helper

```typescript
import { createWorkspace, addSourceFile } from '@internal/e2e-util';

// Create workspace with 2 libraries
const workspace = await createWorkspace({
  name: 'test-workspace',
  libs: 2,
  includeApp: false,
});

// Add a source file to a project
await addSourceFile(
  workspace,
  'lib-a',
  'src/lib/util.ts',
  'export const util = () => 42;',
);
```

### Cleanup Utilities

```typescript
import { cleanupWorkspace, clearNxCache } from '@internal/e2e-util';

// Remove temporary workspace
await cleanupWorkspace(workspacePath);

// Clear Nx cache if needed to force graph rebuild
await clearNxCache();
```

## Building

Run `nx build e2e-util` to build the library.

## Running unit tests

Run `nx test e2e-util` to execute the unit tests via [Jest](https://jestjs.io).
