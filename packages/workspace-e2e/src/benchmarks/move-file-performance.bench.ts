import { benchmarkSuite } from '../../../../tools/tinybench-utils';
import { uniqueId } from 'lodash';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * E2E performance benchmarks for the move-file generator.
 * These tests measure end-to-end execution time with realistic workspace scenarios.
 */

let projectDirectory: string;
let benchmarkLib1: string;
let benchmarkLib2: string;
let currentFileName: string;
let currentBatchId: string;

benchmarkSuite(
  'Move-File E2E Performance',
  {
    'Small file move (< 1KB)': {
      fn: () => {
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${benchmarkLib1}/src/lib/${currentFileName} --project ${benchmarkLib2} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );
      },
      setup() {
        currentFileName = `small-file-${uniqueId()}.ts`;
        const filePath = join(
          projectDirectory,
          benchmarkLib1,
          'src',
          'lib',
          currentFileName,
        );
        writeFileSync(
          filePath,
          'export function smallFunction() { return "small"; }\n',
        );
      },
    },

    'Medium file move (~10KB)': {
      fn: () => {
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${benchmarkLib1}/src/lib/${currentFileName} --project ${benchmarkLib2} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );
      },
      setup() {
        currentFileName = `medium-file-${uniqueId()}.ts`;
        const filePath = join(
          projectDirectory,
          benchmarkLib1,
          'src',
          'lib',
          currentFileName,
        );
        const content = generateLargeTypeScriptFile(200);
        writeFileSync(filePath, content);
      },
    },

    'Large file move (~50KB)': {
      fn: () => {
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${benchmarkLib1}/src/lib/${currentFileName} --project ${benchmarkLib2} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );
      },
      setup() {
        currentFileName = `large-file-${uniqueId()}.ts`;
        const filePath = join(
          projectDirectory,
          benchmarkLib1,
          'src',
          'lib',
          currentFileName,
        );
        const content = generateLargeTypeScriptFile(1000);
        writeFileSync(filePath, content);
      },
    },

    'Multiple small files (10 files)': {
      fn: () => {
        execSync(
          `npx nx generate @nxworker/workspace:move-file "${benchmarkLib1}/src/lib/multi-small-${currentBatchId}-*.ts" --project ${benchmarkLib2} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );
      },
      setup() {
        const fileCount = 10;
        currentBatchId = uniqueId();

        for (let i = 0; i < fileCount; i++) {
          const fileName = `multi-small-${currentBatchId}-${i}.ts`;
          writeFileSync(
            join(projectDirectory, benchmarkLib1, 'src', 'lib', fileName),
            `export function func${i}() { return ${i}; }\n`,
          );
        }
      },
    },

    'Comma-separated glob patterns (15 files)': {
      fn: () => {
        execSync(
          `npx nx generate @nxworker/workspace:move-file "${benchmarkLib1}/src/lib/api-${currentBatchId}-*.ts,${benchmarkLib1}/src/lib/service-${currentBatchId}-*.ts,${benchmarkLib1}/src/lib/util-${currentBatchId}-*.ts" --project ${benchmarkLib2} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );
      },
      setup() {
        currentBatchId = uniqueId();

        for (let i = 0; i < 5; i++) {
          writeFileSync(
            join(projectDirectory, benchmarkLib1, 'src', 'lib', `api-${currentBatchId}-${i}.ts`),
            `export function api${i}() { return 'api${i}'; }\n`,
          );
          writeFileSync(
            join(projectDirectory, benchmarkLib1, 'src', 'lib', `service-${currentBatchId}-${i}.ts`),
            `export function service${i}() { return 'service${i}'; }\n`,
          );
          writeFileSync(
            join(projectDirectory, benchmarkLib1, 'src', 'lib', `util-${currentBatchId}-${i}.ts`),
            `export function util${i}() { return 'util${i}'; }\n`,
          );
        }
      },
    },

    'File with many imports (20 consumers)': {
      fn: () => {
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${benchmarkLib1}/src/lib/${currentFileName} --project ${benchmarkLib2} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );
      },
      setup() {
        currentBatchId = uniqueId();
        currentFileName = `source-with-imports-${currentBatchId}.ts`;
        const sourceFilePath = join(projectDirectory, benchmarkLib1, 'src', 'lib', currentFileName);
        
        writeFileSync(
          sourceFilePath,
          'export function source() { return "source"; }\n',
        );

        const indexPath = join(projectDirectory, benchmarkLib1, 'src', 'index.ts');
        const currentIndex = readFileSync(indexPath, 'utf-8');
        writeFileSync(
          indexPath,
          currentIndex + `export * from './lib/${currentFileName.replace('.ts', '')}';\n`,
        );

        const lib1Alias = getProjectImportAlias(projectDirectory, benchmarkLib1);
        const consumerCount = 20;

        for (let i = 0; i < consumerCount; i++) {
          const consumerFile = `consumer-${currentBatchId}-${i}.ts`;
          writeFileSync(
            join(projectDirectory, benchmarkLib1, 'src', 'lib', consumerFile),
            `import { source } from '${lib1Alias}';\nexport const value${i} = source();\n`,
          );
        }
      },
    },

    'Early exit optimization (50 irrelevant files)': {
      fn: () => {
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${benchmarkLib1}/src/lib/${currentFileName} --project ${benchmarkLib2} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );
      },
      setup() {
        currentBatchId = uniqueId();
        currentFileName = `source-for-update-${currentBatchId}.ts`;
        
        writeFileSync(
          join(projectDirectory, benchmarkLib1, 'src', 'lib', currentFileName),
          'export function sourceForUpdate() { return "update"; }\n',
        );

        const irrelevantFileCount = 50;
        for (let i = 0; i < irrelevantFileCount; i++) {
          const fileName = `irrelevant-${currentBatchId}-${i}.ts`;
          writeFileSync(
            join(projectDirectory, benchmarkLib1, 'src', 'lib', fileName),
            `// This file doesn't import the source\nexport function irrelevant${i}() { return ${i}; }\n`,
          );
        }

        const lib1Alias = getProjectImportAlias(projectDirectory, benchmarkLib1);
        const indexPath = join(projectDirectory, benchmarkLib1, 'src', 'index.ts');
        const currentIndex = readFileSync(indexPath, 'utf-8');
        writeFileSync(
          indexPath,
          currentIndex + `export * from './lib/${currentFileName.replace('.ts', '')}';\n`,
        );

        const consumerPath = join(
          projectDirectory,
          benchmarkLib1,
          'src',
          'lib',
          `actual-consumer-${currentBatchId}.ts`,
        );
        writeFileSync(
          consumerPath,
          `import { sourceForUpdate } from '${lib1Alias}';\nexport const value = sourceForUpdate();\n`,
        );
      },
    },
  },
  {
    async setupSuite() {
      projectDirectory = await createTestProject();
      benchmarkLib1 = uniqueId('bench-lib1-');
      benchmarkLib2 = uniqueId('bench-lib2-');

      execSync(`npm install @nxworker/workspace@e2e`, {
        cwd: projectDirectory,
        stdio: 'inherit',
        env: process.env,
      });

      execSync(
        `npx nx generate @nx/js:library ${benchmarkLib1} --unitTestRunner=none --bundler=none --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      execSync(
        `npx nx generate @nx/js:library ${benchmarkLib2} --unitTestRunner=none --bundler=none --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );
    },
    setupSuiteTimeout: 300000,
    async teardownSuite() {
      if (projectDirectory) {
        await cleanupProject(projectDirectory);
      }
    },
    teardownSuiteTimeout: 60000,
    time: 30000,
    iterations: 10,
  },
);

// ==================== Helper Functions ====================

function getProjectImportAlias(
  projectDir: string,
  projectName: string,
): string {
  const tsconfigPath = join(projectDir, 'tsconfig.base.json');
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));
  const paths = tsconfig?.compilerOptions?.paths ?? {};

  for (const [alias, value] of Object.entries(paths)) {
    const pathEntries = Array.isArray(value) ? value : [value];
    if (
      pathEntries.some((entry) =>
        entry.replace(/\\/g, '/').includes(`${projectName}/src/index`),
      )
    ) {
      return alias;
    }
  }

  throw new Error(
    `Could not determine import alias for project "${projectName}"`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateLargeTypeScriptFile(lines: number): string {
  const header = '// Large auto-generated TypeScript file\n\n';
  const functions = Array.from(
    { length: lines },
    (_, i) => `export function func${i}() {\n  return ${i};\n}\n`,
  ).join('\n');
  return header + functions;
}

async function createTestProject(): Promise<string> {
  const projectName = `e2e-benchmark-${uniqueId()}`;
  const projectDirectory = join(process.cwd(), 'tmp', projectName);

  await cleanupProject(projectDirectory);
  mkdirSync(dirname(projectDirectory), { recursive: true });

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
    `npx --yes create-nx-workspace@${workspaceNxVersion} ${projectName} --preset apps --nxCloud=skip --no-interactive`,
    {
      cwd: dirname(projectDirectory),
      stdio: 'inherit',
      env: process.env,
    },
  );

  return projectDirectory;
}

async function cleanupProject(projectDirectory: string): Promise<void> {
  if (!projectDirectory) {
    return;
  }

  let attempts = 0;
  const maxAttempts = 5;
  const delay = 200;

  while (attempts < maxAttempts) {
    try {
      rmSync(projectDirectory, { recursive: true, force: true });
      break;
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err.code === 'EBUSY' || err.code === 'ENOTEMPTY')
      ) {
        attempts++;
        await sleep(delay);
      } else if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        err.code === 'ENOENT'
      ) {
        break;
      } else {
        throw err;
      }
    }
  }
}
