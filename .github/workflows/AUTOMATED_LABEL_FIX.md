# Claude Workflow Automated Label Fix

## Problem Description

The Claude workflow failed when triggered by the `issue-labeled-setup` job with the following error:

```
could not add label: 'automated' not found
Error: Process completed with exit code 1.
```

This occurred when the workflow attempted to create a pull request with both the "claude" and "automated" labels, but the "automated" label did not exist in the repository.

## Root Cause

The workflow attempted to apply the "automated" label to PRs created by Claude without first ensuring the label exists:

### Issue Opened Setup (Before)

```yaml
PR_NUMBER=$(gh pr create \
  --title "$PR_TITLE" \
  --body "$PR_BODY" \
  --base "${{ github.event.repository.default_branch }}" \
  --head "${{ steps.create_branch.outputs.branch_name }}" \
  --label "claude" \
  --label "automated" | grep -oP '(?<=pull/)[0-9]+')  # ❌ Fails if label doesn't exist!
```

### Why This Was Wrong

- The `gh pr create` command with `--label "automated"` expects the label to already exist
- If the label doesn't exist, the command fails with "could not add label: 'automated' not found"
- The workflow had no mechanism to create the label if it was missing

## Solution

### Added Label Existence Check

Added a new step before PR creation in both affected jobs (`issue-opened-setup` and `issue-labeled-setup`) to ensure the "automated" label exists:

```yaml
- name: Ensure automated label exists
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    # Check if automated label exists, create it if not
    if ! gh label list | grep -q "^automated"; then
      gh label create "automated" --color "ededed" --description "Automated PR created by Claude workflow"
    fi
```

### Label Properties

- **Name**: `automated`
- **Color**: `ededed` (light gray, matching the "dependencies" label)
- **Description**: "Automated PR created by Claude workflow"

## Benefits

1. **Idempotent**: The workflow can run multiple times without errors
2. **Self-healing**: Automatically creates the label if it's missing
3. **Non-breaking**: If the label already exists, the check passes silently
4. **Consistent**: Uses the same approach for both job workflows

## Files Changed

- `.github/workflows/claude.yml` - Main workflow file
  - Added "Ensure automated label exists" step to `issue-opened-setup` job
  - Added "Ensure automated label exists" step to `issue-labeled-setup` job

## Testing

Validated the fix with:

- ✅ YAML syntax validation
- ✅ Verified label creation logic is correct
- ✅ Verified both affected jobs include the new step
- ✅ Formatting compliance

## Impact

**Before**: Workflow failed when creating PRs if the "automated" label didn't exist in the repository

**After**: Workflow automatically creates the "automated" label if needed and successfully creates PRs

## Related Issues

This fix resolves issue #242 where the Claude workflow failed with "could not add label: 'automated' not found" error.
