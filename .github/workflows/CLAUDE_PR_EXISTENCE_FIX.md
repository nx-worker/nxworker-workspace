# Claude Workflow PR Existence Check Fix

## Problem Description

The Claude workflow failed when the `issue-labeled-setup` job attempted to create a PR for a branch that already had an open PR. This occurred when:

1. An issue was labeled with "claude", creating a branch and PR
2. The "claude" label was removed and re-added (or the workflow was re-triggered)
3. The workflow attempted to create a duplicate PR, resulting in an error:

```
Run # Create PR with placeholder content
a pull request for branch "claude/issue-242-e2e-benchmark-regression-testing" into branch "main" already exists:
https://github.com/nx-worker/nxworker-workspace/pull/272
Error: Process completed with exit code 1.
```

## Root Cause

Both `issue-opened-setup` and `issue-labeled-setup` jobs unconditionally attempted to create a PR using `gh pr create` without first checking if a PR already existed for the branch.

The `gh pr create` command fails with exit code 1 when a PR already exists for the specified branch, causing the entire workflow to fail.

## Solution

Modified both jobs to check for existing PRs before attempting to create a new one:

### Implementation

```yaml
- name: Create PR
  id: create_pr
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    # Check if PR already exists for this branch
    BRANCH_NAME="${{ steps.create_branch.outputs.branch_name }}"
    EXISTING_PR=$(gh pr list --head "$BRANCH_NAME" --state open --json number --jq '.[0].number' 2>/dev/null || echo "")

    if [ -n "$EXISTING_PR" ]; then
      echo "PR already exists for branch $BRANCH_NAME: #$EXISTING_PR"
      PR_NUMBER="$EXISTING_PR"
    else
      echo "Creating new PR for branch $BRANCH_NAME"
      # Create PR with placeholder content
      PR_TITLE="🤖 Claude: ${{ github.event.issue.title }}"
      PR_BODY="..."
      
      PR_NUMBER=$(gh pr create \
        --title "$PR_TITLE" \
        --body "$PR_BODY" \
        --base "${{ github.event.repository.default_branch }}" \
        --head "$BRANCH_NAME" \
        --label "claude" | grep -oP '(?<=pull/)[0-9]+')
    fi

    echo "pr_number=$PR_NUMBER" >> $GITHUB_OUTPUT

    # Link PR to issue
    gh issue comment ${{ github.event.issue.number }} --body "🤖 Claude is working on this issue in PR #$PR_NUMBER"
```

### Key Changes

1. **Check for existing PR**: Uses `gh pr list --head "$BRANCH_NAME" --state open` to check if a PR exists
2. **Conditional creation**: Only calls `gh pr create` if no existing PR is found
3. **Reuse existing PR**: If PR exists, uses its number instead of creating a new one
4. **Error handling**: The `|| echo ""` ensures the command doesn't fail even if no PR exists
5. **Consistent behavior**: Applied to both `issue-opened-setup` and `issue-labeled-setup` jobs

## Benefits

1. **Prevents workflow failures**: No longer fails when a PR already exists
2. **Idempotent behavior**: Re-triggering the workflow uses the existing PR instead of failing
3. **Better user experience**: Users can re-label issues without causing errors
4. **Consistent with branch handling**: Mirrors the existing logic for branch creation (lines 303-310, 431-438)

## Testing

### Manual Validation

- ✅ YAML syntax validation passed
- ✅ Prettier formatting check passed
- ✅ Logic tested with shell script simulation

### Expected Behavior

| Scenario | Old Behavior | New Behavior |
| --- | --- | --- |
| First time labeling an issue | Creates branch and PR | Creates branch and PR ✅ |
| Re-labeling the same issue | ❌ Fails with error | Uses existing PR ✅ |
| Labeling issue with existing branch/PR | ❌ Fails with error | Uses existing PR ✅ |

## Related Files

- `.github/workflows/claude.yml` - Main workflow file (modified)
- `.github/workflows/CLAUDE_LABEL_TRIGGER_FIX.md` - Related fix for label trigger permissions
- `.github/workflows/CLAUDE_WORKFLOW_REFACTORING.md` - Overall workflow documentation

## Implementation Details

### Command Breakdown

```bash
gh pr list --head "$BRANCH_NAME" --state open --json number --jq '.[0].number'
```

- `--head "$BRANCH_NAME"`: Filter PRs by head branch
- `--state open`: Only check open PRs (not closed/merged)
- `--json number`: Return only the PR number field
- `--jq '.[0].number'`: Extract the first PR's number
- `2>/dev/null || echo ""`: Suppress errors and return empty string if no PR found

### Safety Considerations

1. **No force operations**: Doesn't force-create or overwrite existing PRs
2. **Preserves existing PRs**: Reuses the existing PR number without modification
3. **Maintains issue linking**: Still creates the issue comment linking to the PR
4. **State open filter**: Only considers open PRs, allowing new PRs if old ones are closed

## Future Improvements

Potential enhancements for future consideration:

1. **Update existing PR**: Could update the PR title/body if issue title changed
2. **Handle multiple PRs**: Currently uses the first PR found; could warn if multiple exist
3. **Closed PR detection**: Could detect if PR was closed and create a new one
4. **Comment differentiation**: Different comment text for existing vs new PRs
