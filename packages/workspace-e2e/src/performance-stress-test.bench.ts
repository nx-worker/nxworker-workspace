import { benchmarkSuite } from 'jest-bench';
import { uniqueId } from 'lodash';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * E2E stress test benchmarks for the move-file generator using jest-bench.
 * These benchmarks validate performance with large workspaces, many projects,
 * and complex dependency graphs.
 *
 * Note: Since jest-bench benchmarks must be synchronous, we pre-create
 * the necessary project structures in beforeAll and reuse them across benchmarks.
 */

// Global test project for stress tests
let stressProjectDirectory: string;

beforeAll(async () => {
  stressProjectDirectory = await createStressTestProject();
}, 300000); // 5 minute timeout

afterAll(async () => {
  if (stressProjectDirectory) {
    await cleanupProject(stressProjectDirectory);
  }
}, 60000);

benchmarkSuite(
  'Move file across 10 projects',
  {
    ['Cross-project move with 10 projects']() {
      const projectCount = 10;
      const libs: string[] = [];
      const uniqueSuffix = uniqueId();

      // Create multiple projects
      for (let i = 0; i < projectCount; i++) {
        const libName = `stress-lib${i}-${uniqueSuffix}`;
        libs.push(libName);

        execSync(
          `npx nx generate @nx/js:library ${libName} --unitTestRunner=none --bundler=none --no-interactive`,
          {
            cwd: stressProjectDirectory,
            stdio: 'pipe',
          },
        );
      }

      // Create a utility file in the first project
      const utilityFile = 'shared-utility.ts';
      writeFileSync(
        join(stressProjectDirectory, libs[0], 'src', 'lib', utilityFile),
        generateUtilityModule('sharedUtil', 50),
      );

      // Export from first project's index
      writeFileSync(
        join(stressProjectDirectory, libs[0], 'src', 'index.ts'),
        `export * from './lib/${utilityFile.replace('.ts', '')}';\n`,
      );

      // Create dependencies: each project imports from the first project
      const lib0Alias = getProjectImportAlias(stressProjectDirectory, libs[0]);
      for (let i = 1; i < projectCount; i++) {
        writeFileSync(
          join(
            stressProjectDirectory,
            libs[i],
            'src',
            'lib',
            `consumer-from-lib0.ts`,
          ),
          `import { sharedUtil } from '${lib0Alias}';\nexport const value = sharedUtil();\n`,
        );
      }

      // Benchmark the move operation
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${libs[0]}/src/lib/${utilityFile} --project ${libs[libs.length - 1]} --no-interactive`,
        {
          cwd: stressProjectDirectory,
          stdio: 'pipe',
        },
      );
    },
  },
  420000, // 7 minute timeout for cross-project move with 10 projects
);

benchmarkSuite(
  'Process 100 large files',
  {
    ['Move file with 100 large files in workspace']() {
      const fileCount = 100;
      const uniqueSuffix = uniqueId();
      const sourceLib = `stress-source-${uniqueSuffix}`;
      const targetLib = `stress-target-${uniqueSuffix}`;

      // Create source and target libraries
      for (const lib of [sourceLib, targetLib]) {
        execSync(
          `npx nx generate @nx/js:library ${lib} --unitTestRunner=none --bundler=none --no-interactive`,
          {
            cwd: stressProjectDirectory,
            stdio: 'pipe',
          },
        );
      }

      // Create file to be moved
      const targetFile = 'large-module.ts';
      writeFileSync(
        join(stressProjectDirectory, sourceLib, 'src', 'lib', targetFile),
        generateLargeTypeScriptFile(500),
      );

      // Export from index
      writeFileSync(
        join(stressProjectDirectory, sourceLib, 'src', 'index.ts'),
        `export * from './lib/${targetFile.replace('.ts', '')}';\n`,
      );

      const sourceLibAlias = getProjectImportAlias(
        stressProjectDirectory,
        sourceLib,
      );

      // Create many large files (most won't import the target)
      const filesWithImports = Math.floor(fileCount * 0.1); // 10% import the target
      for (let i = 0; i < fileCount; i++) {
        const fileName = `large-file-${i}.ts`;
        let content = generateLargeTypeScriptFile(200); // ~10KB each

        // Add import to some files
        if (i < filesWithImports) {
          content =
            `import { func0 } from '${sourceLibAlias}';\n` +
            `export const imported = func0();\n` +
            content;
        }

        writeFileSync(
          join(stressProjectDirectory, sourceLib, 'src', 'lib', fileName),
          content,
        );
      }

      // Benchmark the move
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${sourceLib}/src/lib/${targetFile} --project ${targetLib} --no-interactive`,
        {
          cwd: stressProjectDirectory,
          stdio: 'pipe',
        },
      );
    },
  },
  420000, // 7 minute timeout for processing 100 large files
);

benchmarkSuite(
  'Update 50 relative imports',
  {
    ['Move file with 50 relative imports in same project']() {
      const uniqueSuffix = uniqueId();
      const lib = `stress-relative-${uniqueSuffix}`;
      const importerCount = 50;

      execSync(
        `npx nx generate @nx/js:library ${lib} --unitTestRunner=none --bundler=none --no-interactive`,
        {
          cwd: stressProjectDirectory,
          stdio: 'pipe',
        },
      );

      // Create a deeply nested utility file
      const utilsDir = join(stressProjectDirectory, lib, 'src', 'lib', 'utils');
      mkdirSync(utilsDir, { recursive: true });

      const utilFile = 'deep-util.ts';
      writeFileSync(
        join(utilsDir, utilFile),
        'export function deepUtil() { return "deep"; }\n',
      );

      // Create many files that import using relative paths
      for (let i = 0; i < importerCount; i++) {
        const importerFile = `importer-${i}.ts`;
        writeFileSync(
          join(stressProjectDirectory, lib, 'src', 'lib', importerFile),
          `import { deepUtil } from './utils/${utilFile.replace('.ts', '')}';\nexport const value${i} = deepUtil();\n`,
        );
      }

      // Create target directory
      const newUtilsDir = join(
        stressProjectDirectory,
        lib,
        'src',
        'lib',
        'helpers',
      );
      mkdirSync(newUtilsDir, { recursive: true });

      // Benchmark the move
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${lib}/src/lib/utils/${utilFile} --project ${lib} --project-directory=helpers --no-interactive`,
        {
          cwd: stressProjectDirectory,
          stdio: 'pipe',
        },
      );
    },
  },
  300000, // 5 minute timeout for updating 50 relative imports
);

benchmarkSuite(
  'Large workspace scenario',
  {
    ['Move file in workspace with 15 projects and 30 files each']() {
      const projectCount = 15;
      const filesPerProject = 30;
      const uniqueSuffix = uniqueId();
      const libs: string[] = [];

      // Create projects
      for (let i = 0; i < projectCount; i++) {
        const libName = `mega-lib${i}-${uniqueSuffix}`;
        libs.push(libName);

        execSync(
          `npx nx generate @nx/js:library ${libName} --unitTestRunner=none --bundler=none --no-interactive`,
          {
            cwd: stressProjectDirectory,
            stdio: 'pipe',
          },
        );

        // Create multiple files per project
        for (let j = 0; j < filesPerProject; j++) {
          const fileName = `module-${j}.ts`;
          writeFileSync(
            join(stressProjectDirectory, libName, 'src', 'lib', fileName),
            generateLargeTypeScriptFile(50), // ~2.5KB each
          );
        }
      }

      // Create a shared core library
      const coreFile = 'core-api.ts';
      writeFileSync(
        join(stressProjectDirectory, libs[0], 'src', 'lib', coreFile),
        generateUtilityModule('coreApi', 100),
      );

      writeFileSync(
        join(stressProjectDirectory, libs[0], 'src', 'index.ts'),
        `export * from './lib/${coreFile.replace('.ts', '')}';\n`,
      );

      // Create cross-project dependencies
      const coreAlias = getProjectImportAlias(stressProjectDirectory, libs[0]);
      for (let i = 1; i < projectCount; i++) {
        writeFileSync(
          join(stressProjectDirectory, libs[i], 'src', 'lib', 'uses-core.ts'),
          `import { coreApi } from '${coreAlias}';\nexport const api = coreApi();\n`,
        );
      }

      // Benchmark the move
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${libs[0]}/src/lib/${coreFile} --project ${libs[libs.length - 1]} --no-interactive`,
        {
          cwd: stressProjectDirectory,
          stdio: 'pipe',
        },
      );
    },
  },
  600000, // 10 minute timeout for large workspace setup
);

// Helper functions
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
        (entry as string)
          .replace(/\\/g, '/')
          .includes(`${projectName}/src/index`),
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

async function createStressTestProject(): Promise<string> {
  const projectName = `stress-test-${uniqueId()}`;
  const projectDirectory = join(process.cwd(), 'tmp', projectName);

  await cleanupProject(projectDirectory);
  mkdirSync(dirname(projectDirectory), { recursive: true });

  // Get workspace Nx version
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

  // Install the plugin
  execSync(`npm install @nxworker/workspace@e2e`, {
    cwd: projectDirectory,
    stdio: 'pipe',
    env: process.env,
  });

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
        // Directory doesn't exist, that's fine
        break;
      } else {
        throw err;
      }
    }
  }
}
