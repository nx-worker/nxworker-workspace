# PowerShell script to create all 14 performance optimization issues in GitHub
# Requires: GitHub CLI (gh) installed and authenticated

Write-Host "╔══════════════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Creating Performance Optimization Issues for nxworker-workspace         ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check if gh is installed
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Error: GitHub CLI (gh) is not installed." -ForegroundColor Red
    Write-Host "   Please install it from: https://cli.github.com/" -ForegroundColor Yellow
    exit 1
}

# Check if authenticated
$authStatus = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error: Not authenticated with GitHub CLI." -ForegroundColor Red
    Write-Host "   Please run: gh auth login" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ GitHub CLI is installed and authenticated" -ForegroundColor Green
Write-Host ""

# Array of issue templates (in priority order)
$templates = @(
    # High Priority (Quick Wins)
    @{file="perf-03-lazy-project-graph-resolution.md"; title="perf: implement lazy project graph resolution"; priority="priority: high"},
    @{file="perf-10-project-import-path-lookup-table.md"; title="perf: implement project import path lookup table"; priority="priority: high"},
    @{file="perf-02-import-specifier-pattern-precompilation.md"; title="perf: implement import specifier pattern precompilation"; priority="priority: high"},
    @{file="perf-06-early-exit-on-empty-projects.md"; title="perf: implement early exit on empty projects"; priority="priority: high"},
    
    # Medium Priority (Good ROI)
    @{file="perf-01-project-dependency-graph-caching.md"; title="perf: implement project dependency graph caching"; priority="priority: medium"},
    @{file="perf-09-optimized-relative-path-calculation.md"; title="perf: implement optimized relative path calculation"; priority="priority: medium"},
    @{file="perf-08-incremental-file-content-validation.md"; title="perf: implement incremental file content validation"; priority="priority: medium"},
    @{file="perf-12-smart-index-file-detection.md"; title="perf: implement smart index file detection"; priority="priority: medium"},
    
    # Lower Priority (Incremental Gains)
    @{file="perf-05-path-resolution-memoization.md"; title="perf: implement path resolution memoization"; priority="priority: low"},
    @{file="perf-07-string-interning-for-common-paths.md"; title="perf: implement string interning for common paths"; priority="priority: low"},
    @{file="perf-11-targeted-file-filtering.md"; title="perf: implement targeted file filtering"; priority="priority: low"},
    
    # Future Consideration
    @{file="perf-04-batched-import-update-operations.md"; title="perf: implement batched import update operations"; priority="future"},
    @{file="perf-13-bulk-file-operations.md"; title="perf: implement bulk file operations"; priority="future"},
    @{file="perf-14-conditional-formatting.md"; title="perf: implement conditional formatting"; priority="future"}
)

# Counter for created issues
$created = 0
$failed = 0

Write-Host "📝 Creating issues from templates..." -ForegroundColor Cyan
Write-Host ""

# Create each issue
foreach ($template in $templates) {
    Write-Host "Creating: $($template.title)" -ForegroundColor White
    
    # Build labels based on priority
    if ($template.priority -eq "future") {
        $labels = "performance,optimization,future consideration"
    } else {
        $labels = "performance,optimization,$($template.priority)"
    }
    
    # Create the issue
    $templatePath = ".github\ISSUE_TEMPLATE\$($template.file)"
    $result = gh issue create --title "$($template.title)" --label "$labels" --body-file "$templatePath" 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ Created successfully" -ForegroundColor Green
        $created++
    } else {
        Write-Host "  ❌ Failed to create" -ForegroundColor Red
        $failed++
    }
    
    # Brief pause to avoid rate limiting
    Start-Sleep -Seconds 1
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Summary                                                                 ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ Successfully created: $created issues" -ForegroundColor Green
if ($failed -gt 0) {
    Write-Host "❌ Failed to create: $failed issues" -ForegroundColor Red
}
Write-Host ""
Write-Host "View all issues at:" -ForegroundColor Cyan
Write-Host "  https://github.com/nx-worker/nxworker-workspace/issues?q=is%3Aissue+label%3Aperformance+label%3Aoptimization" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Review the created issues" -ForegroundColor White
Write-Host "  2. Assign issues to team members or GitHub Copilot agents" -ForegroundColor White
Write-Host "  3. Consider creating milestones to group related optimizations" -ForegroundColor White
Write-Host ""
