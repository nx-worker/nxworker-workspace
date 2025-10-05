# Post Check Run Action

GitHub composite action that creates and updates check runs using the GitHub Checks API.

## Overview

This action provides a simple interface to create and update GitHub check runs for CI workflows. It handles the full lifecycle of a check run:

1. **Pending**: Creates a check run in `in_progress` status
2. **Outcome**: Updates the check run to `completed` status with appropriate conclusion

## Features

- ✅ Uses GitHub Checks API for richer CI integration
- ✅ Stable check-run names suitable for branch protection
- ✅ Matrix job support with per-variant check runs
- ✅ Rich metadata in check run summaries (workflow, event, actor, ref)
- ✅ Automatic check-run ID tracking for updates
- ✅ Support for all job statuses (success, failure, cancelled, skipped)

## Usage

### Basic Example

```yaml
jobs:
  build:
    permissions:
      checks: write # Required for Checks API
    steps:
      - name: Get commit SHA
        id: commit-sha
        run: echo "sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"

      # Start the check run
      - uses: ./.github/actions/post-check-run
        with:
          state: pending
          name: ci/build
          workflow-file: ci.yml
          sha: ${{ steps.commit-sha.outputs.sha }}

      # Run your build
      - run: npm run build

      # Complete the check run
      - uses: ./.github/actions/post-check-run
        if: always()
        with:
          state: outcome
          name: ci/build
          job-status: ${{ job.status }}
          workflow-file: ci.yml
          sha: ${{ steps.commit-sha.outputs.sha }}
```

### Matrix Job Example

```yaml
jobs:
  test:
    permissions:
      checks: write
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node-version: [18, 20, 22]
    runs-on: ${{ matrix.os }}
    steps:
      - name: Get commit SHA
        id: commit-sha
        run: echo "sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"

      - uses: ./.github/actions/post-check-run
        with:
          state: pending
          name: ci/test (${{ matrix.os }}, Node.js ${{ matrix.node-version }})
          workflow-file: ci.yml
          sha: ${{ steps.commit-sha.outputs.sha }}

      - run: npm test

      - uses: ./.github/actions/post-check-run
        if: always()
        with:
          state: outcome
          name: ci/test (${{ matrix.os }}, Node.js ${{ matrix.node-version }})
          job-status: ${{ job.status }}
          workflow-file: ci.yml
          sha: ${{ steps.commit-sha.outputs.sha }}
```

## Inputs

| Input | Description | Required | Default |
| --- | --- | --- | --- |
| `state` | Check run state: `pending` or `outcome` | Yes | - |
| `name` | Check run name (e.g., `ci/build`, `ci/lint`) | Yes | - |
| `job-status` | Job status for outcome checks: `success`, `failure`, `cancelled`, `skipped` | No (required for `outcome`) | - |
| `workflow-file` | Workflow file name for metadata (e.g., `ci.yml`) | Yes | - |
| `sha` | Commit SHA to attach check run to | Yes | - |
| `token` | GitHub token with `checks:write` permission | No | `GITHUB_TOKEN` from environment |

## Outputs

| Output         | Description                                     |
| -------------- | ----------------------------------------------- |
| `check-run-id` | ID of the check run that was created or updated |

## Permissions

This action requires `checks: write` permission:

```yaml
jobs:
  your-job:
    permissions:
      checks: write
```

## Check Run Names

Check-run names should be:

- **Stable**: Use the same name for both pending and outcome states
- **Descriptive**: Clearly identify the job (e.g., `ci/build`, `ci/lint`, `ci/test`)
- **Branch-protection friendly**: Names can be added to branch protection rules

For matrix jobs, include matrix parameters in the name to create separate check-runs:

```
ci/test (ubuntu-latest, Node.js 18)
ci/test (ubuntu-latest, Node.js 20)
ci/test (windows-latest, Node.js 18)
...
```

## How It Works

1. **Pending state**: Creates a new check run with status `in_progress`
   - Stores the check-run ID internally for later updates
   - Sets summary with workflow metadata
2. **Outcome state**: Updates the check run to `completed` status
   - Uses stored check-run ID if available
   - Creates new check run if no pending check exists
   - Sets conclusion based on `job-status`: `success`, `failure`, `cancelled`, or `skipped`
   - Fails the action step if conclusion is `failure`

## Branch Protection

To require these checks in branch protection:

1. Run the workflow at least once to create the check-runs
2. Go to **Settings** → **Branches**
3. Edit branch protection rule
4. Enable "Require status checks to pass before merging"
5. Search for and add your check names (e.g., `ci/build`, `ci/lint`)

## Development

### Running Tests

```bash
cd .github/actions/post-check-run
npx jest src/main.spec.js
```

### Test Coverage

The action includes comprehensive unit tests covering:

- Pending check run creation
- Outcome check run updates
- Matrix job support
- Error handling
- Token resolution
- Context metadata

## License

Part of the `@nxworker/workspace` repository.
