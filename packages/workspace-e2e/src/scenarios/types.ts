/**
 * Scenario Context Types
 *
 * Defines the context provided to scenario modules.
 */

import type { VerdaccioConfig, WorkspaceInfo } from '@internal/e2e-util';

/**
 * Context for infrastructure scenarios (REG-START, PUBLISH, INSTALL)
 *
 * Infrastructure scenarios test registry and publishing, not generator functionality.
 */
export interface InfrastructureScenarioContext {
  /**
   * Verdaccio configuration used for the test suite
   */
  verdaccioConfig: VerdaccioConfig;

  /**
   * URL of the local registry
   */
  registryUrl: string;
}

/**
 * Context for generator scenarios (MOVE-SMALL, APP-TO-LIB, etc.)
 *
 * Generator scenarios test move-file generator functionality in a workspace.
 */
export interface GeneratorScenarioContext
  extends InfrastructureScenarioContext {
  /**
   * Test workspace information
   */
  workspaceInfo: WorkspaceInfo;
}

/**
 * Union type for all scenario contexts
 */
export type ScenarioContext =
  | InfrastructureScenarioContext
  | GeneratorScenarioContext;
