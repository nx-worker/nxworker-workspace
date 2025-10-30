# E2E Tests for @nxworker/workspace

End-to-end tests validating the `@nxworker/workspace` Nx plugin in real-world scenarios.

## Architecture

The e2e test suite uses an **orchestrator pattern** to efficiently validate the plugin across multiple scenarios:

### Orchestrator Spec (`workspace.suite.spec.ts`)

A single Jest spec that:

- **Starts Verdaccio once** - Local npm registry reused across all scenarios
- **Publishes plugin once** - `@nxworker/workspace` published to local registry
- **Executes 16 scenarios** - Each scenario validates a specific feature or edge case
- **Maintains isolation** - Each scenario gets its own test workspace
- **Ensures cleanup** - Temp workspaces removed after each scenario

### Scenario Modules (`src/scenarios/`)

Individual scenario modules implement specific test cases:

- Each scenario exports a `run()` function
- Scenarios are executed in deterministic order
- See [scenarios/README.md](./src/scenarios/README.md) for the full catalogue

### Harness Utilities (`@internal/e2e-util`)

Shared utilities from issue #320:

- **Verdaccio Controller** - Registry lifecycle management with port fallback
- **Workspace Scaffold** - Creates minimal Nx workspaces with configurable libs/apps
- **Cleanup Utilities** - Removes temp workspaces and clears Nx cache

## Running Tests

### Run All E2E Tests

```bash
npx nx e2e workspace-e2e
```

This executes the orchestrator spec with all 16 scenarios.

### Run Specific Test File

```bash
npx nx e2e workspace-e2e --testFile=workspace.suite.spec.ts
```

### Run with Verbose Output

```bash
npx nx e2e workspace-e2e --verbose
```

## Test Scenarios

The test suite validates 16 scenarios across multiple domains:

### Critical Path

- **REG-START** - Verify Verdaccio registry availability
- **PUBLISH** - Publish plugin to local registry
- **INSTALL** - Install plugin into fresh workspace

### Move File Generator

- **MOVE-SMALL** - Basic lib→lib move with default options
- **APP-TO-LIB** - Cross-project move from app to lib
- **MOVE-PROJECT-DIR** - Move with explicit projectDirectory
- **MOVE-DERIVE-DIR** - Move with deriveProjectDirectory=true
- **MOVE-SKIP-EXPORT** - Move with skipExport flag
- **MOVE-SKIP-FORMAT** - Move with skipFormat=true
- **MOVE-UNICODE** - Unicode character handling
- **MOVE-REMOVE-EMPTY** - Empty project cleanup after move

### Advanced Scenarios

- **PATH-ALIASES** - Multiple libraries with path aliases
- **EXPORTS** - Index.ts export management
- **REPEAT-MOVE** - Idempotence verification
- **GRAPH-REACTION** - Project graph updates
- **SCALE-LIBS** - Performance with 10+ libraries
- **SMOKE-SENTINEL** - End-to-end smoke test

See [src/scenarios/README.md](./src/scenarios/README.md) for detailed scenario descriptions.

## CI Testing

The e2e suite runs across a matrix of platforms in GitHub Actions:

### Fast Matrix (Pull Requests)

- Linux ARM64 (ubuntu-24.04-arm) - Quick validation

### Full Matrix (Main Branch, Manual Dispatch)

- Linux x64 (ubuntu-latest)
- Windows x64 (windows-latest)
- Linux ARM64 (ubuntu-24.04-arm)
- Windows ARM64 (windows-11-arm)
- macOS Intel (macos-15-intel)
- macOS ARM64 (macos-latest)

See [.github/workflows/ci.yml](../../.github/workflows/ci.yml) for details.

## Development

### Adding New Scenarios

1. Create scenario module in `src/scenarios/`
2. Export a `run()` function with signature:
   ```typescript
   export async function run(workspace: WorkspaceInfo): Promise<void>;
   ```
3. Import and call from orchestrator in `workspace.suite.spec.ts`
4. Update scenario catalogue in [src/scenarios/README.md](./src/scenarios/README.md)

### Debugging Tests

To debug a specific scenario:

```typescript
// In workspace.suite.spec.ts
it.only('MOVE-SMALL: ...', async () => {
  // Your test
});
```

### Local Registry

The orchestrator manages Verdaccio automatically. To start the registry manually:

```bash
npx nx local-registry
```

## Related Documentation

- [Scenario Catalogue](./src/scenarios/README.md) - Full scenario descriptions
- [Test Coverage](./TEST_COVERAGE.md) - Coverage reports
- [Stress Test Guide](./STRESS_TEST_GUIDE.md) - Performance testing
- [Issue #319](https://github.com/nx-worker/nxworker-workspace/issues/319) - Parent epic
- [Issue #320](https://github.com/nx-worker/nxworker-workspace/issues/320) - Harness utilities
- [Issue #321](https://github.com/nx-worker/nxworker-workspace/issues/321) - Orchestrator implementation
- [Issue #322](https://github.com/nx-worker/nxworker-workspace/issues/322) - Scenario implementations
