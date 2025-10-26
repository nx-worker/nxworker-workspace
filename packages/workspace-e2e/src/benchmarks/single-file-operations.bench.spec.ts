import { benchmarkSuite } from '../../../../tools/tinybench-utils';
import { uniqueId } from 'lodash';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

/**
 * E2E benchmarks for single file move operations.
 * These benchmarks measure end-to-end performance of the move-file generator
 * with realistic file operations in a real Nx workspace.
 */

let projectDirectory: string;
let benchmarkLib1: string;
let benchmarkLib2: string;

benchmarkSuite(
  'E2E Single File Operations',
  {
    'Move small file between projects': () => {
      const fileName = `small-${uniqueId()}.ts`;
      const filePath = join(
        projectDirectory,
        benchmarkLib1,
        'src',
        'lib',
        fileName,
      );

      // Create small file
      writeFileSync(
        filePath,
        'export function smallFunction() { return "small"; }\n',
      );

      // Execute move operation
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${benchmarkLib1}/src/lib/${fileName} --project ${benchmarkLib2} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );

      // Cleanup for next iteration
      const movedPath = join(
        projectDirectory,
        benchmarkLib2,
        'src',
        'lib',
        fileName,
      );
      rmSync(movedPath, { force: true });
    },

    'Move medium file (10KB) between projects': () => {
      const fileName = `medium-${uniqueId()}.ts`;
      const filePath = join(
        projectDirectory,
        benchmarkLib1,
        'src',
        'lib',
        fileName,
      );

      // Create ~10KB file
      const content = Array.from(
        { length: 100 },
        (_, i) =>
          `export function mediumFunction${i}() { return "medium${i}"; }\n`,
      ).join('');
      writeFileSync(filePath, content);

      // Execute move operation
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${benchmarkLib1}/src/lib/${fileName} --project ${benchmarkLib2} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );

      // Cleanup for next iteration
      const movedPath = join(
        projectDirectory,
        benchmarkLib2,
        'src',
        'lib',
        fileName,
      );
      rmSync(movedPath, { force: true });
    },

    'Move file with relative imports': () => {
      const utilFileName = `util-${uniqueId()}.ts`;
      const consumerFileName = `consumer-${uniqueId()}.ts`;

      const utilPath = join(
        projectDirectory,
        benchmarkLib1,
        'src',
        'lib',
        utilFileName,
      );
      const consumerPath = join(
        projectDirectory,
        benchmarkLib1,
        'src',
        'lib',
        consumerFileName,
      );

      // Create utility file
      writeFileSync(utilPath, 'export function util() { return "utility"; }\n');

      // Create consumer file with relative import
      writeFileSync(
        consumerPath,
        `import { util } from './${utilFileName.replace('.ts', '')}';\nexport const value = util();\n`,
      );

      // Execute move operation
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${benchmarkLib1}/src/lib/${utilFileName} --project ${benchmarkLib1} --project-directory subdir --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );

      // Cleanup for next iteration
      const movedPath = join(
        projectDirectory,
        benchmarkLib1,
        'src',
        'lib',
        'subdir',
        utilFileName,
      );
      rmSync(movedPath, { force: true });
      rmSync(consumerPath, { force: true });
      // Remove subdir if empty
      try {
        rmSync(dirname(movedPath), { force: true });
      } catch {
        // Ignore if directory not empty
      }
    },
  },
  {
    setupSuite() {
      // Create test project and install plugin
      const projectName = `bench-project-${uniqueId()}`;
      projectDirectory = join(process.cwd(), 'tmp', projectName);

      // Clean directory if exists
      rmSync(projectDirectory, { recursive: true, force: true });
      mkdirSync(dirname(projectDirectory), { recursive: true });

      // Create workspace
      execSync(
        `npx --yes create-nx-workspace@latest ${projectName} --preset apps --nxCloud=skip --no-interactive`,
        {
          cwd: dirname(projectDirectory),
          stdio: 'pipe',
          env: process.env,
        },
      );

      // Install the plugin
      execSync(`npm install @nxworker/workspace@e2e --prefer-offline`, {
        cwd: projectDirectory,
        stdio: 'pipe',
        env: process.env,
      });

      // Create benchmark libraries
      benchmarkLib1 = `bench-lib1-${uniqueId()}`;
      benchmarkLib2 = `bench-lib2-${uniqueId()}`;

      execSync(
        `npx nx generate @nx/js:library ${benchmarkLib1} --unitTestRunner=none --bundler=none --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );

      execSync(
        `npx nx generate @nx/js:library ${benchmarkLib2} --unitTestRunner=none --bundler=none --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );
    },
    teardownSuite() {
      // Cleanup test project
      if (projectDirectory) {
        rmSync(projectDirectory, { recursive: true, force: true });
      }
    },
  },
);
