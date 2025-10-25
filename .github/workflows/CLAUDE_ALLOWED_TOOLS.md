# Claude Code Allowed Tools

This document describes the tools and commands that are allowed for Claude Code in the GitHub Actions workflow.

## Overview

The allowed tools are configured in `.github/workflows/claude-run-reusable.yml` under the `claude_args` section. These tools control what operations Claude Code can perform when working on issues and pull requests.

## Permission Rejection Reporting

Claude Code is configured to automatically report permission denials. If Claude attempts to run a command that is not in the allowed tools list, it will post a comment in the PR with:

1. The exact command that was blocked
2. The intent - what Claude was trying to accomplish
3. The specific task or TODO item being worked on
4. Any additional context

This helps maintainers evaluate whether to add new commands to the allowed tools list based on actual usage patterns.

## File Operations

- `Read` - Read file contents
- `Grep` - Search for patterns in files
- `Edit` - Edit existing files
- `MultiEdit` - Edit multiple files
- `Write` - Create new files
- `LS` - List directory contents

## MCP Tools

- `mcp:nx:*` - Access to Nx workspace tools via MCP server

## Web Access

- `WebSearch` - Search the web for information
- `WebFetch(domain:github.com)` - Fetch content from GitHub
- `WebFetch(domain:nx.dev)` - Fetch content from Nx documentation

## Git Operations

### Read Operations

- `Bash(git log:*)` - View commit history
- `Bash(git show:*)` - View commit details and file contents at specific commits
- `Bash(git status)` - Check repository status
- `Bash(git diff:*)` - View file changes
- `Bash(git remote:*)` - View and manage remote repositories
- `Bash(git tag:*)` - List and manage tags
- `Bash(git config --get:*)` - Read Git configuration values
- `Bash(git config --list)` - List all Git configuration

### Write Operations

- `Bash(git add:*)` - Stage files for commit
- `Bash(git commit:*)` - Commit changes
- `Bash(git push:*)` - Push commits to remote repository
- `Bash(git reset:*)` - Unstage or reset changes
- `Bash(git checkout:*)` - Switch branches or restore files
- `Bash(git branch:*)` - Manage branches
- `Bash(git fetch:*)` - Fetch changes from remote
- `Bash(git stash:*)` - Temporarily store changes

**Note:** While these Git operations are allowed, the workflow has built-in safety measures:

- Pre-push hooks prevent pushing to the main branch
- Branch checks prevent commits to protected branches
- The workflow operates in a sandboxed environment

## Shell Navigation and File System

### Directory Navigation

- `Bash(pwd)` - Print working directory
- `Bash(find:*)` - Search for files and directories
- `Bash(tree:*)` - Display directory structure in tree format
- `Bash(which:*)` - Locate executables in PATH

### File Viewing

- `Bash(cat:*)` - View file contents
- `Bash(head:*)` - View beginning of files
- `Bash(tail:*)` - View end of files

### File Operations

- `Bash(mkdir:*)` - Create directories
- `Bash(mv:*)` - Move or rename files
- `Bash(cp:*)` - Copy files
- `Bash(touch:*)` - Create empty files or update timestamps

### Text Processing

- `Bash(wc:*)` - Count words, lines, or characters
- `Bash(sort:*)` - Sort lines of text
- `Bash(uniq:*)` - Filter or count unique lines
- `Bash(sed:*)` - Stream editor for text transformations
- `Bash(awk:*)` - Pattern scanning and text processing
- `Bash(cut:*)` - Extract columns from text

## Script Execution

- `Bash(node:*)` - Execute Node.js scripts
- `Bash(python:*)` - Execute Python scripts (Python 2.x)
- `Bash(python3:*)` - Execute Python 3 scripts

## Package Management

- `Bash(npm install)` - Install npm dependencies
- `Bash(npm run:*)` - Run npm scripts

## Nx Commands

- `Bash(npx nx:*)` - Run Nx CLI commands

## GitHub CLI (gh)

### General

- `Bash(gh auth status)` - Check authentication status
- `Bash(gh help)` - Get help
- `Bash(gh version)` - Show version
- `Bash(gh status)` - Show status
- `Bash(gh extension list)` - List extensions
- `Bash(gh alias list)` - List aliases

### Repository

- `Bash(gh repo list nx-worker --limit 100)` - List repositories
- `Bash(gh repo view nx-worker/nxworker-workspace --json ...)` - View repository details

### Issues

- `Bash(gh issue list --repo nx-worker/nxworker-workspace --state all --limit 100)` - List issues
- `Bash(gh issue view:*)` - View issue details
- `Bash(gh issue status --repo nx-worker/nxworker-workspace)` - Show issue status
- `Bash(gh issue comment:*)` - Comment on issues
- `Bash(gh issue edit:*)` - Edit issues
- `Bash(gh issue close:*)` - Close issues

### Pull Requests

- `Bash(gh pr list --repo nx-worker/nxworker-workspace --state all --limit 100)` - List PRs
- `Bash(gh pr view --repo nx-worker/nxworker-workspace --json ...)` - View PR details
- `Bash(gh pr diff --repo nx-worker/nxworker-workspace:*)` - View PR diff
- `Bash(gh pr checks --repo nx-worker/nxworker-workspace:*)` - Check PR status
- `Bash(gh pr comment:*)` - Comment on PRs
- `Bash(gh pr edit:*)` - Edit PRs
- `Bash(gh pr ready:*)` - Mark PR as ready

### Releases

- `Bash(gh release list --repo nx-worker/nxworker-workspace --limit 50)` - List releases
- `Bash(gh release view --repo nx-worker/nxworker-workspace --json ...)` - View release details

### Workflows

- `Bash(gh workflow list --repo nx-worker/nxworker-workspace --limit 50)` - List workflows
- `Bash(gh workflow view --repo nx-worker/nxworker-workspace --json ...)` - View workflow details
- `Bash(gh workflow run:*)` - Trigger workflows
- `Bash(gh run list --repo nx-worker/nxworker-workspace --limit 50)` - List workflow runs
- `Bash(gh run view --repo nx-worker/nxworker-workspace --json ...)` - View run details
- `Bash(gh run rerun:*)` - Rerun workflows

### Search

- `Bash(gh search repos --limit 50 --json ...)` - Search repositories
- `Bash(gh search issues --limit 50 --json ...)` - Search issues
- `Bash(gh search prs --limit 50 --json ...)` - Search pull requests
- `Bash(gh search code --limit 50:*)` - Search code

### API Access

- `Bash(gh api --method GET /repos/nx-worker/nxworker-workspace)` - Repository API
- `Bash(gh api --method GET /repos/nx-worker/nxworker-workspace/issues/:*)` - Issues API
- `Bash(gh api --method GET /repos/nx-worker/nxworker-workspace/pulls/:*)` - Pull Requests API

## Security Considerations

### Git Operations Safety

While write Git operations are now allowed, the workflow includes multiple safety layers:

1. **Branch Protection**: Pre-push hooks prevent pushing to the main branch
2. **Branch Checks**: The workflow validates it's not running on a protected branch
3. **Sandboxed Environment**: All operations run in isolated GitHub Actions runners
4. **Permission Scope**: Git operations are limited by GitHub token permissions

### Restricted Operations

The following Git operations are intentionally NOT allowed for security:

- `git push --force` (force push could overwrite history)
- Direct pushes to main/master branches (protected by hooks and checks)

## Modification Guide

To add new allowed tools:

1. Edit `.github/workflows/claude-run-reusable.yml`
2. Locate the `--allowed-tools` section under `claude_args`
3. Add the new tool following the existing pattern:
   - File operations: `ToolName`
   - Bash commands: `Bash(command:*)`
   - Web access: `WebFetch(domain:example.com)`
4. Test the changes in a PR
5. Update this documentation file

## References

- [Claude Code Action Documentation](https://github.com/anthropics/claude-code-action)
- [GitHub Actions Permissions](./PERMISSIONS.md)
- [Claude Workflow Documentation](../../CLAUDE.md)
