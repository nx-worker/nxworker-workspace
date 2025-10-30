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
