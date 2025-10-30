/**
 * Test harness utilities for e2e testing
 *
 * This module provides utilities for:
 * - Managing a local Verdaccio registry lifecycle
 * - Scaffolding minimal Nx workspaces with configurable libraries and applications
 * - Cleaning up temporary workspaces and cache
 *
 * @example Basic usage
 * ```ts
 * import { startRegistry, createWorkspace, cleanupWorkspace } from './harness';
 *
 * // Start the registry (reuses existing instance if already running)
 * const registry = await startRegistry({ portPreferred: 4873 });
 *
 * // Create a workspace with 3 libraries and an app
 * const workspace = await createWorkspace({
 *   libs: 3,
 *   includeApp: true
 * });
 *
 * // Install the plugin from the local registry
 * execSync(`npm install @nxworker/workspace@e2e`, {
 *   cwd: workspace.path
 * });
 *
 * // ... perform tests ...
 *
 * // Clean up
 * await cleanupWorkspace({ workspacePath: workspace.path });
 * registry.stop();
 * ```
 */

// Verdaccio controller
export {
  startRegistry,
  stopRegistry,
  isRegistryRunning,
  getRegistryPort,
  getRegistryUrl,
} from './verdaccio-controller';
export type {
  StartLocalRegistryOptions,
  RegistryInfo,
} from './verdaccio-controller';

// Workspace scaffold
export {
  createWorkspace,
  addSourceFile,
  getProjectImportAlias,
} from './workspace-scaffold';
export type {
  CreateWorkspaceOptions,
  WorkspaceInfo,
  AddSourceFileOptions,
} from './workspace-scaffold';

// Cleanup utilities
export { cleanupWorkspace, clearNxCache, cleanupWorkspaces } from './cleanup';
export type { CleanupWorkspaceOptions, ClearNxCacheOptions } from './cleanup';
