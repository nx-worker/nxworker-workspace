# Migration from Statuses API to Checks API

This document describes the migration from GitHub's Statuses API to the Checks API for posting CI status updates.

## Background

The repository previously used a composite action (`.github/actions/post-status-check`) which posted commit statuses via the Statuses API (`POST /repos/{owner}/{repo}/statuses/{sha}`). While functional, the Checks API (check-runs) provides:

- **Richer metadata**: annotations, outputs, grouping
- **Better CI integration**: Better display in PR checks UI
- **Branch protection support**: Branch protection rules support check-run names
- **Matrix-friendly**: Better support for matrix strategies with stable check-run names

## New Action: `post-check-run`

The new action (`.github/actions/post-check-run`) uses the GitHub Checks API to create and update check runs.

### Key Features

1. **Stable check-run names**: Suitable for branch protection (e.g., `ci/build`, `ci/lint`, `ci/test`)
2. **Matrix support**: Create separate check-runs per matrix entry with predictable naming
3. **Rich metadata**: Includes workflow, event, actor, and ref information in check run summaries
4. **Lifecycle management**: Proper create/update flow (pending → completed)

### Usage

```yaml
- uses: ./.github/actions/post-check-run
  with:
    state: pending  # or 'outcome'
    name: ci/build  # Stable name for branch protection
    workflow-file: ci.yml
    sha: ${{ steps.commit-sha.outputs.sha }}

# Later, when job completes:
- uses: ./.github/actions/post-check-run
  if: always()
  with:
    state: outcome
    name: ci/build
    job-status: ${{ job.status }}
    workflow-file: ci.yml
    sha: ${{ steps.commit-sha.outputs.sha }}
```

### Matrix Jobs

For matrix jobs, include matrix parameters in the check name:

```yaml
- uses: ./.github/actions/post-check-run
  with:
    state: pending
    name: ci/test (${{ matrix.os }}, Node.js ${{ matrix.node-version }})
    workflow-file: ci.yml
    sha: ${{ steps.commit-sha.outputs.sha }}
```

This creates separate check-runs for each matrix entry, making it easy to identify which specific configuration failed.

## Permissions

Jobs using the new action require `checks: write` permission:

```yaml
jobs:
  build:
    permissions:
      checks: write  # Required for Checks API
    steps:
      # ... your steps
```

## Stable Check Names for Branch Protection

The following stable check names are used in the CI workflow:

- `ci/build` - Build job
- `ci/lint` - Linting job  
- `ci/test (<os>, Node.js <version>)` - Test job (matrix)
- `ci/e2e (<os>)` - E2E test job (matrix)

To require these checks in branch protection:

1. Go to repository **Settings** → **Branches**
2. Edit branch protection rule for `main`
3. Enable "Require status checks to pass before merging"
4. Add the check names (e.g., `ci/build`, `ci/lint`)

**Note**: For matrix jobs, you can either:
- Require all matrix combinations (e.g., `ci/test (ubuntu-latest, Node.js 18)`, `ci/test (ubuntu-latest, Node.js 20)`, etc.)
- Or use a job-level summary check that aggregates matrix results (future enhancement)

## Migration Checklist

- [x] Create new `post-check-run` action with Checks API
- [x] Add comprehensive unit tests
- [x] Update CI workflow to use new action
- [x] Add `permissions: checks: write` to all jobs
- [x] Document stable check names
- [ ] Update branch protection rules to use new check names
- [ ] Verify check-runs appear in PRs (requires live workflow run)
- [ ] Optional: Keep `post-status-check` for backward compatibility

## Backward Compatibility

The old `post-status-check` action remains in the repository for now. Both actions can coexist:

- `post-check-run`: Uses Checks API (recommended)
- `post-status-check`: Uses Statuses API (legacy)

Currently, both `checks: write` and `statuses: write` permissions are set in workflows for a smooth transition period.

## Differences from Statuses API

| Feature | Statuses API | Checks API |
|---------|-------------|------------|
| API endpoint | `/repos/{owner}/{repo}/statuses/{sha}` | `/repos/{owner}/{repo}/check-runs` |
| Permission | `statuses: write` | `checks: write` |
| States | `pending`, `success`, `failure`, `error` | `queued`, `in_progress`, `completed` |
| Conclusions | N/A | `success`, `failure`, `cancelled`, `skipped`, etc. |
| Rich output | Limited (description only) | Full markdown summary, annotations |
| Branch protection | By context name | By check-run name |
| Matrix support | One status per context | One check-run per name |

## Troubleshooting

### Check-runs not appearing

- Verify `checks: write` permission is set
- Check that `GITHUB_TOKEN` has appropriate permissions
- For forks/external contributors, `GITHUB_TOKEN` may have restricted permissions

### Check-runs not updating

The action stores check-run IDs in memory during workflow execution. Ensure:
- Pending state is called before outcome state
- Both calls use the exact same `name` parameter

### Branch protection not recognizing checks

- Check names must match exactly (case-sensitive)
- For matrix jobs, you must specify each matrix combination individually in branch protection
- Check-runs only appear after the workflow has run at least once

## Future Enhancements

Potential improvements for the Checks API integration:

1. **Job-level summary checks**: Aggregate matrix results into a single parent check
2. **Annotations**: Add code annotations for lint/test failures
3. **External workflow support**: Handle workflows triggered by external events
4. **Auto-retry logic**: Automatic retry on API rate limits

## References

- [GitHub Checks API Documentation](https://docs.github.com/en/rest/checks)
- [GitHub Actions Permissions](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#permissions-for-the-github_token)
- [Branch Protection with Checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches#require-status-checks-before-merging)
