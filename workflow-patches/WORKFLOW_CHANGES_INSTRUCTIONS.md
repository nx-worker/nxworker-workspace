# GitHub Actions Workflow Changes Required

I have prepared the necessary workflow changes but cannot directly modify `.github/workflows/` due to permission restrictions.

## Changes Overview

Two workflow changes are required:

1. **Create new workflow**: `.github/workflows/e2e-benchmark.yml` - E2E benchmark regression testing
2. **Update existing workflow**: `.github/workflows/ci.yml` - Exclude e2e performance tests from regular jobs

## Option 1: Copy Files Manually

### 1. Create the new e2e-benchmark workflow

Copy the file from `workflow-patches/e2e-benchmark.yml` to `.github/workflows/e2e-benchmark.yml`:

```bash
cp workflow-patches/e2e-benchmark.yml .github/workflows/e2e-benchmark.yml
```

### 2. Update the CI workflow

Replace `.github/workflows/ci.yml` with the updated version:

```bash
cp workflow-patches/ci-updated.yml .github/workflows/ci.yml
```

### 3. Commit and push

```bash
git add .github/workflows/
git commit -m "feat(ci): add E2E benchmark regression testing workflow

- Add e2e-benchmark workflow for macOS, Windows, Ubuntu ARM
- Run E2E benchmarks separately from unit benchmarks
- Fail if performance drops by more than 20%
- Exclude performance tests from regular e2e job
- Update benchmark job to only run unit-level micro-benchmarks"
git push
```

## Option 2: Apply Changes Manually

### 1. Create `.github/workflows/e2e-benchmark.yml`

Create a new file `.github/workflows/e2e-benchmark.yml` with the following content from `workflow-patches/e2e-benchmark.yml`:

- Runs on: macOS latest, Windows latest, Ubuntu 24 ARM
- Triggers: pull requests, pushes to main, manual workflow dispatch
- Uses benchmark-action/github-action-benchmark@v1
- Alert threshold: 120% (fails if performance drops by more than 20%)
- Stores benchmark data per OS in `./benchmarks/workspace-e2e/{OS}-benchmark.json`

### 2. Update `.github/workflows/ci.yml`

Make the following changes to the existing CI workflow:

#### a. Update the e2e job (line ~220)

**Before:**

```yaml
- name: Run e2e tests
  shell: bash
  run: npx nx affected -t e2e --configuration=ci --exclude-task-dependencies --output-style=static -- --testPathIgnorePatterns='performance-benchmark'
```

**After:**

```yaml
- name: Run e2e tests
  shell: bash
  run: npx nx affected -t e2e --configuration=ci --exclude-task-dependencies --output-style=static -- --testPathIgnorePatterns='performance-benchmark|performance-stress-test'
```

#### b. Update the benchmark job (line ~244)

**Update the comment above the benchmark job:**

```yaml
# Benchmark job runs on PRs and pushes to main
# This job runs unit-level micro-benchmarks only (excludes e2e performance tests)
benchmark:
```

**Update the "Run micro-benchmarks" step:**

```yaml
# Run all benchmark tests using Nx task (excludes workspace-e2e benchmarks)
- name: Run micro-benchmarks
  run: |
    # Skip cache to ensure fresh benchmark results and capture all output
    npx nx benchmark workspace --skip-nx-cache 2>&1 | sed -E 's/^[[:space:]]*//' | tee workspace-benchmark.txt
```

**Remove the following step entirely (lines ~324-326):**

```yaml
- name: Run e2e performance benchmarks
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  run: npx nx e2e workspace-e2e --testPathPattern='performance-benchmark\.spec\.ts$' --output-style=static
```

## Summary of Changes

### New E2E Benchmark Workflow

- **File**: `.github/workflows/e2e-benchmark.yml`
- **Purpose**: Run E2E performance benchmarks separately on multiple platforms
- **Matrix**: macOS latest, Windows latest, Ubuntu 24.04 ARM
- **Threshold**: 120% (fail if performance drops by >20%)
- **Cache**: Separate cache per OS and PR/branch
- **Output**: Per-OS benchmark data files

### CI Workflow Updates

1. **E2E job**: Exclude both `performance-benchmark` and `performance-stress-test` files
2. **Benchmark job**:
   - Updated comments to clarify it runs unit-level micro-benchmarks only
   - Changed command to `npx nx benchmark workspace` (explicit project)
   - Removed the old e2e performance benchmark step (line 324-326)

## Verification

After applying the changes, verify:

```bash
# Check that workflow files are valid YAML
yamllint .github/workflows/e2e-benchmark.yml
yamllint .github/workflows/ci.yml

# Or use GitHub's workflow validation
gh workflow view e2e-benchmark.yml
gh workflow view ci.yml
```

## Testing

The new E2E benchmark workflow will:

1. Run automatically on pull requests
2. Run on pushes to main
3. Can be triggered manually via workflow_dispatch
4. Run benchmarks on all three platforms in parallel
5. Fail if any platform shows >20% performance regression
6. Store results in `benchmarks/workspace-e2e/{OS}-benchmark.json`
