import { benchmarkSuite } from '../../../../tools/tinybench-utils';
import { uniqueId } from '../test-utils';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * E2E stress test benchmarks for the move-file generator.
 * These tests validate performance with large workspaces and complex dependency graphs.
 */

let projectDirectory: string;
let crossProjectLibs: string[];
let manyFilesSourceLib: string;
let manyFilesTargetLib: string;
let relativeDepsLib: string;
let relativeDepsUtilFile: string;
let combinedStressLibs: string[];

benchmarkSuite(
  'Move-File E2E Stress Tests',
  {
    'Cross-project move (10 projects with dependencies)': {
      fn: () => {
        const utilityFile = 'shared-utility.ts';
        const projectCount = crossProjectLibs.length;
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${crossProjectLibs[0]}/src/lib/${utilityFile} --project ${crossProjectLibs[projectCount - 1]} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );
      },
      teardown() {
        // Move the file back to its original location for the next iteration
        const utilityFile = 'shared-utility.ts';
        const projectCount = crossProjectLibs.length;
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${crossProjectLibs[projectCount - 1]}/src/lib/${utilityFile} --project ${crossProjectLibs[0]} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe',
          },
        );
      },
    },

    'Many large files (100 files, 10KB each)': {
      fn: () => {
        const targetFile = 'large-module.ts';
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${manyFilesSourceLib}/src/lib/${targetFile} --project ${manyFilesTargetLib} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );
      },
      teardown() {
        // Move the file back to its original location for the next iteration
        const targetFile = 'large-module.ts';
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${manyFilesTargetLib}/src/lib/${targetFile} --project ${manyFilesSourceLib} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );
      },
    },

    'Many intra-project dependencies (50 relative imports)': {
      fn: () => {
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${relativeDepsLib}/src/lib/utils/${relativeDepsUtilFile} --project ${relativeDepsLib} --project-directory=helpers --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );
      },
      teardown() {
        // Move the file back to its original location for the next iteration
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${relativeDepsLib}/src/lib/helpers/${relativeDepsUtilFile} --project ${relativeDepsLib} --project-directory=utils --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );
      },
    },

    'Combined stress (15 projects, 30 files each = 450 total files)': {
      fn: () => {
        const coreFile = 'core-api.ts';
        const projectCount = combinedStressLibs.length;
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${combinedStressLibs[0]}/src/lib/${coreFile} --project ${combinedStressLibs[projectCount - 1]} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );
      },
      teardown() {
        // Move the file back to its original location for the next iteration
        const coreFile = 'core-api.ts';
        const projectCount = currentLibs.length;
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${currentLibs[projectCount - 1]}/src/lib/${coreFile} --project ${currentLibs[0]} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );
      },
    },
  },
  {
    async setupSuite() {
      projectDirectory = await createTestProject();

      execSync(`npm install @nxworker/workspace@e2e`, {
        cwd: projectDirectory,
        stdio: 'inherit',
        env: process.env,
      });

      const batchId = uniqueId();

      // Setup for Cross-project move benchmark (10 projects)
      crossProjectLibs = [];
      for (let i = 0; i < 10; i++) {
        const libName = `stress-lib${i}-${batchId}`;
        crossProjectLibs.push(libName);
        execSync(
          `npx nx generate @nx/js:library ${libName} --unitTestRunner=none --bundler=none --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe',
          },
        );
      }

      const utilityFile = 'shared-utility.ts';
      const utilityPath = join(projectDirectory, crossProjectLibs[0], 'src', 'lib', utilityFile);
      writeFileSync(utilityPath, 'export function sharedUtil() { return "util"; }\n');

      const utilityIndexPath = join(projectDirectory, crossProjectLibs[0], 'src', 'index.ts');
      writeFileSync(utilityIndexPath, `export * from './lib/${utilityFile.replace('.ts', '')}';\n`);

      const utilityAlias = getProjectImportAlias(projectDirectory, crossProjectLibs[0]);
      for (let i = 1; i < 10; i++) {
        const consumerPath = join(projectDirectory, crossProjectLibs[i], 'src', 'lib', 'consumer.ts');
        writeFileSync(consumerPath, `import { sharedUtil } from '${utilityAlias}';\nexport const util = sharedUtil();\n`);
      }

      // Setup for Many large files benchmark (2 projects + 100 files)
      manyFilesSourceLib = `stress-source-${batchId}`;
      manyFilesTargetLib = `stress-target-${batchId}`;
      
      execSync(
        `npx nx generate @nx/js:library ${manyFilesSourceLib} --unitTestRunner=none --bundler=none --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );
      
      execSync(
        `npx nx generate @nx/js:library ${manyFilesTargetLib} --unitTestRunner=none --bundler=none --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );

      for (let i = 0; i < 100; i++) {
        const fileName = `large-module-${i}.ts`;
        const filePath = join(projectDirectory, manyFilesSourceLib, 'src', 'lib', fileName);
        writeFileSync(filePath, generateUtilityModule(`util${i}`, 50));
      }

      // Setup for Many intra-project dependencies benchmark (1 project + 50 files)
      relativeDepsLib = `stress-relative-${batchId}`;
      execSync(
        `npx nx generate @nx/js:library ${relativeDepsLib} --unitTestRunner=none --bundler=none --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );

      const utilsDir = join(projectDirectory, relativeDepsLib, 'src', 'lib', 'utils');
      mkdirSync(utilsDir, { recursive: true });

      relativeDepsUtilFile = 'deep-util.ts';
      const deepUtilPath = join(utilsDir, relativeDepsUtilFile);
      writeFileSync(deepUtilPath, 'export function deepUtil() { return "deep"; }\n');

      for (let i = 0; i < 50; i++) {
        const consumerPath = join(projectDirectory, relativeDepsLib, 'src', 'lib', `consumer-${i}.ts`);
        writeFileSync(consumerPath, `import { deepUtil } from './utils/${relativeDepsUtilFile.replace('.ts', '')}';\nexport const val${i} = deepUtil();\n`);
      }

      // Setup for Combined stress benchmark (15 projects + 30 files each)
      combinedStressLibs = [];
      for (let i = 0; i < 15; i++) {
        const libName = `mega-lib${i}-${batchId}`;
        combinedStressLibs.push(libName);
        execSync(
          `npx nx generate @nx/js:library ${libName} --unitTestRunner=none --bundler=none --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe',
          },
        );

        for (let j = 0; j < 30; j++) {
          const fileName = `module-${j}.ts`;
          const filePath = join(projectDirectory, libName, 'src', 'lib', fileName);
          writeFileSync(filePath, `export function func${j}() { return ${j}; }\n`);
        }
      }

      const coreFile = 'core-api.ts';
      const coreFilePath = join(projectDirectory, combinedStressLibs[0], 'src', 'lib', coreFile);
      writeFileSync(coreFilePath, generateUtilityModule('coreApi', 100));

      const coreIndexPath = join(projectDirectory, combinedStressLibs[0], 'src', 'index.ts');
      writeFileSync(coreIndexPath, `export * from './lib/${coreFile.replace('.ts', '')}';\n`);

      const coreAlias = getProjectImportAlias(projectDirectory, combinedStressLibs[0]);
      for (let i = 1; i < 15; i++) {
        const consumerPath = join(projectDirectory, combinedStressLibs[i], 'src', 'lib', 'uses-core.ts');
        writeFileSync(consumerPath, `import { coreApi } from '${coreAlias}';\nexport const api = coreApi();\n`);
      }
    },
    setupSuiteTimeout: 300000,
    async teardownSuite() {
      if (projectDirectory) {
        await cleanupProject(projectDirectory);
      }
    },
    teardownSuiteTimeout: 60000,
    time: 60000,
    iterations: 5,
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

function generateLargeTypeScriptFile(functionCount: number): string {
  const header = '// Auto-generated TypeScript file for stress testing\n\n';
  const functions = Array.from(
    { length: functionCount },
    (_, i) => `export function func${i}() {\n  return ${i};\n}\n`,
  ).join('\n');
  return header + functions;
}

function generateUtilityModule(
  exportName: string,
  functionCount: number,
): string {
  const header = `// Utility module: ${exportName}\n\n`;
  const functions = Array.from(
    { length: functionCount },
    (_, i) => `function helper${i}() {\n  return "helper${i}";\n}\n`,
  ).join('\n');
  const helpers = Array.from(
    { length: Math.min(10, functionCount) },
    (_, i) => `    helper${i},`,
  ).join('\n');
  const mainFunction = `\nexport function ${exportName}() {\n  return {\n${helpers}\n  };\n}\n`;
  return header + functions + mainFunction;
}

async function createTestProject(): Promise<string> {
  const projectName = `e2e-stress-${uniqueId()}`;
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
