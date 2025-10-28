# Claude Code Allowed Commands

This document lists the commands that Claude Code is allowed to execute in the workflows.

## Main Claude Workflow (`.github/workflows/claude.yml`)

The following Bash commands are allowed:

- `npx nx:*` - Any Nx CLI command (e.g., `npx nx build`, `npx nx test`, `npx nx lint`)
- `npm run:*` - Any npm script defined in package.json (e.g., `npm run build`, `npm run test`)
- `npm install*` - npm install with any parameters
  - `npm install` - Install all dependencies
  - `npm install package-name` - Install a specific package
  - `npm install --save-dev package-name` - Install as dev dependency
  - `npm install --force` - Force reinstall
  - `npm install --legacy-peer-deps` - Install with legacy peer deps
- `npm ci*` - npm ci (clean install) with any parameters
  - `npm ci` - Clean install from lock file
  - `npm ci --legacy-peer-deps` - Clean install with legacy peer deps
- `mcp__nx__*` - Nx MCP (Model Context Protocol) server commands

## Claude Code Review Workflow (`.github/workflows/claude-code-review.yml`)

In addition to the commands above, this workflow also allows GitHub CLI commands:

- `gh issue view:*` - View issue details
- `gh search:*` - Search GitHub
- `gh issue list:*` - List issues
- `gh pr comment:*` - Comment on pull requests
- `gh pr diff:*` - View PR diffs
- `gh pr view:*` - View PR details
- `gh pr list:*` - List pull requests

Plus the same npm and Nx commands as the main workflow.

## Security Considerations

The allowed-tools configuration restricts what commands Claude can execute to prevent:

1. **Arbitrary command execution** - Only specific command patterns are allowed
2. **File system manipulation** - Commands like `rm`, `mv`, `cp` are not allowed
3. **Network access** - Commands like `curl`, `wget` are not allowed
4. **System modification** - Commands like `sudo`, `chmod`, `chown` are not allowed

The workflows use GitHub's OIDC authentication and have specific permissions:
- `contents:write` - Push commits and create branches
- `issues:write` - Create and update issue comments
- `pull-requests:write` - Create and update PRs and PR comments
- `actions:read` - Access workflow run information
- `id-token:write` - OIDC authentication with Claude Code service

## References

- [Claude Code Action Documentation](https://github.com/anthropics/claude-code-action)
- [Claude Code CLI Reference](https://docs.claude.com/en/docs/claude-code/cli-reference)
- [GitHub Actions Permissions](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#permissions-for-the-github_token)
