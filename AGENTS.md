# Onboarding Guide for nxworker-19

## Repository Snapshot

- **Purpose:** Nx workspace hosting an Nx plugin/library (`packages/move-file`) plus an end-to-end test harness that validates publishing the plugin to a temporary Verdaccio registry and installing it into a freshly generated Nx workspace.
- **Scale & Stack:** Small repo (<50 files). TypeScript/JavaScript with Nx 19, SWC for builds, Jest for unit/e2e tests, Verdaccio 5 for local package registry, Prettier/ESLint for formatting and linting. Targets Node.js LTS "Jod" (22.x) and npm 10 (see `.node-version` and `package.json#engines`).

## Workspace Layout Highlights

- Root configs: `nx.json`, `package.json`, `package-lock.json`, `tsconfig.base.json`, `.eslintrc.json`, `.prettierrc`, `.node-version`, `.verdaccio/config.yml`, `jest.config.ts`, `jest.preset.js`.
- Packages:
  - `packages/move-file/`: Nx plugin library skeleton (`src/index.ts` currently placeholder), SWC + Jest config, package manifest, project definition (`project.json`).
  - `packages/move-file-e2e/`: Jest-based e2e project; depends on building/publishing the plugin, runs `npx create-nx-workspace` during tests.
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
- Requires Node 22.x and npm 10.x; confirm via `node -v` / `npm -v` if failures occur.

### 2. Formatting

```powershell
npx nx format:check
```

- Runs Prettier over the workspace (pattern defined by Nx). Succeeds on clean tree.
- Editing files on Windows can trigger Git CRLF-to-LF warnings; run `npx nx format:write` to auto-fix, then re-run `format:check`.

### 3. Lint

```powershell
npx nx lint move-file --output-style stream
```

- Uses ESLint via Nx-inferred target (`@nx/eslint/plugin`).
- Nx may serve cached results silently; `--output-style stream` forces visible output. Use `npx nx reset` after large edits to invalidate stale cache or when results look unexpectedly cached.

### 4. Build

```powershell
npx nx build move-file --output-style stream
```

- SWC-based build; outputs to `dist/packages/move-file`.
- Expect Node deprecation warnings (`util._extend`) from dependencies; harmless but note if CI logs are noisy.

### 5. Unit Tests

```powershell
npx nx test move-file --output-style stream
```

- Jest with SWC transform. Currently a placeholder library so there are no real assertions; still required for CI parity.

### 6. End-to-End Tests

```powershell
npx nx e2e move-file-e2e --output-style stream
```

- Duration ~1 minute; spins up Verdaccio on port 4873, runs `nx release` tasks to publish `@nxworker/move-file@0.0.0-e2e`, scaffolds a throwaway workspace in `tmp/test-project`, installs the plugin, and verifies installation via `npm ls`.
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
- `nx format` / `nx format:check` — write or validate Prettier formatting across projects.

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

- Pull requests are gated by the GitHub Actions workflow (`.github/workflows/ci.yml`). Passing locally means:
  1. `npm ci`
  2. `npx nx format:check`
  3. `npx nx affected -t lint test build e2e`
- Reproduce step 3 locally with the exact command when debugging CI: it will determine the base via `nrwl/nx-set-shas`. On a feature branch without SHAs, fall back to `npx nx run-many -t lint test build e2e`.

## Conventional Commits (PR titles & commit messages)

Short rules (for agents and humans):

- Use a Conventional Commits header as the PR title and squash commit: type(scope): short subject
- Keep bodies/footers for details, e.g. BREAKING CHANGE: or Closes #123
- Examples: `feat(workspace): add generator`, `fix(e2e): stop local registry`
- If you squash-merge, the PR title becomes the main commit; with merge commits, include at least one proper commit.

## Architectural Notes & Key Files

- `tsconfig.base.json` defines the path alias `@nxworker/move-file` → `packages/move-file/src/index.ts`.
- `packages/move-file/project.json` sets up SWC build and points at Jest config; assets include Markdown and generator/executor manifests (currently absent).
- `packages/move-file/.eslintrc.json` extends the root config and enforces Nx plugin lint rules on `package.json`.
- `packages/move-file-e2e/project.json` declares explicit dependency on `move-file` and ensures the e2e target depends on the library build.
- `tools/scripts/start-local-registry.ts` orchestrates Verdaccio startup and Nx release actions during Jest `globalSetup`; `stop-local-registry.ts` shuts it down via a global handle.
- No additional subpackages or apps at present; adding more libraries should follow the Nx workspace conventions.

## File Inventory Cheat Sheet

- **Repo root:** `.editorconfig`, `.eslintrc.json`, `.eslintignore`, `.prettierrc`, `.prettierignore`, `.node-version`, `.verdaccio/`, `.github/workflows/ci.yml`, `jest.config.ts`, `jest.preset.js`, `nx.json`, `package.json`, `package-lock.json`, `project.json`, `README.md`, `tsconfig.base.json`, `tools/`, `packages/`.
- **`packages/move-file/`:** `.eslintrc.json`, `.swcrc`, `jest.config.ts`, `package.json`, `project.json`, `README.md`, `src/index.ts`, `tsconfig.json`, `tsconfig.lib.json`, `tsconfig.spec.json`.
- **`packages/move-file-e2e/`:** `jest.config.ts`, `project.json`, `src/move-file.spec.ts`, `tsconfig.json`, `tsconfig.spec.json`.
- **`tools/scripts/`:** `start-local-registry.ts`, `stop-local-registry.ts`.

## Practical Tips & Gotchas

- npm audit reports known low/high issues inherited from Nx 19 tooling; upgrading requires coordinated dependency updates.
- Verdaccio port 4873 must be free; terminate lingering processes or rerun `npx nx reset` if an earlier e2e left the server running.

**Trust these instructions.** Only search the codebase when the steps above are insufficient or produce unexpected results.
