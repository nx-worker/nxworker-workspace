# Creating All Performance Optimization Issues

This document explains how to create GitHub issues for all 14 performance optimization suggestions at once.

## Quick Start

The repository contains GitHub issue templates for each of the 14 optimization suggestions. These templates can be used to create issues via the GitHub web interface or GitHub CLI.

## Method 1: Using GitHub Web Interface (Manual)

Create issues one at a time through the GitHub interface:

1. Go to https://github.com/nx-worker/nxworker-workspace/issues/new/choose
2. Select the appropriate performance optimization template
3. Review the pre-filled content
4. Click "Submit new issue"
5. Repeat for each optimization

**Pros:**
- Full control over each issue
- Can customize content before creating
- No additional tools needed

**Cons:**
- Time-consuming (need to create 14 issues manually)
- Repetitive process

## Method 2: Using GitHub CLI (Recommended)

Use the GitHub CLI to create issues from templates:

### Prerequisites

1. Install GitHub CLI: https://cli.github.com/
2. Authenticate: `gh auth login`

### Create Individual Issues

```bash
# Navigate to repository root
cd /path/to/nxworker-workspace

# Create a single issue
gh issue create \
  --title "perf: implement lazy project graph resolution" \
  --label "performance,optimization" \
  --body-file .github/ISSUE_TEMPLATE/perf-03-lazy-project-graph-resolution.md
```

### Create All Issues at Once

Use the provided script to create all 14 optimization issues:

```bash
# Make the script executable (Unix/Linux/macOS)
chmod +x tools/create-all-optimization-issues.sh

# Run the script
./tools/create-all-optimization-issues.sh
```

Or on Windows (PowerShell):

```powershell
# Run the PowerShell script
.\tools\create-all-optimization-issues.ps1
```

## Issue Templates Overview

The following 14 issue templates are available, organized by priority:

### High Priority (Quick Wins) - Create These First

1. `perf-03-lazy-project-graph-resolution.md` - 15-20% improvement
2. `perf-10-project-import-path-lookup-table.md` - 4-7% improvement
3. `perf-02-import-specifier-pattern-precompilation.md` - 3-7% improvement
4. `perf-06-early-exit-on-empty-projects.md` - 5-10% improvement

### Medium Priority (Good ROI)

5. `perf-01-project-dependency-graph-caching.md` - 5-10% improvement
6. `perf-09-optimized-relative-path-calculation.md` - 3-6% improvement
7. `perf-08-incremental-file-content-validation.md` - 5-8% improvement
8. `perf-12-smart-index-file-detection.md` - 6-10% improvement

### Lower Priority (Incremental Gains)

9. `perf-05-path-resolution-memoization.md` - 2-5% improvement
10. `perf-07-string-interning-for-common-paths.md` - 1-3% improvement
11. `perf-11-targeted-file-filtering.md` - 8-12% improvement

### Future Consideration

12. `perf-04-batched-import-update-operations.md` - 20-30% improvement (High complexity)
13. `perf-13-bulk-file-operations.md` - 5-8% improvement
14. `perf-14-conditional-formatting.md` - 10-20% improvement (High complexity)

## Common Labels

All issues should be created with these labels:
- `performance`
- `optimization`

You may also want to add priority labels:
- `priority: high`
- `priority: medium`
- `priority: low`

## Important Notes

⚠️ **Testing is Mandatory:** Each issue template emphasizes that running benchmark and stress tests before and after changes is **REQUIRED** and must not be skipped.

### Testing Commands

**Before changes:**
```bash
npx nx e2e workspace-e2e --testPathPattern=performance-benchmark
npx nx e2e workspace-e2e --testPathPattern=performance-stress-test
```

**After changes:**
```bash
npx nx e2e workspace-e2e --testPathPattern=performance-benchmark
npx nx e2e workspace-e2e --testPathPattern=performance-stress-test
npx nx run-many --targets=test
```

## Customization

If you need to customize the issue content:

1. Copy the template file from `.github/ISSUE_TEMPLATE/`
2. Edit the content as needed
3. Create the issue using `gh issue create --body-file <your-file>`

## Tracking Progress

Once issues are created, you can track them using:

```bash
# List all performance optimization issues
gh issue list --label "performance,optimization"

# Filter by state
gh issue list --label "performance,optimization" --state open
gh issue list --label "performance,optimization" --state closed
```

## Next Steps

After creating the issues:

1. **Prioritize:** Review and add priority labels based on your needs
2. **Assign:** Assign issues to team members or GitHub Copilot agents
3. **Milestones:** Group related optimizations into milestones
4. **Projects:** Add to GitHub Projects for better tracking

## References

- [Issue Template README](.github/ISSUE_TEMPLATE/README.md) - Detailed information about each template
- [PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md](PERFORMANCE_OPTIMIZATION_SUGGESTIONS.md) - Original optimization suggestions
- [STRESS_TESTS_IMPLEMENTATION.md](STRESS_TESTS_IMPLEMENTATION.md) - Testing documentation
