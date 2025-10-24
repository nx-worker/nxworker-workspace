IMPORTANT: Use the repository's @AGENTS.md file for instructions.

## Pull requests

1. Update the pull request title using Conventional Commits format.
1. Update the pull request description to include a summary of changes.

## GitHub CLI

Use the GitHub CLI (`gh`) to interact with GitHub.

The following is a list of allowed GitHub CLI commands where `<owner>` is `nx-worker` and `<repo>` is `nxworker-workspace`.

- `gh auth status`
- `gh help`
- `gh version`
- `gh status`
- `gh repo list <owner> --limit 100`
- `gh repo view --json name,description,visibility,defaultBranchRef,archived,isTemplate <owner>/<repo>`
- `gh issue list --repo <owner>/<repo> --state all --limit 100`
- `gh issue view <number> --repo <owner>/<repo> --json number,title,state,author,createdAt,updatedAt,comments`
- `gh issue status --repo <owner>/<repo>`
- `gh pr list --repo <owner>/<repo> --state all --limit 100`
- `gh pr view --repo <owner>/<repo> --json number,title,state,author,baseRefName,headRefName,mergeable <number>`
- `gh pr diff --repo <owner>/<repo> <number>`
- `gh pr checks --repo <owner>/<repo> <number>`
- `gh release list --repo <owner>/<repo> --limit 50`
- `gh release view --repo <owner>/<repo> --json tagName,name,publishedAt,url <tag>`
- `gh workflow list --repo <owner>/<repo> --limit 50`
- `gh workflow view --repo <owner>/<repo> --json name,path,state,createdAt,updatedAt <workflow_id>`
- `gh run list --repo <owner>/<repo> --limit 50`
- `gh run view --repo <owner>/<repo> --json databaseId,displayTitle,status,conclusion,workflowName,createdAt,updatedAt <run_id>`
- `gh search repos --limit 50 --json name,owner,description,stargazersCount "<query>"`
- `gh search issues --limit 50 --json number,title,state,repository,author "<query>"`
- `gh search prs --limit 50 --json number,title,state,repository,author "<query>"`
- `gh search code --limit 50 "<query>"`
- `gh api /repos/<owner>/<repo> --method GET`
- `gh api --method GET /repos/<owner>/<repo>/issues/<number>`
- `gh api --method GET /repos/<owner>/<repo>/pulls/<number>`
- `gh extension list`
- `gh alias list`

Ask a human if you need to extend this list with write commands.
