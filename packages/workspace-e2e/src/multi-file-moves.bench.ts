import { benchmarkSuite } from 'jest-bench';
import { execSync } from 'node:child_process';
import {
  initializeBenchmarkProject,
  setupMultiSmallFilesScenario,
  setupCommaSeparatedGlobsScenario,
  projectDirectory,
  benchmarkLib2,
  testFiles,
  createSuiteOptions,
} from './benchmark-setup';

/**
 * Benchmarks for moving multiple files using glob patterns.
 * Tests generator performance with wildcards and comma-separated patterns.
 */

describe('Multi-file move benchmarks', () => {
  beforeAll(async () => {
    await initializeBenchmarkProject();
    setupMultiSmallFilesScenario();
    setupCommaSeparatedGlobsScenario();
  }, 600000); // 10 minutes for setup

  benchmarkSuite(
    'Move 10 small files',
    {
      ['Move 10 small files with glob']() {
        const scenario = testFiles.multiSmallFiles;
        if (!scenario) throw new Error('Multi-small files scenario not set up');

        // Note: For glob patterns, we can't easily reset individual files,
        // but since we're using unique IDs in file names, each run is independent
        execSync(
          `npx nx generate @nxworker/workspace:move-file "${scenario.lib}/src/lib/${scenario.pattern}" --project ${benchmarkLib2} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe',
          },
        );
      },
    },
    createSuiteOptions(480),
  );

  benchmarkSuite(
    'Move files with comma-separated glob (15 files)',
    {
      ['Move 15 files with comma-separated globs']() {
        const scenario = testFiles.commaSeparatedGlobs;
        if (!scenario)
          throw new Error('Comma-separated globs scenario not set up');

        // Pattern already includes full paths for each group
        execSync(
          `npx nx generate @nxworker/workspace:move-file "${scenario.pattern}" --project ${benchmarkLib2} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe',
          },
        );
      },
    },
    createSuiteOptions(480),
  );
});
