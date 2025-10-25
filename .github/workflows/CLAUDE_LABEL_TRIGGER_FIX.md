# Claude Workflow Label Trigger Fix

## Problem Description

The Claude workflow failed when triggered by applying the "claude" label to an issue or pull request. The workflow would not start, preventing automated Claude Code assistance for labeled issues and PRs.

## Root Cause

The workflow incorrectly validated permissions by checking the **issue/PR author's** association instead of the **label applier's** permissions:

### Issue Labeled Trigger (Before)

```yaml
issue-labeled-setup:
  if: |
    github.event_name == 'issues' &&
    github.event.action == 'labeled' &&
    github.event.label.name == 'claude' &&
    github.event.sender.type == 'User' &&
    (github.event.issue.author_association == 'MEMBER' ||
     github.event.issue.author_association == 'OWNER' ||
     github.event.issue.author_association == 'COLLABORATOR')  # ❌ Wrong check!
```

### PR Labeled Trigger (Before)

```yaml
pr-labeled:
  if: |
    github.event_name == 'pull_request' &&
    github.event.action == 'labeled' &&
    github.event.label.name == 'claude' &&
    github.event.sender.type == 'User' &&
    (github.event.pull_request.author_association == 'MEMBER' ||
     github.event.pull_request.author_association == 'OWNER' ||
     github.event.pull_request.author_association == 'COLLABORATOR')  # ❌ Wrong check!
```

### Why This Was Wrong

- `github.event.issue.author_association` = the **issue author's** association
- `github.event.pull_request.author_association` = the **PR author's** association
- `github.event.sender` = the **person who applied the label**

If a trusted member (COLLABORATOR/MEMBER/OWNER) labeled an issue created by a non-member, the workflow would fail because it checked the issue author's association, not the labeler's permissions.

## Solution

### 1. Removed Incorrect Checks

Removed the `author_association` checks from the `if` conditions since they were validating the wrong person's permissions.

### 2. Added Explicit Permission Verification

Added a dedicated step in each job to verify the label applier has the required permissions using the GitHub API:

```yaml
- name: Verify sender permissions
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    # Verify the sender has write or admin permission
    PERMISSION=$(gh api /repos/${{ github.repository }}/collaborators/${{ github.event.sender.login }}/permission | jq -r '.permission')

    if [[ "$PERMISSION" != "admin" && "$PERMISSION" != "write" ]]; then
      echo "❌ Error: User ${{ github.event.sender.login }} does not have sufficient permissions (permission: $PERMISSION)"
      echo "Only users with write or admin access can trigger Claude via labels"
      exit 1
    fi

    echo "✅ Permission check passed: ${{ github.event.sender.login }} has $PERMISSION permission"
```

### 3. Restructured PR Labeled Job

Split `pr-labeled` into two jobs to enable permission checking before calling the reusable workflow:

```yaml
pr-labeled-check:
  # Runs permission verification
  if: |
    github.event_name == 'pull_request' &&
    github.event.action == 'labeled' &&
    github.event.label.name == 'claude' &&
    github.event.sender.type == 'User'
  steps:
    - name: Verify sender permissions
      # ... permission check ...

pr-labeled:
  needs: pr-labeled-check
  # Calls the reusable workflow
  uses: ./.github/workflows/claude-run-reusable.yml
```

## Security Model

The fix maintains strong security through multiple layers:

1. **Bot Prevention**: `sender.type == 'User'` ensures only human users can trigger
2. **Permission Verification**: Explicit check that sender has write or admin access via GitHub API
3. **GitHub's Permission Model**: Only users with write access can apply labels in the first place
4. **Branch Protection**: Pre-push hooks and checks prevent commits to main branch
5. **Concurrency Control**: One Claude run per issue/PR at a time

## Files Changed

- `.github/workflows/claude.yml` - Main workflow file
  - Removed incorrect `author_association` checks
  - Added permission verification steps
  - Split `pr-labeled` into check + run jobs
- `.github/workflows/CLAUDE_WORKFLOW_REFACTORING.md` - Documentation
  - Updated security considerations
  - Documented new job structure

## Testing

Validated the fix with automated tests:

- ✅ YAML syntax validation
- ✅ Verified permission checks exist in both label trigger jobs
- ✅ Verified `pr-labeled` depends on `pr-labeled-check`
- ✅ Verified no `author_association` checks remain for label triggers
- ✅ Formatting compliance

## Impact

**Before**: Label triggers failed when a trusted member labeled an issue/PR created by a non-member

**After**: Label triggers work correctly regardless of who created the issue/PR, as long as the person applying the label has write or admin permissions

## Related Issues

This fix resolves the issue where the Claude code workflow fails when triggered by issue label assignment.
