# `@nxworker/workspace`

`@nxworker/workspace` is an Nx-based monorepo that hosts the `@nxworker/workspace` Nx plugin and an end-to-end test harness that exercises the plugin against a temporary Verdaccio registry. The repository provides a realistic reference for building, validating, and releasing Nx plugins while keeping a tight feedback loop for contributors.

## Prerequisites

- **Node.js** 18.x-22.x
- **npm** 10.x

Install dependencies with:

```shell
npm ci
```

## Repository layout

```
packages/
	workspace/          → Nx plugin source, build + unit tests
	workspace-e2e/      → Jest e2e project that publishes to Verdaccio and installs the plugin
tools/scripts/        → Verdaccio lifecycle helpers used by the e2e suite
docs/                 → Additional documentation (Node 18 baseline, etc.)
```

The `@nxworker/workspace:move-file` generator moves files individually or in bulk using a comma-separated file list and/or glob pattern(s), automatically rewrites imports, and can optionally remove source projects that become empty after moving files by passing `--remove-empty-project`.

Key configuration files live at the repository root (`nx.json`, `project.json`, `tsconfig.base.json`, `.eslintrc.json`, `.prettierrc`, `.node-version`, `jest.config.ts`). Path alias `@nxworker/workspace` resolves to `packages/workspace/src/index.ts`.

## Core npm scripts & Nx targets

All commands should be run from the repository root. Nx caches results by default; add `--skip-nx-cache` to surface realtime logs when needed.

| Task | Purpose | Command |
| --- | --- | --- |
| Format check | Validate Prettier formatting | `npx nx format:check` |
| Lint | Validate code style in all projects | `npx nx run-many --targets=lint` |
| Build | Build the Nx plugin and internal projects | `npx nx run-many --targets=build` |
| Unit tests | Run unit tests for the Nx plugin and internal project | `npx nx run-many --targets=test` |
| End-to-end | Publish the plugin to a local Verdaccio registry and install into a fresh Nx workspace then exercise the plugin | `npx nx run-many --targets=e2e` |
| **Benchmarks** | **Run performance benchmarks** | **`./tools/run-benchmarks.sh`** |
| **Stress tests** | **Run performance stress tests** | **`./tools/run-benchmarks.sh --stress`** |

Run every step exactly as CI does:

```shell
npx nx format:check
npx nx affected -t lint test build e2e
```

## Local Verdaccio workflow

The e2e suite starts Verdaccio automatically via `tools/scripts/start-local-registry.ts`. If you need to debug manually:

```shell
npx nx local-registry     # starts Verdaccio on http://localhost:4873
# ...run your debugging commands...
npx nx stop-local-registry
```

Artifacts live under `tmp/local-registry` and `dist/`. Delete them when disk usage becomes an issue.

## Releasing the plugin

The repo uses the Nx Release workflow configured in `nx.json`. Build artifacts are produced before versioning to ensure integrity.

```shell
npx nx release --dry-run   # preview version + changelog
npx nx release             # build, version, publish
```

## Development tips

- Prefer `npx nx graph` to inspect project dependencies.
- Run `npx nx reset` if cache artifacts become stale or if Verdaccio instances are left running unexpectedly.
- For faster e2e tests during development, the test suite only tests the minimum supported Nx version (19.x) by default. Use `npx nx e2e workspace-e2e --configuration=ci` to test all supported versions (19, 20, 21).

### Performance Testing

The e2e suite includes two types of performance tests:

- **Performance Benchmarks** (`performance-benchmark.spec.ts`): Quick baseline tests (~1-2 minutes)
- **Performance Stress Tests** (`performance-stress-test.spec.ts`): Comprehensive validation with large workspaces (~15-30 minutes)

The stress tests validate that jscodeshift optimizations (parser reuse, early exit, single-pass traversal) provide significant performance benefits in realistic scenarios with many projects and files.

```shell
# Run quick performance benchmarks
npx nx e2e workspace-e2e --testPathPattern=performance-benchmark

# Run comprehensive stress tests
npx nx e2e workspace-e2e --testPathPattern=performance-stress-test

# Run all performance tests
npx nx e2e workspace-e2e --testPathPattern=performance
```

See `packages/workspace-e2e/QUICK_START_STRESS_TESTS.md` for a quick start guide and `packages/workspace-e2e/STRESS_TEST_GUIDE.md` for comprehensive documentation.

## Performance Benchmarking

The repository includes comprehensive performance benchmarks to validate optimizations:

### Quick Benchmarks

Run all benchmarks with a single command:
```shell
./tools/run-benchmarks.sh
```

Or include stress tests (~2-3 minutes):
```shell
./tools/run-benchmarks.sh --stress
```

### Key Performance Results

- **Glob Pattern Batching**: 2.91× - 8.83× faster
- **AST Parser Reuse**: Eliminates 100s of instantiations
- **Early Exit Optimization**: Skips ~90% of unnecessary parsing
- **Single-Pass Traversal**: Saves ~50% of AST traversals

### Documentation

- `docs/BENCHMARKING_GUIDE.md`: Complete benchmarking guide
- `PERFORMANCE_COMPARISON.md`: Detailed performance analysis
- `PARALLELIZATION_ANALYSIS.md`: Parallelization opportunities and limitations
- `docs/performance-optimization.md`: AST optimization guide
- `GLOB_OPTIMIZATION.md`: Glob pattern batching details

## Troubleshooting

| Issue | Fix |
| --- | --- |
| ESLint errors mentioning Node ≥20 APIs | Refactor to Node 18-compatible APIs; see `docs/NODE18_BASELINE.md` |
| Verdaccio port still in use | Run `npx nx reset` or manually stop lingering Node processes |
| `create-nx-workspace` download failures in e2e | Ensure internet access and retry; the script scaffolds into `tmp/` |

## Contributing

1. Create a feature branch
1. Implement your changes with accompanying tests and docs
1. Run the full validation suite (`format`, `lint`, `test`, `build`, and `e2e`)
1. Submit a pull request using Conventional Commit style, for example `feat(workspace): add move-file generator`

For ideas or questions, open an issue or reach out in GitHub Discussions.
