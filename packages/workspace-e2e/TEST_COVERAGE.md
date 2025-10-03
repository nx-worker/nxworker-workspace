# E2E Test Coverage for move-file Generator

This document describes the end-to-end test coverage for the `move-file` generator, with a focus on cross-platform and cross-architecture compatibility.

## Test Suite Overview

The e2e test suite includes **25 test cases** organized into the following categories:

### Basic Functionality (4 tests)

1. **Plugin Installation**: Verifies the plugin installs correctly from the local registry
2. **Basic File Move**: Tests moving a file between projects with import updates
3. **Exported File Move**: Tests moving exported files and updating dependent projects
4. **Same-Project Move**: Tests moving files within the same project with relative imports

### OS-Specific Edge Cases (8 tests)

These tests validate behavior across different operating systems (Linux, macOS, Windows Server, Windows 11 ARM):

5. **Path Separators**: Validates that the generator handles both Windows backslashes (`\`) and Unix forward slashes (`/`) correctly by normalizing to POSIX style
6. **Deeply Nested Paths**: Tests handling of long, nested directory structures that may hit Windows MAX_PATH limits (260 characters)
7. **Special Characters**: Tests files with special characters that are allowed on Unix but may be problematic on Windows
8. **Spaces in File Names**: Validates proper handling of file paths with spaces across platforms
9. **Concurrent Operations**: Tests sequential file operations to ensure they work correctly despite different file locking behavior (Windows stricter than Unix)
10. **Line Ending Preservation**: Verifies that file content is preserved correctly including line endings (CRLF on Windows, LF on Unix)
11. **Files at Project Root**: Tests edge cases with path calculations when moving files from/to the project root
12. **Case Sensitivity**: Tests that moves work correctly on both case-sensitive (Linux) and case-insensitive (Windows/macOS) file systems

### Architecture-Specific Edge Cases (3 tests)

These tests ensure consistent behavior across different CPU architectures (x64/amd64 and arm64):

13. **Large File Handling**: Tests moving a file with 1000+ lines to verify efficient memory handling across architectures
14. **Many Files Stress Test**: Creates 20 files and tests performance of moving files with many potential import updates
15. **Binary-Safe Unicode Operations**: Verifies that Unicode content (Japanese, Greek, emoji) is preserved correctly across architectures

### Node.js Version-Specific Edge Cases (6 tests)

These tests validate consistent behavior across major Node.js versions (18.x, 20.x, 22.x):

16. **File System Operations**: Tests that the generator works with different fs implementations across Node.js versions
17. **Path Resolution**: Validates path normalization works consistently across Node.js 18.x, 20.x, and 22.x
18. **Modern ESM Imports**: Tests compatibility with improved ECMAScript module support in Node.js 18+
19. **Performance Improvements**: Verifies the generator benefits from Node.js 20+ fs performance enhancements
20. **Buffer Operations**: Tests Buffer handling across different Node.js Buffer implementations
21. **Built-in Fetch API**: Validates the generator works in Node.js 18+ environments with native fetch

### Failure Scenarios (4 tests)

These tests validate proper error handling across platforms:

22. **Non-Existent Source**: Verifies graceful failure when source file doesn't exist
23. **Path Traversal Rejection**: Security test ensuring path traversal attempts (e.g., `../../../etc/passwd`) are rejected
24. **Invalid Characters**: Tests rejection of dangerous characters like `[`, `]`, `*`, `(`, `)` that could be interpreted as regex patterns
25. **Auto-Create Directories**: Tests that the generator creates target directories if they don't exist

## Platform Coverage

The tests are designed to run on:

- **Linux** (Ubuntu, tested on x64)
- **macOS** (Intel and Apple Silicon)
- **Windows Server** (x64)
- **Windows 11** (x64 and ARM64)

And across Node.js versions:

- **Node.js 18.x** (LTS Hydrogen)
- **Node.js 20.x** (LTS Iron)
- **Node.js 22.x** (Current, tested)

## Architecture Coverage

The tests validate behavior on:

- **x64/amd64**: Standard 64-bit Intel/AMD processors
- **arm64**: ARM 64-bit processors (Apple Silicon M1/M2/M3, Windows ARM, Linux ARM servers)

## What's Tested

### Path Handling

- ✅ Path separator normalization (Windows `\` → Unix `/`)
- ✅ Deep directory nesting (Windows MAX_PATH considerations)
- ✅ Path traversal prevention (security)
- ✅ Special characters in file names
- ✅ Spaces in file names
- ✅ Files at different directory levels

### File System Differences

- ✅ Case-sensitive vs case-insensitive file systems
- ✅ File locking behavior (Windows vs Unix)
- ✅ Line ending preservation (CRLF vs LF)

### Content Handling

- ✅ Unicode content preservation (multi-byte characters)
- ✅ Large file handling (memory efficiency)
- ✅ Binary-safe operations

### Import Path Updates

- ✅ Relative imports within same project
- ✅ Package alias imports across projects
- ✅ Dynamic imports (`import()`)
- ✅ Exported file import updates in dependents

### Error Handling

- ✅ Non-existent source files
- ✅ Path traversal attempts
- ✅ Invalid characters in paths
- ✅ Auto-creation of target directories

## Running the Tests

```bash
# Run all e2e tests
npx nx e2e workspace-e2e

# Run with verbose output
npx nx e2e workspace-e2e --output-style stream
```

## Test Execution Time

The full e2e suite typically takes **~7-12 minutes** to run, as it:

1. Starts a local Verdaccio registry
2. Publishes the plugin to the local registry
3. Creates fresh Nx workspaces for each test scenario
4. Generates libraries and files
5. Runs the move-file generator
6. Validates the results
7. Cleans up temporary workspaces

## CI/CD Integration

The tests run automatically on GitHub Actions for:

- Pull requests
- Pushes to main branch
- Scheduled runs

The CI environment uses Ubuntu Linux x64, providing baseline coverage. For full platform coverage, tests should also be run manually on Windows and macOS systems.

## Future Enhancements

Potential areas for additional test coverage:

- Symlink handling (different across OS)
- Very long file paths (>4096 characters on modern systems)
- Files with different encodings (UTF-8, UTF-16, etc.)
- Monorepo scenarios with more complex project graphs
- Performance benchmarks across architectures
