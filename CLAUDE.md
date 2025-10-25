IMPORTANT: Use the repository's @AGENTS.md file for instructions.

## Pull requests

1. Update the pull request title using Conventional Commits format.
1. Update the pull request description to include a summary of changes.

## GitHub CLI

Use the GitHub CLI (`gh`) to interact with GitHub.

The following is a list of allowed GitHub CLI commands where `<owner>` is `nx-worker` and `<repo>` is `nxworker-workspace`.

### General/Help

- `gh auth status`
- `gh help`
- `gh version`
- `gh status`
- `gh extension list`
- `gh alias list`

### Repository Information

- `gh repo list <owner> --limit 100`
- `gh repo view --json name,description,visibility,defaultBranchRef,archived,isTemplate <owner>/<repo>`

### Issue Management

- `gh issue list --repo <owner>/<repo> --state all --limit 100`
- `gh issue view <number> --repo <owner>/<repo> --json number,title,state,author,createdAt,updatedAt,comments`
- `gh issue status --repo <owner>/<repo>`
- `gh issue comment <number> --repo <owner>/<repo> --body "<body>"`
- `gh issue edit <number> --repo <owner>/<repo> --title "<title>" --body "<body>"`
- `gh issue close <number> --repo <owner>/<repo> --comment "<reason>"`

### Pull Request Operations

- `gh pr list --repo <owner>/<repo> --state all --limit 100`
- `gh pr view --repo <owner>/<repo> --json number,title,state,author,baseRefName,headRefName,mergeable <number>`
- `gh pr diff --repo <owner>/<repo> <number>`
- `gh pr checks --repo <owner>/<repo> <number>`
- `gh pr comment <number> --repo <owner>/<repo> --body "<body>"`
- `gh pr edit <number> --repo <owner>/<repo> --title "<title>" --body "<body>"`
- `gh pr ready <number> --repo <owner>/<repo>`

### Release Information

- `gh release list --repo <owner>/<repo> --limit 50`
- `gh release view --repo <owner>/<repo> --json tagName,name,publishedAt,url <tag>`

### Workflow Management

- `gh workflow list --repo <owner>/<repo> --limit 50`
- `gh workflow view --repo <owner>/<repo> --json name,path,state,createdAt,updatedAt <workflow_id>`
- `gh workflow run <workflow_id> --repo <owner>/<repo>`
- `gh run list --repo <owner>/<repo> --limit 50`
- `gh run view --repo <owner>/<repo> --json databaseId,displayTitle,status,conclusion,workflowName,createdAt,updatedAt <run_id>`
- `gh run rerun <run_id> --repo <owner>/<repo>`

### Search Capabilities

- `gh search repos --limit 50 --json name,owner,description,stargazersCount "<query>"`
- `gh search issues --limit 50 --json number,title,state,repository,author "<query>"`
- `gh search prs --limit 50 --json number,title,state,repository,author "<query>"`
- `gh search code --limit 50 "<query>"`

### GitHub API Access

- `gh api --method GET /repos/<owner>/<repo>`
- `gh api --method GET /repos/<owner>/<repo>/issues/<number>`
- `gh api --method GET /repos/<owner>/<repo>/pulls/<number>`

### Restricted Commands

The following commands are intentionally omitted for security.

- `gh pr create` - PR creation restricted to humans
- `gh issue create` - Issue creation restricted to humans
- `gh pr merge` - Merging requires human approval

Ask a human if we need to extend this list with more commands to perform your tasks.
