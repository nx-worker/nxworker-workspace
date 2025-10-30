# CI Scripts

This directory contains utility scripts for CI workflows.

## run-tests-with-retry.sh

A retry wrapper for Nx test commands to handle the ENOENT cache error bug in Nx 19.8.14.

### Problem

Nx 19.8.14 has a race condition in the forked-process-task-runner where:

1. The task runner creates `.nx/cache/terminalOutputs` directory asynchronously
2. Forked processes try to write terminal output cache files synchronously
3. If a forked process writes before the async mkdir completes, it throws ENOENT

This causes CI failures even when all tests pass successfully. The error looks like:

```
Error: ENOENT: no such file or directory, open '.nx/cache/terminalOutputs/3256448956402321511'
    at writeFileSync (node:fs:2425:20)
    at ForkedProcessTaskRunner.writeTerminalOutput
```

### Solution

The retry wrapper script:

1. Runs the Nx test command
2. Captures all output
3. Checks if failure is due to the terminalOutputs ENOENT error
4. If tests passed but only cache write failed, treats as success
5. If real test failure, returns the original error code
6. Retries up to 3 times with exponential backoff for transient errors

### Usage

```bash
bash tools/scripts/run-tests-with-retry.sh npx nx affected -t test [options]
```

Example in CI workflow:

```yaml
- name: Run tests
  shell: bash
  run: |
    bash tools/scripts/run-tests-with-retry.sh \
      npx nx affected -t test --configuration=ci --output-style=static
```

### Configuration

The script has configurable parameters at the top:

- `MAX_RETRIES`: Number of retry attempts (default: 3)
- `RETRY_DELAY`: Initial delay between retries in seconds (default: 2, with exponential backoff)

### Exit Codes

- `0`: Tests passed successfully
- `2`: Internal code - tests passed but cache write failed (treated as success)
- Other: Actual test failure exit code

### Future

This wrapper should be removed once Nx fixes the terminalOutputs race condition bug. Track Nx releases for fixes to the forked-process-task-runner cache handling.
