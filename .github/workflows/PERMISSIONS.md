# Claude Workflow Permissions Documentation

This document provides a comprehensive overview of all permissions used in the Claude Code workflows.

## Overview

The Claude Code workflow system consists of:

1. **Main workflow** (`claude.yml`) - Contains multiple jobs that trigger Claude Code based on different events
2. **Reusable workflow** (`claude-run-reusable.yml`) - Shared execution logic called by the main workflow

## Permission Definitions

GitHub Actions permissions control what a workflow can do in the repository:

- **`contents:write`** - Push commits and create branches
- **`issues:write`** - Create and update issue comments
- **`pull-requests:write`** - Create and update PRs and PR comments
- **`actions:read`** - Access workflow run information
- **`id-token:write`** - OIDC authentication with external services (Claude Code)

## Main Workflow (`claude.yml`)

### Setup Jobs

These jobs create branches and PRs for issues:

| Job | Permissions | Purpose |
| --- | --- | --- |
| `issue-opened-setup` | `contents:write`<br>`issues:write`<br>`pull-requests:write` | Create branch and PR when issue is opened with @claude |
| `issue-labeled-setup` | `contents:write`<br>`issues:write`<br>`pull-requests:write` | Create branch and PR when issue is labeled with 'claude' |

**Why these permissions?**

- `contents:write` - Create and push new branches
- `issues:write` - Comment on the issue with PR link
- `pull-requests:write` - Create the PR

### Execution Jobs

These jobs call the reusable workflow to run Claude Code:

| Job | Permissions | Purpose |
| --- | --- | --- |
| `manual-dispatch-run` | `actions:read`<br>`contents:write`<br>`issues:write`<br>`pull-requests:write`<br>`id-token:write` | Execute Claude for manual triggers |
| `issue-comment-run` | `actions:read`<br>`contents:write`<br>`issues:write`<br>`pull-requests:write`<br>`id-token:write` | Execute Claude for issue/PR comments |
| `pr-review-comment` | `actions:read`<br>`contents:write`<br>`issues:write`<br>`pull-requests:write`<br>`id-token:write` | Execute Claude for PR review comments |
| `pr-review` | `actions:read`<br>`contents:write`<br>`issues:write`<br>`pull-requests:write`<br>`id-token:write` | Execute Claude for PR reviews |
| `issue-opened-run` | `actions:read`<br>`contents:write`<br>`issues:write`<br>`pull-requests:write`<br>`id-token:write` | Execute Claude for opened issues |
| `issue-labeled-run` | `actions:read`<br>`contents:write`<br>`issues:write`<br>`pull-requests:write`<br>`id-token:write` | Execute Claude for labeled issues |
| `pr-labeled` | `actions:read`<br>`contents:write`<br>`issues:write`<br>`pull-requests:write`<br>`id-token:write` | Execute Claude for labeled PRs |

**Why these permissions?**

- `actions:read` - Access workflow run metadata
- `contents:write` - Push commits to the PR branch
- `issues:write` - Create/update issue comments
- `pull-requests:write` - Update PR descriptions and comments
- `id-token:write` - Authenticate with Claude Code service via OIDC

### Check Jobs

These jobs perform validation or checks without executing Claude:

| Job | Permissions | Purpose |
| --- | --- | --- |
| `manual-dispatch` | None | Validate workflow_dispatch inputs |
| `issue-comment-check` | None (uses `GITHUB_TOKEN`) | Determine if comment is on PR or issue |
| `pr-labeled-check` | None (uses `GITHUB_TOKEN`) | Verify sender has write/admin permissions |

**Why no explicit permissions?**

These jobs only perform read operations using the `GITHUB_TOKEN` environment variable with default permissions.

## Reusable Workflow (`claude-run-reusable.yml`)

| Job | Permissions | Purpose |
| --- | --- | --- |
| `run` | `contents:write`<br>`pull-requests:write`<br>`issues:write`<br>`id-token:write`<br>`actions:read` | Execute Claude Code with full capabilities |

**Why these permissions?**

The reusable workflow needs comprehensive permissions because Claude Code needs to:

1. Check out the repository (`contents:write`)
2. Make code changes and commit them (`contents:write`)
3. Push commits to the PR branch (`contents:write`)
4. Update PR descriptions and comments (`pull-requests:write`)
5. Reply to issue/PR comments (`issues:write`)
6. Authenticate with the Claude Code service via OIDC (`id-token:write`)
7. Access workflow run information (`actions:read`)

## Security Considerations

### Minimal Permissions

Each job has only the permissions it needs:

- **Setup jobs** don't need `actions:read` or `id-token:write` because they only create branches and PRs
- **Check jobs** don't need explicit permissions because they only read data
- **Execution jobs** have full permissions because they call Claude Code which needs to make changes

### Permission Verification

For label-based triggers (`issue-labeled-setup`, `pr-labeled-check`), we explicitly verify that the sender has write or admin permissions using the GitHub API before proceeding.

### Default Permissions

When no explicit permissions are defined, GitHub Actions workflows use default permissions based on the repository settings. The Claude workflow explicitly defines permissions to ensure consistent behavior.

## Permission Flow

```
User Action (label, comment, etc.)
    ↓
Trigger Event (issues, pull_request, etc.)
    ↓
Check Job (if needed)
    ├── Validates permissions
    └── No explicit permissions needed
    ↓
Setup Job (if needed)
    ├── Creates branch and PR
    └── Needs: contents:write, issues:write, pull-requests:write
    ↓
Execution Job
    ├── Calls reusable workflow
    └── Needs: all permissions
    ↓
Reusable Workflow
    ├── Runs Claude Code
    └── Uses: contents:write, pull-requests:write, issues:write, id-token:write, actions:read
```

## References

- [GitHub Actions Permissions](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#permissions-for-the-github_token)
- [Workflow Syntax - Permissions](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#permissions)
- [OIDC in GitHub Actions](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
