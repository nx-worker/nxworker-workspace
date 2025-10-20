import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { benchmarkSuite } from 'jest-bench';
import {
  projectDirectory,
  lib,
  benchmarkLib2,
  testFiles,
  iterationCounters,
  resetFileLocation,
  isCI,
  isPullRequest,
  ciSimpleTimeout,
  ciComplexTimeout,
  ciSimpleMaxTime,
  ciComplexMaxTime,
  ciSamples,
} from './benchmark-setup';

describe('Cross-project move benchmarks', () => {
  const simpleOptions = isCI
    ? { minSamples: ciSamples, maxSamples: ciSamples, maxTime: ciSimpleMaxTime }
    : { minSamples: 3, maxSamples: 3, maxTime: 60 };

  const complexOptions = isCI
    ? { minSamples: ciSamples, maxSamples: ciSamples, maxTime: ciComplexMaxTime }
    : { minSamples: 3, maxSamples: 3, maxTime: 120 };

  const simpleTimeout = isCI ? ciSimpleTimeout : 300;
  const complexTimeout = isCI ? ciComplexTimeout : 480;

  benchmarkSuite(
    'Move file with importing files',
    {
      ['Move file with 20 importing files']() {
        const scenario = testFiles.withImportingFiles;
        if (!scenario)
          throw new Error('withImportingFiles scenario not initialized');

        // Reset file location before each run
        resetFileLocation(
          lib,
          benchmarkLib2,
          scenario.fileName,
          scenario.originalContent
        );

        execSync(
          `npx nx generate @nxworker/workspace:move-file "${lib}/src/lib/${scenario.fileName}" --project ${benchmarkLib2} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe',
          }
        );
      },
    },
    { timeoutSeconds: complexTimeout, ...complexOptions }
  );

  benchmarkSuite(
    'Update imports with early exit optimization',
    {
      ['Update imports in 50 files (early exit)']() {
        const scenario = testFiles.earlyExitOptimization;
        if (!scenario)
          throw new Error('earlyExitOptimization scenario not initialized');

        // Reset file location before each run
        resetFileLocation(
          lib,
          benchmarkLib2,
          scenario.fileName,
          scenario.originalContent
        );

        execSync(
          `npx nx generate @nxworker/workspace:move-file "${lib}/src/lib/${scenario.fileName}" --project ${benchmarkLib2} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe',
          }
        );
      },
    },
    { timeoutSeconds: complexTimeout, ...complexOptions }
  );
});
