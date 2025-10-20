import { execSync } from 'node:child_process';
import { benchmarkSuite } from 'jest-bench';
import {
  initializeBenchmarkProject,
  setupFileWithImportersScenario,
  setupEarlyExitOptimizationScenario,
  projectDirectory,
  benchmarkLib1,
  benchmarkLib2,
  testFiles,
  complexBenchmarkOptions,
  resetFileLocation,
} from './benchmark-setup';

/**
 * Benchmarks for cross-project move operations.
 * Tests generator performance when moving files between projects.
 */

describe('Cross-project move benchmarks', () => {
  beforeAll(async () => {
    await initializeBenchmarkProject();
    setupFileWithImportersScenario();
    setupEarlyExitOptimizationScenario();
  }, 600000); // 10 minutes for setup

  benchmarkSuite(
    'Move file with 20 importing files',
    {
      ['Move file with 20 importing files']() {
        const scenario = testFiles.fileWithImporters;
        if (!scenario)
          throw new Error('File with importers scenario not set up');

        // Reset file location before each benchmark iteration
        resetFileLocation(benchmarkLib1, benchmarkLib2, scenario.fileName);

        execSync(
          `npx nx generate @nxworker/workspace:move-file ${scenario.lib}/src/lib/${scenario.fileName} --project ${benchmarkLib2} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe',
          },
        );
      },
    },
    complexBenchmarkOptions,
  );

  benchmarkSuite(
    'Update imports with early exit optimization',
    {
      ['Update imports in 50 files (early exit)']() {
        const scenario = testFiles.earlyExitOptimization;
        if (!scenario)
          throw new Error('Early exit optimization scenario not set up');

        // Reset file location before each benchmark iteration
        resetFileLocation(benchmarkLib1, benchmarkLib2, scenario.fileName);

        execSync(
          `npx nx generate @nxworker/workspace:move-file ${scenario.lib}/src/lib/${scenario.fileName} --project ${benchmarkLib2} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe',
          },
        );
      },
    },
    complexBenchmarkOptions,
  );
});
