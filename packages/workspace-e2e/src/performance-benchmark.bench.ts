import { benchmarkSuite } from 'jest-bench';
import { uniqueId } from 'lodash';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * E2E performance benchmarks for the move-file generator using jest-bench.
 * These benchmarks measure the end-to-end execution time of the generator
 * with various file sizes and counts to validate performance optimizations.
 *
 * Note: Each benchmark creates its own test files to ensure isolation.
 * The test project and libraries are created once and reused for all benchmarks.
 */

// Global setup: create test project and libraries once for all benchmarks
let projectDirectory: string;
let benchmarkLib1: string;
let benchmarkLib2: string;

// Ensure the workspace is set up before running benchmarks
beforeAll(async () => {
  projectDirectory = await createTestProject();
  benchmarkLib1 = uniqueId('bench-lib1-');
  benchmarkLib2 = uniqueId('bench-lib2-');

  // Install the plugin built with the latest source code
  execSync(`npm install @nxworker/workspace@e2e`, {
    cwd: projectDirectory,
    stdio: 'pipe',
    env: process.env,
  });

  // Create benchmark libraries
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
}, 300000); // 5 minute timeout for setup

// Single file operations benchmarks
benchmarkSuite('Move small file (< 1KB)', {
  ['Small file move']() {
    const fileName = `small-${uniqueId()}.ts`;
    const filePath = join(
      projectDirectory,
      benchmarkLib1,
      'src',
      'lib',
      fileName,
    );
    writeFileSync(
      filePath,
      'export function smallFunction() { return "small"; }\n',
    );

    execSync(
      `npx nx generate @nxworker/workspace:move-file ${benchmarkLib1}/src/lib/${fileName} --project ${benchmarkLib2} --no-interactive`,
      {
        cwd: projectDirectory,
        stdio: 'pipe',
      },
    );
  },
});

benchmarkSuite('Move medium file (~10KB)', {
  ['Medium file move']() {
    const fileName = `medium-${uniqueId()}.ts`;
    const filePath = join(
      projectDirectory,
      benchmarkLib1,
      'src',
      'lib',
      fileName,
    );
    const content = generateLargeTypeScriptFile(200); // ~200 functions
    writeFileSync(filePath, content);

    execSync(
      `npx nx generate @nxworker/workspace:move-file ${benchmarkLib1}/src/lib/${fileName} --project ${benchmarkLib2} --no-interactive`,
      {
        cwd: projectDirectory,
        stdio: 'pipe',
      },
    );
  },
});

benchmarkSuite('Move large file (~50KB)', {
  ['Large file move']() {
    const fileName = `large-${uniqueId()}.ts`;
    const filePath = join(
      projectDirectory,
      benchmarkLib1,
      'src',
      'lib',
      fileName,
    );
    const content = generateLargeTypeScriptFile(1000); // ~1000 functions
    writeFileSync(filePath, content);

    execSync(
      `npx nx generate @nxworker/workspace:move-file ${benchmarkLib1}/src/lib/${fileName} --project ${benchmarkLib2} --no-interactive`,
      {
        cwd: projectDirectory,
        stdio: 'pipe',
      },
    );
  },
});

// Multiple file operations benchmarks
benchmarkSuite('Move 10 small files', {
  ['Move 10 small files with glob']() {
    const fileCount = 10;
    const uniqueSuffix = uniqueId();

    for (let i = 0; i < fileCount; i++) {
      const fileName = `multi-small-${uniqueSuffix}-${i}.ts`;
      writeFileSync(
        join(projectDirectory, benchmarkLib1, 'src', 'lib', fileName),
        `export function func${i}() { return ${i}; }\n`,
      );
    }

    execSync(
      `npx nx generate @nxworker/workspace:move-file "${benchmarkLib1}/src/lib/multi-small-${uniqueSuffix}-*.ts" --project ${benchmarkLib2} --no-interactive`,
      {
        cwd: projectDirectory,
        stdio: 'pipe',
      },
    );
  },
});

benchmarkSuite('Move files with comma-separated glob (15 files)', {
  ['Move 15 files with comma-separated globs']() {
    const uniqueSuffix = uniqueId();

    // Group 1: api-*.ts
    for (let i = 0; i < 5; i++) {
      const fileName = `api-${uniqueSuffix}-${i}.ts`;
      writeFileSync(
        join(projectDirectory, benchmarkLib1, 'src', 'lib', fileName),
        `export function api${i}() { return 'api${i}'; }\n`,
      );
    }

    // Group 2: service-*.ts
    for (let i = 0; i < 5; i++) {
      const fileName = `service-${uniqueSuffix}-${i}.ts`;
      writeFileSync(
        join(projectDirectory, benchmarkLib1, 'src', 'lib', fileName),
        `export function service${i}() { return 'service${i}'; }\n`,
      );
    }

    // Group 3: util-*.ts
    for (let i = 0; i < 5; i++) {
      const fileName = `util-${uniqueSuffix}-${i}.ts`;
      writeFileSync(
        join(projectDirectory, benchmarkLib1, 'src', 'lib', fileName),
        `export function util${i}() { return 'util${i}'; }\n`,
      );
    }

    execSync(
      `npx nx generate @nxworker/workspace:move-file "${benchmarkLib1}/src/lib/api-${uniqueSuffix}-*.ts,${benchmarkLib1}/src/lib/service-${uniqueSuffix}-*.ts,${benchmarkLib1}/src/lib/util-${uniqueSuffix}-*.ts" --project ${benchmarkLib2} --no-interactive`,
      {
        cwd: projectDirectory,
        stdio: 'pipe',
      },
    );
  },
});

benchmarkSuite('Move file with 20 importing files', {
  ['Move file with 20 importers']() {
    const sourceFile = `source-with-imports-${uniqueId()}.ts`;
    const consumerCount = 20;

    // Create source file
    writeFileSync(
      join(projectDirectory, benchmarkLib1, 'src', 'lib', sourceFile),
      'export function source() { return "source"; }\n',
    );

    // Export from index
    const indexPath = join(projectDirectory, benchmarkLib1, 'src', 'index.ts');
    const existingIndex = readFileSync(indexPath, 'utf-8');
    writeFileSync(
      indexPath,
      existingIndex +
        `export * from './lib/${sourceFile.replace('.ts', '')}';\n`,
    );

    // Create consumer files
    const lib1Alias = getProjectImportAlias(projectDirectory, benchmarkLib1);
    for (let i = 0; i < consumerCount; i++) {
      const consumerFile = `consumer-${uniqueId()}-${i}.ts`;
      writeFileSync(
        join(projectDirectory, benchmarkLib1, 'src', 'lib', consumerFile),
        `import { source } from '${lib1Alias}';\nexport const value${i} = source();\n`,
      );
    }

    execSync(
      `npx nx generate @nxworker/workspace:move-file ${benchmarkLib1}/src/lib/${sourceFile} --project ${benchmarkLib2} --no-interactive`,
      {
        cwd: projectDirectory,
        stdio: 'pipe',
      },
    );
  },
});

// Import update optimization benchmark
benchmarkSuite('Update imports with early exit optimization', {
  ['Update imports in 50 files (early exit)']() {
    const sourceFile = `source-for-update-${uniqueId()}.ts`;

    // Create source file
    writeFileSync(
      join(projectDirectory, benchmarkLib1, 'src', 'lib', sourceFile),
      'export function sourceForUpdate() { return "update"; }\n',
    );

    // Create many files that DON'T import the source (tests early exit)
    for (let i = 0; i < 50; i++) {
      const fileName = `irrelevant-${uniqueId()}-${i}.ts`;
      writeFileSync(
        join(projectDirectory, benchmarkLib1, 'src', 'lib', fileName),
        `// This file doesn't import the source\nexport function irrelevant${i}() { return ${i}; }\n`,
      );
    }

    // Export from index
    const indexPath = join(projectDirectory, benchmarkLib1, 'src', 'index.ts');
    const existingIndex = readFileSync(indexPath, 'utf-8');
    writeFileSync(
      indexPath,
      existingIndex +
        `export * from './lib/${sourceFile.replace('.ts', '')}';\n`,
    );

    // Create one consumer
    const lib1Alias = getProjectImportAlias(projectDirectory, benchmarkLib1);
    const consumerPath = join(
      projectDirectory,
      benchmarkLib1,
      'src',
      'lib',
      `actual-consumer-${uniqueId()}.ts`,
    );
    writeFileSync(
      consumerPath,
      `import { sourceForUpdate } from '${lib1Alias}';\nexport const value = sourceForUpdate();\n`,
    );

    execSync(
      `npx nx generate @nxworker/workspace:move-file ${benchmarkLib1}/src/lib/${sourceFile} --project ${benchmarkLib2} --no-interactive`,
      {
        cwd: projectDirectory,
        stdio: 'pipe',
      },
    );
  },
});

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

function sleep(ms: number) {
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

async function createTestProject() {
  const projectName = `benchmark-${uniqueId()}`;
  const projectDirectory = join(process.cwd(), 'tmp', projectName);

  // Ensure projectDirectory is empty (Windows: handle EBUSY)
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
      } else {
        throw err;
      }
    }
  }
  mkdirSync(dirname(projectDirectory), {
    recursive: true,
  });

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
    `npx --yes create-nx-workspace@${workspaceNxVersion} ${projectName} --preset apps --nxCloud=skip --no-interactive`,
    {
      cwd: dirname(projectDirectory),
      stdio: 'pipe',
      env: process.env,
    },
  );

  return projectDirectory;
}
