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
    state: pending # or 'outcome'
    name: ci/build # Stable name for branch protection
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

For matrix jobs, we use a summary job pattern to create a single stable check for branch protection:

```yaml
# Matrix job runs tests but doesn't create individual checks
test:
  strategy:
    matrix:
      include:
        - os: ubuntu-latest
          node-version: 18
        - os: ubuntu-latest
          node-version: 20
  runs-on: ${{ matrix.os }}
  steps:
    - run: npm test

# Summary job aggregates matrix results into a single check
test-summary:
  needs: test
  if: always()
  permissions:
    checks: write
  runs-on: ubuntu-24.04-arm
  steps:
    - name: Determine overall status
      id: overall-status
      run: |
        if [ "${{ needs.test.result }}" == "success" ]; then
          echo "status=success" >> "$GITHUB_OUTPUT"
        else
          echo "status=failure" >> "$GITHUB_OUTPUT"
        fi

    - uses: ./.github/actions/post-check-run
      with:
        state: outcome
        name: ci/test # Single stable name for branch protection
        job-status: ${{ steps.overall-status.outputs.status }}
        workflow-file: ci.yml
        sha: ${{ steps.commit-sha.outputs.sha }}
```

This creates a single check-run named `ci/test` that aggregates all matrix results, making it ideal for branch protection rules.

## Permissions

Jobs using the new action require `checks: write` permission:

```yaml
jobs:
  build:
    permissions:
      checks: write # Required for Checks API
    steps:
      # ... your steps
```

## Stable Check Names for Branch Protection

The following stable check names are used in the CI workflow:

- `ci/build` - Build job
- `ci/lint` - Linting job
- `ci/test` - Test job summary (aggregates all matrix results)
- `ci/e2e` - E2E test job summary (aggregates all matrix results)

To require these checks in branch protection:

1. Go to repository **Settings** → **Branches**
2. Edit branch protection rule for `main`
3. Enable "Require status checks to pass before merging"
4. Add the stable check names: `ci/build`, `ci/lint`, `ci/test`, `ci/e2e`

The summary checks (`ci/test` and `ci/e2e`) aggregate results from all matrix job variants, so you only need to require these single checks instead of each individual matrix combination.

## Migration Checklist

- [x] Create new `post-check-run` action with Checks API
- [x] Add comprehensive unit tests
- [x] Update CI workflow to use new action
- [x] Add `permissions: checks: write` to all jobs
- [x] Document stable check names
- [ ] Update branch protection rules to use new check names
- [ ] Verify check-runs appear in PRs (requires live workflow run)
- [x] Remove `post-status-check` once the Checks API rollout is stable

## Legacy Cleanup

The legacy `post-status-check` action has been removed from the repository. The CI workflow now relies exclusively on the Checks API and only requests `checks: write` permissions.

## Differences from Statuses API

| Feature | Statuses API | Checks API |
| --- | --- | --- |
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
