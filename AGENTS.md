# Onboarding Guide for nxworker-19

## Repository Snapshot

- **Purpose:** Nx workspace hosting an Nx plugin/library (`packages/workspace`) plus an end-to-end test harness that validates publishing the plugin to a temporary Verdaccio registry and installing it into a freshly generated Nx workspace.
- **Scale & Stack:** Small repo (~110 TypeScript/JSON files, expanded from <50 after move-file generator refactoring). TypeScript/JavaScript with Nx 19, SWC for builds, Jest for unit/e2e tests, Verdaccio 5 for local package registry, Prettier/ESLint for formatting and linting. Supports Node.js 18+ and npm 10+; development uses Node.js 22 LTS "Jod" (see `.node-version` and `package.json#engines`). ESLint rules enforce Node.js 18 baseline by banning features from Node.js 20+.

## Workspace Layout Highlights

- Root configs: `nx.json`, `package.json`, `package-lock.json`, `tsconfig.base.json`, `.eslintrc.json`, `.prettierrc`, `.node-version`, `.verdaccio/config.yml`, `jest.config.ts`, `jest.preset.js`.
- Packages:
  - `packages/workspace/`: Nx plugin library skeleton (`src/index.ts` currently placeholder), SWC + Jest config, package manifest, project definition (`project.json`).
  - `packages/workspace-e2e/`: Jest-based e2e project; depends on building/publishing the plugin, runs `npx create-nx-workspace` during tests.
- Tooling scripts: `tools/scripts/start-local-registry.ts` & `stop-local-registry.ts` manage Verdaccio for e2e runs.
- CI: `.github/workflows/ci.yml` uses GitHub Actions to run `npm ci`, `npx nx format:check`, and `npx nx affected -t lint test build e2e` on Ubuntu.
- Nx cache + daemon state lives in `.nx/` and `node_modules/`; Verdaccio storage and e2e temp workspaces live under `tmp/`.

## Build & Validation Workflow (validated on Windows with PowerShell)

Always start from repo root unless noted.

### 1. Bootstrap (fresh checkout or after cleaning)

```powershell
npm ci
```

- Removes existing `node_modules` and installs exactly from `package-lock.json`.
- Observed warnings: deprecated transitive deps (glob, rimraf, verdaccio) and 23 npm audit advisories; no action currently taken.
- Requires Node 18.x or newer and npm 10.x or newer; development uses Node.js 22 LTS. Confirm via `node -v` / `npm -v` if failures occur.

### 2. Formatting

**⚠️ CRITICAL: Always check and fix formatting before committing code!**

#### Check formatting (read-only validation)

```powershell
npm run format:check
# or
npx nx format:check
```

- Runs Prettier over the workspace (pattern defined by Nx). Succeeds on clean tree.
- **Must pass before committing code** — CI enforces this on pull requests.

#### Apply formatting (auto-fix)

```powershell
npm run format
# or
npx nx format:write
```

- Automatically formats all files in the workspace using Prettier.
- **Run this command before every commit** to ensure formatting compliance.
- On Windows, editing files can trigger Git CRLF-to-LF warnings; this command fixes them automatically.

### 3. Lint

```powershell
npx nx lint workspace --output-style stream
```

- Uses ESLint via Nx-inferred target (`@nx/eslint/plugin`).
- Nx may serve cached results silently; `--output-style stream` forces visible output. Use `npx nx reset` after large edits to invalidate stale cache or when results look unexpectedly cached.

### 4. Build

```powershell
npx nx build workspace --output-style stream
```

- SWC-based build; outputs to `dist/packages/workspace`.
- Expect Node deprecation warnings (`util._extend`) from dependencies; harmless but note if CI logs are noisy.

### 5. Unit Tests

```powershell
npx nx test workspace --output-style stream
```

- Jest with SWC transform. Currently a placeholder library so there are no real assertions; still required for CI parity.

### 6. End-to-End Tests

```powershell
npx nx e2e workspace-e2e --output-style stream
```

- Duration ~1 minute; spins up Verdaccio on port 4873, runs `nx release` tasks to publish `@nxworker/workspace@0.0.0-e2e`, scaffolds a throwaway workspace in `tmp/test-project`, installs the plugin, and verifies installation via `npm ls`.
- Requires outbound network access for `npx create-nx-workspace@latest` (downloads npm packages). Cleans temp directory afterward.
- Leaves Verdaccio storage and release artifacts in `tmp/local-registry/storage` and `dist/`; safe to delete manually if disk usage matters.

### 7. Optional / Maintenance

- **Reset Nx cache:** `npx nx reset` (stops daemon, clears `.nx/cache`). Use if tasks behave inconsistently after edits.
- **Start local registry manually:** `npx nx local-registry` (runs target from root `project.json`); rarely needed outside Jest global setup.
- **Release pipeline smoke test:** `npx nx release --dry-run` to preview multi-project versioning sequence (configured to build everything first via `nx.json#release`).

## Nx CLI Quick Reference

Nx interprets commands in the following order (per the [Nx CLI reference](https://19.nx.dev/reference/nx-commands)): built-in command, root-project task, then `<task> <project>`. Use placeholders like `<project>` and `<target>` when adapting the examples below.

### Modify Code

- `nx add <plugin>` — install and initialize an Nx plugin.
- `nx generate <generator> [options]` — run a generator, for example `nx generate @nx/react:component <name>`.
- `nx migrate [version|--run-migrations]` — create or apply dependency migrations.
- `nx import <source> <destination>` — bring an external project (and history) into the workspace.
- `nx repair` — re-run core Nx migrations to fix stale config.
- `nx sync` / `nx sync:check` — execute sync generators registered in the workspace.
- `nx format` / `nx format:check` — write or validate Prettier formatting across projects. **Use `npm run format` or `npm run format:check` for convenience.**

### Run Tasks

- `nx run <project>:<target> [--configuration=<name>]` — invoke a target exactly; shorthand like `nx <target> <project>` also works.
- `nx run-many --target=<target> [--projects=<list>]` — run a target across multiple projects; omit `--projects` to default to all.
- `nx affected --target=<target>` — limit execution to projects touched since the base SHAs (as used by CI).
- `nx exec -- <command>` — treat an arbitrary shell command as an Nx task for caching/integration.
- `nx watch --projects=<list> -- <command>` — watch and rerun commands when source files change.
- `nx release <subcommand>` — orchestrate `version`, `changelog`, `publish`, etc., for managed releases.
- `nx reset` — clear the Nx daemon and cache when results look stale.

### Display Information

- `nx show projects` / `nx show project <project>` — inspect project registration and options.
- `nx graph [--focus=<project>]` — open the dependency graph in a browser.
- `nx list [<plugin>]` — list installed plugins and their capabilities.
- `nx report` — print tool versions for issue templates.
- `nx daemon` — inspect or control the Nx daemon process.

## CI & Validation Expectations

**⚠️ FORMATTING IS MANDATORY: Always run `npm run format` before committing code. CI will fail pull requests with formatting issues.**

- Pull requests are gated by the GitHub Actions workflow (`.github/workflows/ci.yml`). Passing locally means:
  1. `npm ci`
  2. `npx nx format:check` (or `npm run format:check`)
  3. `npx nx affected -t lint test build e2e`
- Reproduce step 3 locally with the exact command when debugging CI: it will determine the base via `nrwl/nx-set-shas`. On a feature branch without SHAs, fall back to `npx nx run-many -t lint test build e2e`.

## Conventional Commits (PR titles & commit messages)

Short rules (for agents and humans):

- GitHub Copilot coding agent must always propose PR titles in `type(scope): short subject` form; do not surface alternative formats.
- Use a Conventional Commits header as the PR title and squash commit: type(scope): short subject
- Keep bodies/footers for details, e.g. BREAKING CHANGE: or Closes #123
- Examples: `feat(workspace): add generator`, `fix(e2e): stop local registry`
- If you squash-merge, the PR title becomes the main commit; with merge commits, include at least one proper commit.

## Architectural Notes & Key Files

- `tsconfig.base.json` defines the path alias `@nxworker/workspace` → `packages/workspace/src/index.ts`.
- `packages/workspace/project.json` sets up SWC build and points at Jest config; assets include Markdown and generator/executor manifests (currently absent).
- `packages/workspace/eslint.config.js` extends the root config and enforces Nx plugin lint rules on `package.json`.
- `packages/workspace-e2e/project.json` declares explicit dependency on `workspace` and ensures the e2e target depends on the library build.
- `tools/scripts/start-local-registry.ts` orchestrates Verdaccio startup and Nx release actions during Jest `globalSetup`; `stop-local-registry.ts` shuts it down via a global handle.
- No additional subpackages or apps at present; adding more libraries should follow the Nx workspace conventions.

## Move-File Generator Refactoring (Phases 1-9 Complete)

The `@nxworker/workspace:move-file` generator has undergone a major refactoring to improve maintainability, testability, and performance. **Phases 1-9 are complete** as of 2025-10-15.

### Refactored Structure

The generator code in `packages/workspace/src/generators/move-file/` is now organized by domain:

- **`constants/`** ✅ Phase 1 - File extension constants and related data
  - `file-extensions.ts` - All file extension constants (source, entrypoint, strippable)
  - `file-extensions.spec.ts` - 20 unit tests for constants validation

- **`types/`** ✅ Phase 1 - Shared TypeScript types
  - `move-context.ts` - MoveContext type definition with full JSDoc

- **`cache/`** ✅ Phase 2 - Cache management functions (6 functions)
  - `clear-all-caches.ts` - Clears all generator caches
  - `cached-tree-exists.ts` - Cached file existence checks
  - `get-project-source-files.ts` - Retrieves cached project source files
  - `update-project-source-files-cache.ts` - Updates source file cache
  - `update-file-existence-cache.ts` - Updates file existence cache
  - `get-cached-dependent-projects.ts` - Dependency graph cache optimization
  - All functions have comprehensive unit tests (37 tests total)

- **`path-utils/`** ✅ Phase 3 - Path manipulation and resolution (9 functions)
  - `build-file-names.ts` - Constructs file name patterns
  - `build-patterns.ts` - Builds glob patterns for file matching
  - `build-target-path.ts` - Calculates target file paths
  - `split-patterns.ts` - Splits compound path patterns
  - `to-absolute-workspace-path.ts` - Converts to absolute workspace paths
  - `get-relative-import-specifier.ts` - Generates relative import paths
  - `has-source-file-extension.ts` - Checks for source file extensions
  - `remove-source-file-extension.ts` - Removes file extensions
  - `strip-file-extension.ts` - Strips extensions from paths
  - All functions have comprehensive unit tests (103 tests total)

- **`project-analysis/`** ✅ Phase 4 - Project analysis and resolution (13 functions)
  - `find-project-for-file.ts` - Locates project containing a file
  - `is-project-empty.ts` - Checks if project has source files
  - `get-dependent-project-names.ts` - Gets projects that depend on target
  - `derive-project-directory-from-source.ts` - Derives project directory from source file
  - `get-project-import-path.ts` - Gets import path for project
  - `read-compiler-paths.ts` - Reads TypeScript compiler path mappings
  - `get-project-entry-point-paths.ts` - Gets project entry point paths
  - `get-fallback-entry-point-paths.ts` - Gets fallback entry points
  - `points-to-project-index.ts` - Checks if path points to project index
  - `is-index-file-path.ts` - Checks if path is an index file
  - `is-wildcard-alias.ts` - Checks if import uses wildcard alias
  - `build-reverse-dependency-map.ts` - Builds reverse dependency graph
  - `to-first-path.ts` - Helper to get first path from array/string
  - All functions have comprehensive unit tests (170 tests total)

- **`import-updates/`** ✅ Phase 5 - Import update functions (9 functions)
  - Import path update logic for different scenarios
  - All functions have comprehensive unit tests

- **`export-management/`** ✅ Phase 6 - Export management functions (5 functions)
  - Export handling for index files
  - All functions have comprehensive unit tests (52 tests total)

- **`validation/`** ✅ Phase 7 - Validation functions (2 functions)
  - `resolve-and-validate.ts` - Main validation orchestrator
  - `check-for-imports-in-project.ts` - Import checking utilities
  - All functions have comprehensive unit tests (30 tests total)

- **`core-operations/`** ✅ Phase 8 - Core operations (8 functions)
  - `execute-move.ts` - Main move orchestrator
  - `create-target-file.ts` - Target file creation
  - `handle-move-strategy.ts` - Strategy pattern router
  - `handle-same-project-move.ts` - Same-project move handler
  - `handle-exported-move.ts` - Exported file move handler
  - `handle-non-exported-alias-move.ts` - Non-exported alias handler
  - `handle-default-move.ts` - Default fallback handler
  - `finalize-move.ts` - Cleanup and formatting
  - All functions have comprehensive unit tests (32 tests total)

- **`security-utils/`** - Already well-organized (pre-existing)
  - Path sanitization and validation utilities

- **Core files**
  - `generator.ts` - Main orchestration (reduced from 1,967 to 309 lines after Phase 8)
  - `generator.spec.ts` - Integration tests (all passing)
  - `ast-cache.ts` - AST caching utilities
  - `tree-cache.ts` - File tree caching
  - `jscodeshift-utils.ts` - Code transformation utilities

### Testing & Quality Metrics (Post-Phase 9)

- **Total tests**: 585 tests (all passing ✅)
  - 20 tests for constants (Phase 1)
  - 37 tests for cache functions (Phase 2)
  - 103 tests for path utilities (Phase 3)
  - 170 tests for project analysis (Phase 4)
  - Tests for import updates (Phase 5)
  - 52 tests for export management (Phase 6)
  - 30 tests for validation (Phase 7)
  - 32 tests for core operations (Phase 8)
  - 88 integration tests in generator.spec.ts (Phase 9: reorganized with clear documentation)
  - Additional tests in jscodeshift-utils and other utilities

- **Test pass rate**: 100% (585/585 tests passing)
- **Lines reduced**: ~324 lines removed from generator.ts in Phase 8 (633 → 309 lines, 51% reduction)
- **Test organization**: Integration tests reorganized with section headers and documentation (Phase 9)

### Key Principles Applied

1. **One function per file** - Each extracted function in its own file
2. **Co-located tests** - Test file next to implementation (`.spec.ts`)
3. **Domain organization** - Functions grouped by purpose (cache, path-utils, etc.)
4. **Comprehensive testing** - Each function has dedicated unit tests
5. **Zero breaking changes** - All existing tests continue passing

### Documentation

For detailed information about the refactoring:

- [REFACTORING_INDEX.md](./REFACTORING_INDEX.md) - Overview and navigation guide
- [REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md) - Quick reference
- [REFACTORING_PLAN.md](./REFACTORING_PLAN.md) - Full 11-phase plan
- [REFACTORING_VISUAL_GUIDE.md](./REFACTORING_VISUAL_GUIDE.md) - Visual comparisons
- [REFACTORING_PHASE_1_GUIDE.md](./REFACTORING_PHASE_1_GUIDE.md) - Phase 1 details
- [REFACTORING_PHASE_2_GUIDE.md](./REFACTORING_PHASE_2_GUIDE.md) - Phase 2 details
- [REFACTORING_PHASE_4_GUIDE.md](./REFACTORING_PHASE_4_GUIDE.md) - Phase 4 details
- [REFACTORING_PHASE_5_GUIDE.md](./REFACTORING_PHASE_5_GUIDE.md) - Phase 5 details
- [REFACTORING_PHASE_6_GUIDE.md](./REFACTORING_PHASE_6_GUIDE.md) - Phase 6 details
- [REFACTORING_PHASE_7_GUIDE.md](./REFACTORING_PHASE_7_GUIDE.md) - Phase 7 details
- [REFACTORING_PHASE_8_GUIDE.md](./REFACTORING_PHASE_8_GUIDE.md) - Phase 8 details
- [REFACTORING_PHASE_9_GUIDE.md](./REFACTORING_PHASE_9_GUIDE.md) - Phase 9 details
- [docs/adr/001-refactor-for-maintainability.md](./docs/adr/001-refactor-for-maintainability.md) - Architecture decision

### Remaining Phases (Planned)

- **Phase 10**: Performance Benchmarks
- **Phase 11**: Documentation updates

## Development Standards for @nxworker/workspace

### Logging Policy

When developing generators, executors, or other tools in the `@nxworker/workspace` package:

- **Use `logger.verbose()` for all operational logs by default**
- **Only use `logger.info()` or higher levels when explicitly instructed**
- This keeps generator/executor output clean, showing only Nx's standard file operations (UPDATE, CREATE, DELETE, etc.)
- Verbose logs are available when needed via the `--verbose` flag (e.g., `nx generate ... --verbose`)

**Rationale:** Generators should produce minimal output to avoid cluttering the user experience. Users primarily care about what files changed, not the internal mechanics of how the generator works.

### Module Organization and Imports

When organizing code in the `@nxworker/workspace` package:

- **Avoid barrel exports** (index.ts files that re-export from multiple modules) within the codebase
- **Use explicit imports** from specific files (e.g., `import { foo } from './utils/foo'` instead of `import { foo } from './utils'`)
- **Exception:** Barrel exports are acceptable for package entrypoints only (e.g., `packages/workspace/src/index.ts`)

**Rationale:** Explicit imports improve tree-shaking, make dependencies clear, and reduce the risk of circular dependencies. Package entrypoint barrel exports are needed for proper public API exposure.

## File Inventory Cheat Sheet

- **Repo root:** `.editorconfig`, `.eslintrc.json`, `.eslintignore`, `.prettierrc`, `.prettierignore`, `.node-version`, `.verdaccio/`, `.github/workflows/ci.yml`, `jest.config.ts`, `jest.preset.js`, `nx.json`, `package.json`, `package-lock.json`, `project.json`, `README.md`, `tsconfig.base.json`, `tools/`, `packages/`.
- **`packages/workspace/`:** `.swcrc`, `eslint.config.js`, `jest.config.ts`, `package.json`, `project.json`, `README.md`, `src/index.ts`, `tsconfig.json`, `tsconfig.lib.json`, `tsconfig.spec.json`.
- **`packages/workspace/src/generators/move-file/`:** Refactored generator with modular structure:
  - `generator.ts`, `generator.spec.ts`, `schema.json`, `schema.d.ts`, `README.md`
  - `constants/` - File extension constants (2 files: implementation + tests)
  - `types/` - MoveContext type definition (1 file)
  - `cache/` - Cache management (12 files: 6 implementations + 6 test files)
  - `path-utils/` - Path utilities (18 files: 9 implementations + 9 test files)
  - `project-analysis/` - Project analysis (26 files: 13 implementations + 13 test files)
  - `security-utils/` - Security utilities (6 files, pre-existing)
  - `ast-cache.ts`, `tree-cache.ts`, `jscodeshift-utils.ts` (+ spec files)
- **`packages/workspace-e2e/`:** `eslint.config.js`, `jest.config.ts`, `project.json`, `src/workspace.spec.ts`, `tsconfig.json`, `tsconfig.spec.json`.
- **`tools/scripts/`:** `start-local-registry.ts`, `stop-local-registry.ts`.

## Practical Tips & Gotchas

- npm audit reports known low/high issues inherited from Nx 19 tooling; upgrading requires coordinated dependency updates.
- Verdaccio port 4873 must be free; terminate lingering processes or rerun `npx nx reset` if an earlier e2e left the server running.

**Trust these instructions.** Only search the codebase when the steps above are insufficient or produce unexpected results.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- You have access to the Nx MCP server and its tools, use them to help the user
- When answering questions about the repository, use the `nx_workspace` tool first to gain an understanding of the workspace architecture where applicable.
- When working in individual projects, use the `nx_project_details` mcp tool to analyze and understand the specific project structure and dependencies
- For questions around nx configuration, best practices or if you're unsure, use the `nx_docs` tool to get relevant, up-to-date docs. Always use this instead of assuming things about nx configuration
- If the user needs help with an Nx configuration or project graph error, use the `nx_workspace` tool to get any errors

<!-- nx configuration end-->
