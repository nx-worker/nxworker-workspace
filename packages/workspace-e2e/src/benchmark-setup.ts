import { uniqueId } from 'lodash';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import {
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from 'node:fs';

/**
 * Shared setup utilities for e2e performance benchmarks.
 * These functions are used across multiple benchmark files to avoid duplication.
 */

// Constants
export const ITERATIONS_PER_BENCHMARK = 100; // Pre-create 100 files for each benchmark

// Global test project variables
export let projectDirectory: string;
export let benchmarkLib1: string;
export let benchmarkLib2: string;

// Test file scenarios
export const testFiles: {
  smallFiles?: { lib: string; fileNames: string[] };
  mediumFiles?: { lib: string; fileNames: string[] };
  largeFiles?: { lib: string; fileNames: string[] };
  multiSmallFiles?: { lib: string; pattern: string };
  commaSeparatedGlobs?: { lib: string; pattern: string };
  fileWithImporters?: { lib: string; fileName: string };
  earlyExitOptimization?: { lib: string; fileName: string };
} = {};

// Iteration counters (mutable for benchmark files)
export const iterationCounters = {
  smallFile: 0,
  mediumFile: 0,
  largeFile: 0,
};

// Benchmark options
export const isCI = process.env.CI === 'true';
export const isPullRequest = process.env.GITHUB_EVENT_NAME === 'pull_request';
export const ciSamples = isPullRequest ? 1 : 3;

export const simpleBenchmarkOptions = isCI
  ? {
      timeoutSeconds: 2400,
      minSamples: ciSamples,
      maxSamples: ciSamples,
      maxTime: ciSamples === 1 ? 60 : 180,
    } // CI: 40 min timeout, 1 sample for PRs / 3 samples for main, max 1-3 min
  : { timeoutSeconds: 300, minSamples: 3, maxSamples: 3, maxTime: 60 }; // Local: 5 min timeout, 3 samples, max 60s

export const complexBenchmarkOptions = isCI
  ? {
      timeoutSeconds: 3600,
      minSamples: ciSamples,
      maxSamples: ciSamples,
      maxTime: ciSamples === 1 ? 240 : 480,
    } // CI: 60 min timeout, 1 sample for PRs / 3 samples for main, max 4-8 min
  : { timeoutSeconds: 480, minSamples: 3, maxSamples: 3, maxTime: 120 }; // Local: 8 min timeout, 3 samples, max 2 min

// Setup functions
export async function initializeBenchmarkProject() {
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
}

export function setupSmallFileScenario() {
  const fileNames: string[] = [];
  const uniqueSuffix = uniqueId();

  // Create 100 unique small files
  for (let i = 0; i < ITERATIONS_PER_BENCHMARK; i++) {
    const fileName = `small-${uniqueSuffix}-${i}.ts`;
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
    fileNames.push(fileName);
  }

  testFiles.smallFiles = { lib: benchmarkLib1, fileNames };
}

export function setupMediumFileScenario() {
  const fileNames: string[] = [];
  const uniqueSuffix = uniqueId();

  // Create 100 unique medium files
  for (let i = 0; i < ITERATIONS_PER_BENCHMARK; i++) {
    const fileName = `medium-${uniqueSuffix}-${i}.ts`;
    const filePath = join(
      projectDirectory,
      benchmarkLib1,
      'src',
      'lib',
      fileName,
    );
    const content = generateLargeTypeScriptFile(200); // ~200 functions
    writeFileSync(filePath, content);
    fileNames.push(fileName);
  }

  testFiles.mediumFiles = { lib: benchmarkLib1, fileNames };
}

export function setupLargeFileScenario() {
  const fileNames: string[] = [];
  const uniqueSuffix = uniqueId();

  // Create 100 unique large files
  for (let i = 0; i < ITERATIONS_PER_BENCHMARK; i++) {
    const fileName = `large-${uniqueSuffix}-${i}.ts`;
    const filePath = join(
      projectDirectory,
      benchmarkLib1,
      'src',
      'lib',
      fileName,
    );
    const content = generateLargeTypeScriptFile(1000); // ~1000 functions
    writeFileSync(filePath, content);
    fileNames.push(fileName);
  }

  testFiles.largeFiles = { lib: benchmarkLib1, fileNames };
}

export function setupMultiSmallFilesScenario() {
  const fileCount = 10;
  const uniqueSuffix = uniqueId();

  for (let i = 0; i < fileCount; i++) {
    const fileName = `multi-small-${uniqueSuffix}-${i}.ts`;
    writeFileSync(
      join(projectDirectory, benchmarkLib1, 'src', 'lib', fileName),
      `export function func${i}() { return ${i}; }\n`,
    );
  }

  testFiles.multiSmallFiles = {
    lib: benchmarkLib1,
    pattern: `multi-small-${uniqueSuffix}-*.ts`,
  };
}

export function setupCommaSeparatedGlobsScenario() {
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

  // Store full patterns with lib path for each group
  testFiles.commaSeparatedGlobs = {
    lib: benchmarkLib1,
    pattern: `${benchmarkLib1}/src/lib/api-${uniqueSuffix}-*.ts,${benchmarkLib1}/src/lib/service-${uniqueSuffix}-*.ts,${benchmarkLib1}/src/lib/util-${uniqueSuffix}-*.ts`,
  };
}

export function setupFileWithImportersScenario() {
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
    existingIndex + `export * from './lib/${sourceFile.replace('.ts', '')}';\n`,
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

  testFiles.fileWithImporters = { lib: benchmarkLib1, fileName: sourceFile };
}

export function setupEarlyExitOptimizationScenario() {
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
    existingIndex + `export * from './lib/${sourceFile.replace('.ts', '')}';\n`,
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

  testFiles.earlyExitOptimization = {
    lib: benchmarkLib1,
    fileName: sourceFile,
  };
}

// Helper function to reset file location between benchmark iterations
export function resetFileLocation(
  sourceLib: string,
  targetLib: string,
  fileName: string,
) {
  const sourceFilePath = join(
    projectDirectory,
    sourceLib,
    'src',
    'lib',
    fileName,
  );
  const targetFilePath = join(
    projectDirectory,
    targetLib,
    'src',
    'lib',
    fileName,
  );

  try {
    // If file exists in target but not in source, move it back
    if (existsSync(targetFilePath) && !existsSync(sourceFilePath)) {
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${targetLib}/src/lib/${fileName} --project ${sourceLib} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );
    }
  } catch {
    // Ignore errors - file might already be in correct location
  }
}

// Helper functions
export function getProjectImportAlias(
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

export function generateLargeTypeScriptFile(lines: number): string {
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

  // Strip leading caret or tilde from version string for npx compatibility
  const cleanVersion = workspaceNxVersion.replace(/^[\^~]/, '');

  execSync(
    `npx --yes create-nx-workspace@${cleanVersion} ${projectName} --preset apps --nxCloud=skip --no-interactive --skipGit`,
    {
      cwd: dirname(projectDirectory),
      stdio: 'pipe',
      env: process.env,
    },
  );

  return projectDirectory;
}
