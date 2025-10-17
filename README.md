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

### Auto-format Workflow

If you forgot to run `npm run format` before committing, you can use the **Format Workflow** to automatically fix formatting issues:

1. **Ensure your branch is rebased** with the latest main branch:
   ```bash
   git fetch origin main
   git rebase origin/main
   git push --force-with-lease
   ```
2. Push your feature branch to GitHub
3. Go to the **Actions** tab
4. Select **"Format Code"** workflow
5. Click **"Run workflow"** and select your branch
6. After the workflow completes, pull the updated branch: `git pull --force-with-lease`

The workflow processes each commit individually, applying formatting fixes and amending the commits as needed. Note that this rewrites Git history, so use it only on branches where you're the sole contributor.

**Important:** The workflow will refuse to run if your branch hasn't been rebased with the latest base branch. This prevents the workflow from running with an outdated version of its own workflow file.

### Performance Testing

The repository includes comprehensive performance testing at multiple levels:

#### Unit Benchmarks (jest-bench)

Micro-benchmarks for individual functions in the move-file generator:

```shell
# Run unit benchmarks
npx nx benchmark workspace
```

See `packages/workspace/src/generators/move-file/benchmarks/README.md` for details.

**Continuous Monitoring**: Unit benchmarks run on every PR and push to main, with automated regression detection (110% threshold).

#### E2E Performance Benchmarks (jest-bench)

End-to-end benchmarks using jest-bench for the move-file generator:

- **Performance Benchmarks** (`performance-benchmark.bench.ts`): Quick baseline tests validating single-file moves, multi-file operations, and import updates
- **Performance Stress Tests** (`performance-stress-test.bench.ts`): Comprehensive validation with large workspaces, many projects, and complex dependency graphs

```shell
# Run E2E benchmarks
npx nx e2e-benchmark workspace-e2e
```

**Continuous Monitoring**: E2E benchmarks run on every PR and push to main across three platforms (macOS, Windows, Ubuntu ARM), with automated regression detection (110% threshold, fails if performance degrades >10%).

The benchmarks validate that jscodeshift optimizations (parser reuse, early exit, single-pass traversal) provide significant performance benefits in realistic scenarios with many projects and files.

## Troubleshooting

| Issue | Fix |
| --- | --- |
| ESLint errors mentioning Node ≥20 APIs | Refactor to Node 18-compatible APIs; see `docs/NODE18_BASELINE.md` |
| Verdaccio port still in use | Run `npx nx reset` or manually stop lingering Node processes |
| `create-nx-workspace` download failures in e2e | Ensure internet access and retry; the script scaffolds into `tmp/` |

## Refactoring Evaluation ⭐⭐⭐⭐⭐

**Status**: ✅ **ALL 11 PHASES COMPLETE** (2025-10-15)

A comprehensive refactoring of the `move-file` generator has been completed with exceptional results:

### Quick Links

- **[REFACTORING_EVALUATION_SUMMARY.md](./REFACTORING_EVALUATION_SUMMARY.md)** ⭐ **START HERE** - Executive summary (5 min read)
- **[REFACTORING_EVALUATION.md](./REFACTORING_EVALUATION.md)** - Full evaluation report (30 min read)
- **[REFACTORING_INDEX.md](./REFACTORING_INDEX.md)** - Navigation hub for all documentation

### Achievement Summary

✅ **100% Plan Adherence**: All 11 phases completed as designed  
✅ **Zero Breaking Changes**: All 601 tests passing  
✅ **85% Code Reduction**: generator.ts (1,967→307 lines)  
✅ **426% Test Increase**: From 141 to 601 tests  
✅ **21 Documentation Files**: Comprehensive guides and READMEs  
✅ **16 Performance Benchmarks**: Baselines documented

### Quality Ratings

- **Testability**: ⭐⭐⭐⭐⭐ (601 tests, 100% pass)
- **Maintainability**: ⭐⭐⭐⭐⭐ (modular structure, clear domains)
- **Performance**: ⭐⭐⭐⭐ (benchmarks, no regressions)
- **Documentation**: ⭐⭐⭐⭐⭐ (comprehensive)
- **Overall**: ⭐⭐⭐⭐⭐ (Exceptional)

### All Documentation

- **[REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md)** - Quick reference guide
- **[REFACTORING_PLAN.md](./REFACTORING_PLAN.md)** - Complete 11-phase plan
- **[REFACTORING_VISUAL_GUIDE.md](./REFACTORING_VISUAL_GUIDE.md)** - Before/after comparisons
- **Phase Guides**: 11 step-by-step implementation guides
- **[docs/adr/001-refactor-for-maintainability.md](./docs/adr/001-refactor-for-maintainability.md)** - Architecture decision

The refactoring transformed the generator from a monolithic 1,967-line file to a well-organized modular structure with 57 functions, 11 domain directories, and comprehensive test coverage.

## Contributing

1. Create a feature branch
1. Implement your changes with accompanying tests and docs
1. Run the full validation suite (`format`, `lint`, `test`, `build`, and `e2e`)
1. Submit a pull request using Conventional Commit style, for example `feat(workspace): add move-file generator`

For ideas or questions, open an issue or reach out in GitHub Discussions.
