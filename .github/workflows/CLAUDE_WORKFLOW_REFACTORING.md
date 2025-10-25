# Claude Workflow Refactoring Summary

## Overview

This document describes the refactoring of the Claude workflow to address issues with branch handling and code duplication.

## Problems Addressed

### 1. Massive Compound Condition

**Before:** Single job with a 49-line compound conditional that checked all trigger scenarios.

**After:** 7 separate jobs (plus helper jobs), each with a simple, focused condition

### 2. Branch Assignment Issues

**Before:** When issues were labeled with "claude" or mentioned @claude in the issue body, the workflow ran on the main branch, causing the branch protection checks to fail.

**After:** Different branch handling strategies based on trigger type:

- **Issue-based triggers** (issue opened, issue labeled, issue comments on standalone issues): Skip the branch check and let Claude create the branch automatically
- **PR-based triggers** (PR labeled, PR reviews, issue comments on PRs): Checkout the PR's head branch explicitly

### 3. Code Duplication

**Before:** Claude args, permissions, and setup steps were duplicated across scenarios **After:** Centralized in a reusable workflow (`claude-run-reusable.yml`)

## Workflow Structure

### Main Workflow (`claude.yml`)

Contains 9 jobs that handle different trigger mechanisms:

1. **manual-dispatch** (validation job)
   - Validates workflow_dispatch inputs
   - Builds custom prompt
2. **manual-dispatch-run**
   - Executes Claude for manual workflow dispatch
   - Uses the current branch (must be non-main)

3. **issue-comment-check**
   - Determines if the comment is on a PR or standalone issue
   - Fetches PR head ref if applicable
4. **issue-comment-run**
   - Executes Claude for issue/PR comments
   - Handles both PR comments (uses PR head branch) and issue comments (lets Claude create branch)

5. **pr-review-comment**
   - Executes Claude for PR review comments
   - Uses PR head branch

6. **pr-review**
   - Executes Claude for PR reviews
   - Uses PR head branch

7. **issue-opened**
   - Executes Claude when an issue is opened with @claude
   - Lets Claude create a branch (skips branch check)
   - Provides custom prompt with issue title

8. **issue-labeled**
   - Executes Claude when the "claude" label is applied to an issue
   - Lets Claude create a branch (skips branch check)
   - Provides custom prompt with issue title

9. **pr-labeled**
   - Executes Claude when the "claude" label is applied to a PR
   - Uses PR head branch
   - Provides custom prompt with PR title

### Reusable Workflow (`claude-run-reusable.yml`)

Contains the actual Claude execution logic with:

- Configurable inputs:
  - `skip_branch_check`: Whether to skip the main branch check (for issue-based triggers)
  - `checkout_ref`: Git ref to checkout (PR head branch, current branch, etc.)
  - `issue_number`: For concurrency grouping
  - `custom_prompt`: Optional custom prompt
- Shared Claude configuration:
  - Allowed tools (WebSearch, WebFetch, Bash commands, gh CLI)
  - MCP configuration for Nx
  - Permissions (contents:write, pull-requests:write, issues:write, etc.)
- Security measures:
  - Optional main branch check (can be skipped for issue-based triggers)
  - Git pre-push hook to prevent accidental pushes to main

## Security Considerations

All jobs maintain the same security controls as the original:

1. **Trusted member check**: Only users with MEMBER, OWNER, or COLLABORATOR association can trigger
2. **Branch protection**: Main branch pushes are blocked (either by upfront check or pre-push hook)
3. **Input validation**: workflow_dispatch inputs are validated before use
4. **Concurrency control**: One Claude run per issue/PR/branch at a time

## Benefits

1. **Clearer code**: Each job has a single, focused purpose
2. **Better branch handling**: Issue-based triggers now work correctly by letting Claude create branches
3. **Easier maintenance**: Claude configuration centralized in one place
4. **Custom prompts**: Issue/PR-based triggers now get context-specific prompts
5. **Smaller diffs**: Updating Claude args only requires changing the reusable workflow
