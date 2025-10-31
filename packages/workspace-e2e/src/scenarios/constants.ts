/**
 * Shared Constants for E2E Scenarios
 *
 * Centralized constants used across infrastructure and generator scenarios
 * to avoid duplication and ensure consistency.
 *
 * Parent Issue: #319 - Adopt new end-to-end test plan
 * This Issue: #332 - Implement infrastructure scenarios
 */

/**
 * E2E test package version
 *
 * The version string used for publishing and installing the plugin
 * during e2e tests. This version is published to the local Verdaccio
 * registry and should not conflict with any production versions.
 */
export const E2E_PACKAGE_VERSION = '0.0.0-e2e';

/**
 * E2E test package name
 *
 * The npm package name for the workspace plugin being tested.
 */
export const E2E_PACKAGE_NAME = '@nxworker/workspace';

/**
 * E2E dist-tag
 *
 * The npm dist-tag used to mark the e2e test version in the registry.
 * This allows the e2e version to be distinguished from other versions.
 */
export const E2E_DIST_TAG = 'e2e';
