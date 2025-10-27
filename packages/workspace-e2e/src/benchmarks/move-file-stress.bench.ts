import { benchmarkSuite } from '../../../../tools/tinybench-utils';
import { uniqueId } from '../test-utils';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * E2E stress test benchmarks for the move-file generator.
 * These tests validate performance with large workspaces and complex dependency graphs.
 */

function generateUtilityModule(name: string, lines: number): string {
  const content: string[] = [`export const ${name}Functions = {`];
  for (let i = 0; i < lines; i++) {
    content.push(`  func${i}: () => ${i},`);
  }
  content.push('};\n');
  return content.join('\n');
}

function getProjectImportAlias(workspaceDir: string, projectName: string): string {
  const projectJsonPath = join(workspaceDir, projectName, 'project.json');
  const projectJson = JSON.parse(readFileSync(projectJsonPath, 'utf-8'));
  return projectJson.name || `@${dirname(workspaceDir)}/${projectName}`;
}

async function createTestProject(): Promise<string> {
  const projectName = uniqueId('stress-test-');
  const tempDir = join(dirname(__dirname), '..', '..', 'tmp');
  mkdirSync(tempDir, { recursive: true });
  const projectDirectory = join(tempDir, projectName);

  // Use workspace Nx version
  const rootPackageJsonPath = join(process.cwd(), 'package.json');
  const rootPackageJson = JSON.parse(
    readFileSync(rootPackageJsonPath, 'utf-8'),
  );
  const workspaceNxVersion =
    rootPackageJson.devDependencies?.nx || rootPackageJson.dependencies?.nx;
  if (!workspaceNxVersion) {
    throw new Error('Could not determine workspace Nx version');
  }

  execSync(
    `npx --yes create-nx-workspace@${workspaceNxVersion} ${projectName} --preset=ts --workspaceType=integrated --packageManager=npm --nx-cloud=skip --no-interactive`,
    {
      cwd: tempDir,
      stdio: 'pipe',
    },
  );

  return projectDirectory;
}

benchmarkSuite(
  'Move-File E2E Stress Tests',
  {
    'Cross-project move (10 projects with dependencies)': {
      fn: (context) => {
        const utilityFile = 'shared-utility.ts';
        const projectCount = context.crossProjectLibs.length;
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${context.crossProjectLibs[0]}/src/lib/${utilityFile} --project ${context.crossProjectLibs[projectCount - 1]} --no-interactive`,
          {
            cwd: context.projectDirectory,
            stdio: 'inherit',
          },
        );
      },
      fnOptions: {
        beforeAll(context) {
          const projectCount = 10;
          context.crossProjectLibs = [];
          const batchId = uniqueId();

          for (let i = 0; i < projectCount; i++) {
            const libName = `stress-lib${i}-${batchId}`;
            context.crossProjectLibs.push(libName);

            execSync(
              `npx nx generate @nx/js:library ${libName} --unitTestRunner=none --bundler=none --no-interactive`,
              {
                cwd: context.projectDirectory,
                stdio: 'pipe',
              },
            );
          }

          const utilityFile = 'shared-utility.ts';
          const utilityPath = join(
            context.projectDirectory,
            context.crossProjectLibs[0],
            'src',
            'lib',
            utilityFile,
          );
          writeFileSync(utilityPath, generateUtilityModule('sharedUtil', 50));

          const sourceIndexPath = join(
            context.projectDirectory,
            context.crossProjectLibs[0],
            'src',
            'index.ts',
          );
          writeFileSync(
            sourceIndexPath,
            `export * from './lib/${utilityFile.replace('.ts', '')}';\n`,
          );

          const lib0Alias = getProjectImportAlias(
            context.projectDirectory,
            context.crossProjectLibs[0],
          );

          // Create dependency chain
          for (let i = 1; i < projectCount; i++) {
            const libIndexPath = join(
              context.projectDirectory,
              context.crossProjectLibs[i],
              'src',
              'index.ts',
            );
            writeFileSync(
              libIndexPath,
              `import { sharedUtilFunctions } from '${lib0Alias}';\nexport function lib${i}Consumer() { return sharedUtilFunctions.func0(); }\n`,
            );
          }
        },
        afterEach(context) {
          const utilityFile = 'shared-utility.ts';
          const projectCount = context.crossProjectLibs.length;
          execSync(
            `npx nx generate @nxworker/workspace:move-file ${context.crossProjectLibs[projectCount - 1]}/src/lib/${utilityFile} --project ${context.crossProjectLibs[0]} --no-interactive`,
            {
              cwd: context.projectDirectory,
              stdio: 'pipe',
            },
          );
        },
      },
    },

    'Many large files (100 files, 10KB each)': {
      fn: (context) => {
        const targetFile = 'large-module.ts';
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${context.manyFilesSourceLib}/src/lib/${targetFile} --project ${context.manyFilesTargetLib} --no-interactive`,
          {
            cwd: context.projectDirectory,
            stdio: 'inherit',
          },
        );
      },
      fnOptions: {
        beforeAll(context) {
          const batchId = uniqueId();
          context.manyFilesSourceLib = `stress-source-${batchId}`;
          context.manyFilesTargetLib = `stress-target-${batchId}`;

          execSync(
            `npx nx generate @nx/js:library ${context.manyFilesSourceLib} --unitTestRunner=none --bundler=none --no-interactive`,
            {
              cwd: context.projectDirectory,
              stdio: 'pipe',
            },
          );

          execSync(
            `npx nx generate @nx/js:library ${context.manyFilesTargetLib} --unitTestRunner=none --bundler=none --no-interactive`,
            {
              cwd: context.projectDirectory,
              stdio: 'pipe',
            },
          );

          // Create 100 large files
          for (let i = 0; i < 100; i++) {
            const filePath = join(
              context.projectDirectory,
              context.manyFilesSourceLib,
              'src',
              'lib',
              `file-${i}.ts`,
            );
            writeFileSync(filePath, generateUtilityModule(`module${i}`, 200));
          }

          // Create the target file to move
          const targetFilePath = join(
            context.projectDirectory,
            context.manyFilesSourceLib,
            'src',
            'lib',
            'large-module.ts',
          );
          writeFileSync(targetFilePath, generateUtilityModule('largeModule', 200));
        },
        afterEach(context) {
          const targetFile = 'large-module.ts';
          execSync(
            `npx nx generate @nxworker/workspace:move-file ${context.manyFilesTargetLib}/src/lib/${targetFile} --project ${context.manyFilesSourceLib} --no-interactive`,
            {
              cwd: context.projectDirectory,
              stdio: 'pipe',
            },
          );
        },
      },
    },

    'Many intra-project dependencies (50 relative imports)': {
      fn: (context) => {
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${context.relativeImportsLib}/src/lib/utils/${context.relativeImportsUtilFile} --project ${context.relativeImportsLib} --project-directory=helpers --no-interactive`,
          {
            cwd: context.projectDirectory,
            stdio: 'inherit',
          },
        );
      },
      fnOptions: {
        beforeAll(context) {
          const batchId = uniqueId();
          context.relativeImportsLib = `stress-relative-${batchId}`;
          context.relativeImportsUtilFile = 'deep-util.ts';

          execSync(
            `npx nx generate @nx/js:library ${context.relativeImportsLib} --unitTestRunner=none --bundler=none --no-interactive`,
            {
              cwd: context.projectDirectory,
              stdio: 'pipe',
            },
          );

          // Create utils directory
          const utilsDir = join(
            context.projectDirectory,
            context.relativeImportsLib,
            'src',
            'lib',
            'utils',
          );
          mkdirSync(utilsDir, { recursive: true });

          // Create the utility file
          const utilFilePath = join(utilsDir, context.relativeImportsUtilFile);
          writeFileSync(utilFilePath, generateUtilityModule('deepUtil', 10));

          // Create 50 consumer files with relative imports
          for (let i = 0; i < 50; i++) {
            const consumerPath = join(
              context.projectDirectory,
              context.relativeImportsLib,
              'src',
              'lib',
              `consumer-${i}.ts`,
            );
            writeFileSync(
              consumerPath,
              `import { deepUtilFunctions } from './utils/${context.relativeImportsUtilFile.replace('.ts', '')}';\nexport function consumer${i}() { return deepUtilFunctions.func0(); }\n`,
            );
          }
        },
        afterEach(context) {
          execSync(
            `npx nx generate @nxworker/workspace:move-file ${context.relativeImportsLib}/src/lib/helpers/${context.relativeImportsUtilFile} --project ${context.relativeImportsLib} --project-directory=utils --no-interactive`,
            {
              cwd: context.projectDirectory,
              stdio: 'pipe',
            },
          );
        },
      },
    },

    'Combined stress (15 projects, 30 files each = 450 total files)': {
      fn: (context) => {
        const coreFile = 'core-api.ts';
        const projectCount = context.combinedStressLibs.length;
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${context.combinedStressLibs[0]}/src/lib/${coreFile} --project ${context.combinedStressLibs[projectCount - 1]} --no-interactive`,
          {
            cwd: context.projectDirectory,
            stdio: 'inherit',
          },
        );
      },
      fnOptions: {
        beforeAll(context) {
          const projectCount = 15;
          const filesPerProject = 30;
          context.combinedStressLibs = [];
          const batchId = uniqueId();

          for (let i = 0; i < projectCount; i++) {
            const libName = `mega-lib${i}-${batchId}`;
            context.combinedStressLibs.push(libName);

            execSync(
              `npx nx generate @nx/js:library ${libName} --unitTestRunner=none --bundler=none --no-interactive`,
              {
                cwd: context.projectDirectory,
                stdio: 'pipe',
              },
            );

            // Create 30 files in each project
            for (let j = 0; j < filesPerProject; j++) {
              const filePath = join(
                context.projectDirectory,
                libName,
                'src',
                'lib',
                `module-${j}.ts`,
              );
              writeFileSync(filePath, generateUtilityModule(`module${i}_${j}`, 50));
            }
          }

          // Create the core file to move
          const coreFilePath = join(
            context.projectDirectory,
            context.combinedStressLibs[0],
            'src',
            'lib',
            'core-api.ts',
          );
          writeFileSync(coreFilePath, generateUtilityModule('coreApi', 100));

          const coreIndexPath = join(
            context.projectDirectory,
            context.combinedStressLibs[0],
            'src',
            'index.ts',
          );
          writeFileSync(coreIndexPath, `export * from './lib/core-api';\n`);

          const lib0Alias = getProjectImportAlias(
            context.projectDirectory,
            context.combinedStressLibs[0],
          );

          // Create imports in other projects
          for (let i = 1; i < projectCount; i++) {
            const libIndexPath = join(
              context.projectDirectory,
              context.combinedStressLibs[i],
              'src',
              'index.ts',
            );
            writeFileSync(
              libIndexPath,
              `import { coreApiFunctions } from '${lib0Alias}';\nexport function megaLib${i}() { return coreApiFunctions.func0(); }\n`,
            );
          }
        },
        afterEach(context) {
          const coreFile = 'core-api.ts';
          const projectCount = context.combinedStressLibs.length;
          execSync(
            `npx nx generate @nxworker/workspace:move-file ${context.combinedStressLibs[projectCount - 1]}/src/lib/${coreFile} --project ${context.combinedStressLibs[0]} --no-interactive`,
            {
              cwd: context.projectDirectory,
              stdio: 'pipe',
            },
          );
        },
      },
    },
  },
  {
    async setupSuite() {
      const context: Record<string, unknown> = {};
      context.projectDirectory = await createTestProject();

      execSync(`npm install @nxworker/workspace@e2e`, {
        cwd: context.projectDirectory as string,
        stdio: 'inherit',
        env: process.env,
      });

      return context;
    },
    teardownSuite() {
      const context = this as unknown as Record<string, unknown>;
      if (context.projectDirectory) {
        rmSync(context.projectDirectory as string, {
          recursive: true,
          force: true,
        });
      }
    },
    teardownSuiteTimeout: 60_000,
    iterations: 10,
    time: 60_000,
  },
);
