import { benchmarkSuite } from '../../../../tools/tinybench-utils';
import { uniqueId } from 'lodash';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * E2E stress test benchmarks for the move-file generator.
 * These tests validate performance with large workspaces and complex dependency graphs.
 */

let projectDirectory: string;

benchmarkSuite(
  'Move-File E2E Stress Tests',
  {
    'Cross-project move (10 projects with dependencies)': () => {
      const projectCount = 10;
      const libs: string[] = [];
      const batchId = uniqueId();

      for (let i = 0; i < projectCount; i++) {
        const libName = `stress-lib${i}-${batchId}`;
        libs.push(libName);

        execSync(
          `npx nx generate @nx/js:library ${libName} --unitTestRunner=none --bundler=none --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe',
          },
        );
      }

      const utilityFile = 'shared-utility.ts';
      const utilityPath = join(
        projectDirectory,
        libs[0],
        'src',
        'lib',
        utilityFile,
      );
      writeFileSync(utilityPath, generateUtilityModule('sharedUtil', 50));

      const sourceIndexPath = join(projectDirectory, libs[0], 'src', 'index.ts');
      writeFileSync(
        sourceIndexPath,
        `export * from './lib/${utilityFile.replace('.ts', '')}';\n`,
      );

      const lib0Alias = getProjectImportAlias(projectDirectory, libs[0]);

      for (let i = 1; i < projectCount; i++) {
        const consumerPath = join(
          projectDirectory,
          libs[i],
          'src',
          'lib',
          `consumer-from-lib0.ts`,
        );
        writeFileSync(
          consumerPath,
          `import { sharedUtil } from '${lib0Alias}';\nexport const value = sharedUtil();\n`,
        );
      }

      execSync(
        `npx nx generate @nxworker/workspace:move-file ${libs[0]}/src/lib/${utilityFile} --project ${libs[projectCount - 1]} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );
    },

    'Many large files (100 files, 10KB each)': () => {
      const fileCount = 100;
      const batchId = uniqueId();
      const sourceLib = `stress-source-${batchId}`;
      const targetLib = `stress-target-${batchId}`;

      for (const lib of [sourceLib, targetLib]) {
        execSync(
          `npx nx generate @nx/js:library ${lib} --unitTestRunner=none --bundler=none --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe',
          },
        );
      }

      const targetFile = 'large-module.ts';
      const targetFilePath = join(
        projectDirectory,
        sourceLib,
        'src',
        'lib',
        targetFile,
      );
      writeFileSync(targetFilePath, generateLargeTypeScriptFile(500));

      const sourceIndexPath = join(projectDirectory, sourceLib, 'src', 'index.ts');
      writeFileSync(
        sourceIndexPath,
        `export * from './lib/${targetFile.replace('.ts', '')}';\n`,
      );

      const sourceLibAlias = getProjectImportAlias(projectDirectory, sourceLib);
      const filesWithImports = Math.floor(fileCount * 0.1);

      for (let i = 0; i < fileCount; i++) {
        const fileName = `large-file-${i}.ts`;
        const filePath = join(projectDirectory, sourceLib, 'src', 'lib', fileName);

        let content = generateLargeTypeScriptFile(200);

        if (i < filesWithImports) {
          content =
            `import { func0 } from '${sourceLibAlias}';\n` +
            `export const imported = func0();\n` +
            content;
        }

        writeFileSync(filePath, content);
      }

      execSync(
        `npx nx generate @nxworker/workspace:move-file ${sourceLib}/src/lib/${targetFile} --project ${targetLib} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );
    },

    'Many intra-project dependencies (50 relative imports)': () => {
      const batchId = uniqueId();
      const lib = `stress-relative-${batchId}`;
      const importerCount = 50;

      execSync(
        `npx nx generate @nx/js:library ${lib} --unitTestRunner=none --bundler=none --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );

      const utilsDir = join(projectDirectory, lib, 'src', 'lib', 'utils');
      mkdirSync(utilsDir, { recursive: true });

      const utilFile = 'deep-util.ts';
      const utilPath = join(utilsDir, utilFile);
      writeFileSync(
        utilPath,
        'export function deepUtil() { return "deep"; }\n',
      );

      for (let i = 0; i < importerCount; i++) {
        const importerFile = `importer-${i}.ts`;
        const importerPath = join(projectDirectory, lib, 'src', 'lib', importerFile);
        writeFileSync(
          importerPath,
          `import { deepUtil } from './utils/${utilFile.replace('.ts', '')}';\nexport const value${i} = deepUtil();\n`,
        );
      }

      const newUtilsDir = join(projectDirectory, lib, 'src', 'lib', 'helpers');
      mkdirSync(newUtilsDir, { recursive: true });

      execSync(
        `npx nx generate @nxworker/workspace:move-file ${lib}/src/lib/utils/${utilFile} --project ${lib} --project-directory=helpers --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );
    },

    'Combined stress (15 projects, 30 files each = 450 total files)': () => {
      const projectCount = 15;
      const filesPerProject = 30;
      const libs: string[] = [];
      const batchId = uniqueId();

      for (let i = 0; i < projectCount; i++) {
        const libName = `mega-lib${i}-${batchId}`;
        libs.push(libName);

        execSync(
          `npx nx generate @nx/js:library ${libName} --unitTestRunner=none --bundler=none --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe',
          },
        );

        for (let j = 0; j < filesPerProject; j++) {
          const fileName = `module-${j}.ts`;
          const filePath = join(projectDirectory, libName, 'src', 'lib', fileName);
          writeFileSync(filePath, generateLargeTypeScriptFile(50));
        }
      }

      const coreFile = 'core-api.ts';
      const coreFilePath = join(projectDirectory, libs[0], 'src', 'lib', coreFile);
      writeFileSync(coreFilePath, generateUtilityModule('coreApi', 100));

      const coreIndexPath = join(projectDirectory, libs[0], 'src', 'index.ts');
      writeFileSync(
        coreIndexPath,
        `export * from './lib/${coreFile.replace('.ts', '')}';\n`,
      );

      const coreAlias = getProjectImportAlias(projectDirectory, libs[0]);

      for (let i = 1; i < projectCount; i++) {
        const consumerPath = join(
          projectDirectory,
          libs[i],
          'src',
          'lib',
          'uses-core.ts',
        );
        writeFileSync(
          consumerPath,
          `import { coreApi } from '${coreAlias}';\nexport const api = coreApi();\n`,
        );
      }

      execSync(
        `npx nx generate @nxworker/workspace:move-file ${libs[0]}/src/lib/${coreFile} --project ${libs[projectCount - 1]} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );
    },
  },
  {
    async setupSuite() {
      projectDirectory = await createTestProject();

      execSync(`npm install @nxworker/workspace@e2e`, {
        cwd: projectDirectory,
        stdio: 'pipe',
        env: process.env,
      });
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
      stdio: 'pipe',
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
