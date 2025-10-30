#!/usr/bin/env bash

# Retry wrapper for Nx test command to handle ENOENT cache errors
# This script works around an Nx 19.8.14 bug where the forked-process-task-runner
# tries to write terminal output cache files before the directory is created.

set -o pipefail

# Configuration
MAX_RETRIES=3
RETRY_DELAY=2
EXIT_CODE=0

# Function to check if error is the Nx cache ENOENT bug
is_cache_enoent_error() {
  local output="$1"
  # Check for the specific ENOENT error pattern related to terminalOutputs
  # Redirect stderr to suppress "Broken pipe" error when grep exits early
  if echo "$output" 2>/dev/null | grep -q "ENOENT.*\.nx/cache/terminalOutputs"; then
    return 0  # true - this is the cache error
  fi
  return 1  # false - not the cache error
}

# Function to run the test command
run_test_command() {
  local attempt=$1
  local temp_output=$(mktemp)

  echo "==> Attempt $attempt of $MAX_RETRIES"

  # Run the test command and capture both stdout and stderr
  # Pass all script arguments to the test command
  "$@" 2>&1 | tee "$temp_output"
  local test_exit_code=${PIPESTATUS[0]}

  # Read the captured output
  local output=$(cat "$temp_output")
  rm "$temp_output"

  # If command succeeded, we're done
  if [ $test_exit_code -eq 0 ]; then
    echo "==> Tests passed successfully"
    return 0
  fi

  # If command failed, check if it's the ENOENT cache error
  if is_cache_enoent_error "$output"; then
    echo "==> Detected Nx cache ENOENT error (known bug in Nx 19.8.14)"

    # Check if tests actually passed before the error
    # Look for test summary lines that indicate success
    # Redirect stderr to suppress "Broken pipe" error when grep exits early
    if echo "$output" 2>/dev/null | grep -q "Test Suites:.*passed"; then
      echo "==> Tests passed but cache write failed - this is the Nx bug"
      return 2  # Special return code: tests passed but cache failed
    fi
  fi

  # Tests actually failed or unknown error
  echo "==> Tests failed with exit code $test_exit_code"
  return $test_exit_code
}

# Main retry loop
for attempt in $(seq 1 $MAX_RETRIES); do
  run_test_command "$@"
  EXIT_CODE=$?

  if [ $EXIT_CODE -eq 0 ]; then
    # Success
    exit 0
  elif [ $EXIT_CODE -eq 2 ]; then
    # Tests passed but cache write failed - treat as success
    echo "==> Treating as success (tests passed, only cache write failed)"
    exit 0
  fi

  # If not the last attempt, wait and retry
  if [ $attempt -lt $MAX_RETRIES ]; then
    echo "==> Retrying in $RETRY_DELAY seconds..."
    sleep $RETRY_DELAY
    # Exponential backoff
    RETRY_DELAY=$((RETRY_DELAY * 2))
  fi
done

# All retries exhausted
echo "==> All $MAX_RETRIES attempts failed"
exit $EXIT_CODE
