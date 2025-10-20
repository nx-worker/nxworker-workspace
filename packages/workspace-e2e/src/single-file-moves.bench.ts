import { benchmarkSuite } from 'jest-bench';
import { execSync } from 'node:child_process';
import {
  initializeBenchmarkProject,
  setupSmallFileScenario,
  setupMediumFileScenario,
  setupLargeFileScenario,
  projectDirectory,
  benchmarkLib2,
  testFiles,
  simpleBenchmarkOptions,
  iterationCounters,
} from './benchmark-setup';

/**
 * Benchmarks for moving single files of various sizes.
 * Tests generator performance on small, medium, and large TypeScript files.
 */

describe('Single file move benchmarks', () => {
  beforeAll(async () => {
    await initializeBenchmarkProject();
    setupSmallFileScenario();
    setupMediumFileScenario();
    setupLargeFileScenario();
  }, 600000); // 10 minutes for setup

  benchmarkSuite(
    'Move small file',
    {
      ['Small file move']() {
        const scenario = testFiles.smallFiles;
        if (!scenario) throw new Error('Small files scenario not set up');

        // Use next pre-created file (no reset needed!)
        const fileName =
          scenario.fileNames[
            iterationCounters.smallFile % scenario.fileNames.length
          ];
        iterationCounters.smallFile++;

        execSync(
          `npx nx generate @nxworker/workspace:move-file ${scenario.lib}/src/lib/${fileName} --project ${benchmarkLib2} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe',
          },
        );
      },
    },
    simpleBenchmarkOptions,
  );

  benchmarkSuite(
    'Move medium file (~200 functions)',
    {
      ['Medium file move']() {
        const scenario = testFiles.mediumFiles;
        if (!scenario) throw new Error('Medium files scenario not set up');

        // Use next pre-created file (no reset needed!)
        const fileName =
          scenario.fileNames[
            iterationCounters.mediumFile % scenario.fileNames.length
          ];
        iterationCounters.mediumFile++;

        execSync(
          `npx nx generate @nxworker/workspace:move-file ${scenario.lib}/src/lib/${fileName} --project ${benchmarkLib2} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe',
          },
        );
      },
    },
    simpleBenchmarkOptions,
  );

  benchmarkSuite(
    'Move large file (~1000 functions)',
    {
      ['Large file move']() {
        const scenario = testFiles.largeFiles;
        if (!scenario) throw new Error('Large files scenario not set up');

        // Use next pre-created file (no reset needed!)
        const fileName =
          scenario.fileNames[
            iterationCounters.largeFile % scenario.fileNames.length
          ];
        iterationCounters.largeFile++;

        execSync(
          `npx nx generate @nxworker/workspace:move-file ${scenario.lib}/src/lib/${fileName} --project ${benchmarkLib2} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe',
          },
        );
      },
    },
    simpleBenchmarkOptions,
  );
});
