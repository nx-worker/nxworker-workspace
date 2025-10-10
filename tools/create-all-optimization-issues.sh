#!/bin/bash

# Script to create all 14 performance optimization issues in GitHub
# Requires: GitHub CLI (gh) installed and authenticated

set -e

echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║  Creating Performance Optimization Issues for nxworker-workspace         ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo "❌ Error: GitHub CLI (gh) is not installed."
    echo "   Please install it from: https://cli.github.com/"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ Error: Not authenticated with GitHub CLI."
    echo "   Please run: gh auth login"
    exit 1
fi

echo "✅ GitHub CLI is installed and authenticated"
echo ""

# Array of issue templates (in priority order)
declare -a templates=(
    # High Priority (Quick Wins)
    "perf-03-lazy-project-graph-resolution.md:perf: implement lazy project graph resolution:priority: high"
    "perf-10-project-import-path-lookup-table.md:perf: implement project import path lookup table:priority: high"
    "perf-02-import-specifier-pattern-precompilation.md:perf: implement import specifier pattern precompilation:priority: high"
    "perf-06-early-exit-on-empty-projects.md:perf: implement early exit on empty projects:priority: high"
    
    # Medium Priority (Good ROI)
    "perf-01-project-dependency-graph-caching.md:perf: implement project dependency graph caching:priority: medium"
    "perf-09-optimized-relative-path-calculation.md:perf: implement optimized relative path calculation:priority: medium"
    "perf-08-incremental-file-content-validation.md:perf: implement incremental file content validation:priority: medium"
    "perf-12-smart-index-file-detection.md:perf: implement smart index file detection:priority: medium"
    
    # Lower Priority (Incremental Gains)
    "perf-05-path-resolution-memoization.md:perf: implement path resolution memoization:priority: low"
    "perf-07-string-interning-for-common-paths.md:perf: implement string interning for common paths:priority: low"
    "perf-11-targeted-file-filtering.md:perf: implement targeted file filtering:priority: low"
    
    # Future Consideration
    "perf-04-batched-import-update-operations.md:perf: implement batched import update operations:future"
    "perf-13-bulk-file-operations.md:perf: implement bulk file operations:future"
    "perf-14-conditional-formatting.md:perf: implement conditional formatting:future"
)

# Counter for created issues
created=0
failed=0

echo "📝 Creating issues from templates..."
echo ""

# Create each issue
for template_info in "${templates[@]}"; do
    IFS=':' read -r template title priority <<< "$template_info"
    
    echo "Creating: $title"
    
    # Build labels based on priority
    if [[ "$priority" == "future" ]]; then
        labels="performance,optimization,future consideration"
    else
        labels="performance,optimization,$priority"
    fi
    
    # Create the issue
    if gh issue create \
        --title "$title" \
        --label "$labels" \
        --body-file ".github/ISSUE_TEMPLATE/$template" &> /dev/null; then
        echo "  ✅ Created successfully"
        ((created++))
    else
        echo "  ❌ Failed to create"
        ((failed++))
    fi
    
    # Brief pause to avoid rate limiting
    sleep 1
done

echo ""
echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║  Summary                                                                 ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "✅ Successfully created: $created issues"
if [[ $failed -gt 0 ]]; then
    echo "❌ Failed to create: $failed issues"
fi
echo ""
echo "View all issues at:"
echo "  https://github.com/nx-worker/nxworker-workspace/issues?q=is%3Aissue+label%3Aperformance+label%3Aoptimization"
echo ""
echo "Next steps:"
echo "  1. Review the created issues"
echo "  2. Assign issues to team members or GitHub Copilot agents"
echo "  3. Consider creating milestones to group related optimizations"
echo ""
