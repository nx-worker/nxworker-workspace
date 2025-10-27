import { benchmarkSuite } from '../../../../tools/tinybench-utils';
import { uniqueId } from '../test-utils';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * E2E performance benchmarks for the move-file generator.
 * These tests measure end-to-end execution time with realistic workspace scenarios.
 */

function generateLargeTypeScriptFile(lines: number): string {
  const content: string[] = [];
  for (let i = 0; i < lines; i++) {
    content.push(`export function func${i}() { return ${i}; }`);
  }
  return content.join('\n') + '\n';
}

async function createTestProject(): Promise<string> {
  const projectName = uniqueId('perf-test-');
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
  'Move-File E2E Performance',
  {
    'Small file move (< 1KB)': {
      fn: (context) => {
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${context.benchmarkLib1}/src/lib/${context.smallFileName} --project ${context.benchmarkLib2} --no-interactive`,
          {
            cwd: context.projectDirectory,
            stdio: 'inherit',
          },
        );
      },
      fnOptions: {
        beforeAll(context) {
          context.smallFileName = `small-file-${uniqueId()}.ts`;
          writeFileSync(
            join(
              context.projectDirectory,
              context.benchmarkLib1,
              'src',
              'lib',
              context.smallFileName,
            ),
            'export function smallFunction() { return "small"; }\n',
          );
        },
        afterEach(context) {
          execSync(
            `npx nx generate @nxworker/workspace:move-file ${context.benchmarkLib2}/src/lib/${context.smallFileName} --project ${context.benchmarkLib1} --no-interactive`,
            {
              cwd: context.projectDirectory,
              stdio: 'pipe',
            },
          );
        },
      },
    },

    'Medium file move (~10KB)': {
      fn: (context) => {
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${context.benchmarkLib1}/src/lib/${context.mediumFileName} --project ${context.benchmarkLib2} --no-interactive`,
          {
            cwd: context.projectDirectory,
            stdio: 'inherit',
          },
        );
      },
      fnOptions: {
        beforeAll(context) {
          context.mediumFileName = `medium-file-${uniqueId()}.ts`;
          writeFileSync(
            join(
              context.projectDirectory,
              context.benchmarkLib1,
              'src',
              'lib',
              context.mediumFileName,
            ),
            generateLargeTypeScriptFile(200),
          );
        },
        afterEach(context) {
          execSync(
            `npx nx generate @nxworker/workspace:move-file ${context.benchmarkLib2}/src/lib/${context.mediumFileName} --project ${context.benchmarkLib1} --no-interactive`,
            {
              cwd: context.projectDirectory,
              stdio: 'pipe',
            },
          );
        },
      },
    },

    'Large file move (~50KB)': {
      fn: (context) => {
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${context.benchmarkLib1}/src/lib/${context.largeFileName} --project ${context.benchmarkLib2} --no-interactive`,
          {
            cwd: context.projectDirectory,
            stdio: 'inherit',
          },
        );
      },
      fnOptions: {
        beforeAll(context) {
          context.largeFileName = `large-file-${uniqueId()}.ts`;
          writeFileSync(
            join(
              context.projectDirectory,
              context.benchmarkLib1,
              'src',
              'lib',
              context.largeFileName,
            ),
            generateLargeTypeScriptFile(1000),
          );
        },
        afterEach(context) {
          execSync(
            `npx nx generate @nxworker/workspace:move-file ${context.benchmarkLib2}/src/lib/${context.largeFileName} --project ${context.benchmarkLib1} --no-interactive`,
            {
              cwd: context.projectDirectory,
              stdio: 'pipe',
            },
          );
        },
      },
    },

    'Multiple small files (10 files)': {
      fn: (context) => {
        execSync(
          `npx nx generate @nxworker/workspace:move-file "${context.benchmarkLib1}/src/lib/multi-small-${context.batchId}-*.ts" --project ${context.benchmarkLib2} --no-interactive`,
          {
            cwd: context.projectDirectory,
            stdio: 'inherit',
          },
        );
      },
      fnOptions: {
        beforeAll(context) {
          context.batchId = uniqueId();
          for (let i = 0; i < 10; i++) {
            const fileName = `multi-small-${context.batchId}-${i}.ts`;
            writeFileSync(
              join(
                context.projectDirectory,
                context.benchmarkLib1,
                'src',
                'lib',
                fileName,
              ),
              `export function func${i}() { return ${i}; }\n`,
            );
          }
        },
        afterEach(context) {
          execSync(
            `npx nx generate @nxworker/workspace:move-file "${context.benchmarkLib2}/src/lib/multi-small-${context.batchId}-*.ts" --project ${context.benchmarkLib1} --no-interactive`,
            {
              cwd: context.projectDirectory,
              stdio: 'pipe',
            },
          );
        },
      },
    },

    'Comma-separated glob patterns (15 files)': {
      fn: (context) => {
        execSync(
          `npx nx generate @nxworker/workspace:move-file "${context.benchmarkLib1}/src/lib/api-${context.batchId}-*.ts,${context.benchmarkLib1}/src/lib/service-${context.batchId}-*.ts,${context.benchmarkLib1}/src/lib/util-${context.batchId}-*.ts" --project ${context.benchmarkLib2} --no-interactive`,
          {
            cwd: context.projectDirectory,
            stdio: 'inherit',
          },
        );
      },
      fnOptions: {
        beforeAll(context) {
          context.batchId = uniqueId();
          for (let i = 0; i < 5; i++) {
            writeFileSync(
              join(
                context.projectDirectory,
                context.benchmarkLib1,
                'src',
                'lib',
                `api-${context.batchId}-${i}.ts`,
              ),
              `export function api${i}() { return 'api${i}'; }\n`,
            );
            writeFileSync(
              join(
                context.projectDirectory,
                context.benchmarkLib1,
                'src',
                'lib',
                `service-${context.batchId}-${i}.ts`,
              ),
              `export function service${i}() { return 'service${i}'; }\n`,
            );
            writeFileSync(
              join(
                context.projectDirectory,
                context.benchmarkLib1,
                'src',
                'lib',
                `util-${context.batchId}-${i}.ts`,
              ),
              `export function util${i}() { return 'util${i}'; }\n`,
            );
          }
        },
        afterEach(context) {
          execSync(
            `npx nx generate @nxworker/workspace:move-file "${context.benchmarkLib2}/src/lib/api-${context.batchId}-*.ts,${context.benchmarkLib2}/src/lib/service-${context.batchId}-*.ts,${context.benchmarkLib2}/src/lib/util-${context.batchId}-*.ts" --project ${context.benchmarkLib1} --no-interactive`,
            {
              cwd: context.projectDirectory,
              stdio: 'pipe',
            },
          );
        },
      },
    },

    'File with many imports (20 consumers)': {
      fn: (context) => {
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${context.benchmarkLib1}/src/lib/${context.manyImportsFileName} --project ${context.benchmarkLib2} --no-interactive`,
          {
            cwd: context.projectDirectory,
            stdio: 'inherit',
          },
        );
      },
      fnOptions: {
        beforeAll(context) {
          context.batchId = uniqueId();
          context.manyImportsFileName = `source-with-imports-${context.batchId}.ts`;
          const sourceFilePath = join(
            context.projectDirectory,
            context.benchmarkLib1,
            'src',
            'lib',
            context.manyImportsFileName,
          );
          writeFileSync(
            sourceFilePath,
            'export function sourceForUpdate() { return "source"; }\n',
          );

          // Create 20 consumer files
          for (let i = 0; i < 20; i++) {
            const consumerPath = join(
              context.projectDirectory,
              context.benchmarkLib1,
              'src',
              'lib',
              `consumer-${context.batchId}-${i}.ts`,
            );
            writeFileSync(
              consumerPath,
              `import { sourceForUpdate } from './${context.manyImportsFileName.replace('.ts', '')}';\nexport function consumer${i}() { return sourceForUpdate(); }\n`,
            );
          }
        },
        afterEach(context) {
          execSync(
            `npx nx generate @nxworker/workspace:move-file ${context.benchmarkLib2}/src/lib/${context.manyImportsFileName} --project ${context.benchmarkLib1} --no-interactive`,
            {
              cwd: context.projectDirectory,
              stdio: 'pipe',
            },
          );
        },
      },
    },

    'Early exit optimization (50 irrelevant files)': {
      fn: (context) => {
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${context.benchmarkLib1}/src/lib/${context.earlyExitFileName} --project ${context.benchmarkLib2} --no-interactive`,
          {
            cwd: context.projectDirectory,
            stdio: 'inherit',
          },
        );
      },
      fnOptions: {
        beforeAll(context) {
          context.batchId = uniqueId();
          context.earlyExitFileName = `target-early-exit-${context.batchId}.ts`;
          const targetFilePath = join(
            context.projectDirectory,
            context.benchmarkLib1,
            'src',
            'lib',
            context.earlyExitFileName,
          );
          writeFileSync(
            targetFilePath,
            'export function targetFunction() { return "target"; }\n',
          );

          // Create 50 irrelevant files
          for (let i = 0; i < 50; i++) {
            const irrelevantPath = join(
              context.projectDirectory,
              context.benchmarkLib1,
              'src',
              'lib',
              `irrelevant-${context.batchId}-${i}.ts`,
            );
            writeFileSync(
              irrelevantPath,
              `export function irrelevant${i}() { return ${i}; }\n`,
            );
          }
        },
        afterEach(context) {
          execSync(
            `npx nx generate @nxworker/workspace:move-file ${context.benchmarkLib2}/src/lib/${context.earlyExitFileName} --project ${context.benchmarkLib1} --no-interactive`,
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
      context.benchmarkLib1 = uniqueId('bench-lib1-');
      context.benchmarkLib2 = uniqueId('bench-lib2-');

      execSync(`npm install @nxworker/workspace@e2e`, {
        cwd: context.projectDirectory as string,
        stdio: 'inherit',
        env: process.env,
      });

      execSync(
        `npx nx generate @nx/js:library ${context.benchmarkLib1} --unitTestRunner=none --bundler=none --no-interactive`,
        {
          cwd: context.projectDirectory as string,
          stdio: 'inherit',
        },
      );

      execSync(
        `npx nx generate @nx/js:library ${context.benchmarkLib2} --unitTestRunner=none --bundler=none --no-interactive`,
        {
          cwd: context.projectDirectory as string,
          stdio: 'inherit',
        },
      );

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
    time: 30_000,
  },
);
