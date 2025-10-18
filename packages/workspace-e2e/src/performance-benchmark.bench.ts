import { benchmarkSuite } from 'jest-bench';
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
 * E2E performance benchmarks for the move-file generator using jest-bench.
 * These benchmarks measure the end-to-end execution time of the generator
 * with various file sizes and counts to validate performance optimizations.
 *
 * IMPORTANT: To ensure accurate benchmarking, all test scenarios are pre-created
 * in beforeAll() so that only the generator execution time is measured, not the
 * project/file setup time.
 */

// Global setup: test project and libraries created once for all benchmarks
let projectDirectory: string;
let benchmarkLib1: string;
let benchmarkLib2: string;

// Pre-created test scenarios (setup done in beforeAll, not measured in benchmarks)
// For Option 1: Pre-create many unique files to avoid reset overhead in benchmarks
const ITERATIONS_PER_BENCHMARK = 100; // Pre-create 100 files for each benchmark

const testFiles: {
  smallFiles?: { lib: string; fileNames: string[] };
  mediumFiles?: { lib: string; fileNames: string[] };
  largeFiles?: { lib: string; fileNames: string[] };
  multiSmallFiles?: { lib: string; pattern: string };
  commaSeparatedGlobs?: { lib: string; pattern: string };
  fileWithImporters?: { lib: string; fileName: string };
  earlyExitOptimization?: { lib: string; fileName: string };
} = {};

// Iteration counters to cycle through pre-created files
let smallFileIteration = 0;
let mediumFileIteration = 0;
let largeFileIteration = 0;

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

  // Pre-create all test scenarios
  setupSmallFileScenario();
  setupMediumFileScenario();
  setupLargeFileScenario();
  setupMultiSmallFilesScenario();
  setupCommaSeparatedGlobsScenario();
  setupFileWithImportersScenario();
  setupEarlyExitOptimizationScenario();
}, 600000); // 10 minute timeout for all setup

// Setup functions that run BEFORE benchmarking (not measured)
// Pre-create multiple files for each benchmark to avoid reset overhead
function setupSmallFileScenario() {
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

function setupMediumFileScenario() {
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

function setupLargeFileScenario() {
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

function setupMultiSmallFilesScenario() {
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

function setupCommaSeparatedGlobsScenario() {
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

function setupFileWithImportersScenario() {
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

function setupEarlyExitOptimizationScenario() {
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
function resetFileLocation(
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

// Benchmarks: Only generator execution is measured (setup done in beforeAll)
// Option 1: Pre-created files eliminate reset overhead from timing
benchmarkSuite(
  'Move small file (< 1KB)',
  {
    ['Small file move']() {
      const scenario = testFiles.smallFiles;
      if (!scenario) throw new Error('Small file scenario not initialized');

      // Use next pre-created file (no reset needed!)
      const fileName =
        scenario.fileNames[smallFileIteration % ITERATIONS_PER_BENCHMARK];
      smallFileIteration++;

      execSync(
        `npx nx generate @nxworker/workspace:move-file ${scenario.lib}/src/lib/${fileName} --project ${benchmarkLib2} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );
    },
  },
  { timeoutSeconds: 120 }, // 2 minute timeout
);

benchmarkSuite(
  'Move medium file (~10KB)',
  {
    ['Medium file move']() {
      const scenario = testFiles.mediumFiles;
      if (!scenario) throw new Error('Medium file scenario not initialized');

      // Use next pre-created file (no reset needed!)
      const fileName =
        scenario.fileNames[mediumFileIteration % ITERATIONS_PER_BENCHMARK];
      mediumFileIteration++;

      execSync(
        `npx nx generate @nxworker/workspace:move-file ${scenario.lib}/src/lib/${fileName} --project ${benchmarkLib2} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );
    },
  },
  { timeoutSeconds: 120 }, // 2 minute timeout
);

benchmarkSuite(
  'Move large file (~50KB)',
  {
    ['Large file move']() {
      const scenario = testFiles.largeFiles;
      if (!scenario) throw new Error('Large file scenario not initialized');

      // Use next pre-created file (no reset needed!)
      const fileName =
        scenario.fileNames[largeFileIteration % ITERATIONS_PER_BENCHMARK];
      largeFileIteration++;

      execSync(
        `npx nx generate @nxworker/workspace:move-file ${scenario.lib}/src/lib/${fileName} --project ${benchmarkLib2} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );
    },
  },
  { timeoutSeconds: 120 }, // 2 minute timeout
);

benchmarkSuite(
  'Move 10 small files',
  {
    ['Move 10 small files with glob']() {
      const scenario = testFiles.multiSmallFiles;
      if (!scenario)
        throw new Error('Multi small files scenario not initialized');
      const { lib, pattern } = scenario;

      // Note: For glob patterns, we can't easily reset individual files,
      // but since we're using unique IDs in file names, each run is independent
      execSync(
        `npx nx generate @nxworker/workspace:move-file "${lib}/src/lib/${pattern}" --project ${benchmarkLib2} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );
    },
  },
  { timeoutSeconds: 120 }, // 2 minute timeout
);

benchmarkSuite(
  'Move files with comma-separated glob (15 files)',
  {
    ['Move 15 files with comma-separated globs']() {
      const scenario = testFiles.commaSeparatedGlobs;
      if (!scenario)
        throw new Error('Comma-separated globs scenario not initialized');
      const { pattern } = scenario;

      // Note: For glob patterns, we can't easily reset individual files,
      // but since we're using unique IDs in file names, each run is independent
      // Pattern already contains full paths for each glob
      execSync(
        `npx nx generate @nxworker/workspace:move-file "${pattern}" --project ${benchmarkLib2} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );
    },
  },
  { timeoutSeconds: 120 }, // 2 minute timeout
);

benchmarkSuite(
  'Move file with 20 importing files',
  {
    ['Move file with 20 importers']() {
      const scenario = testFiles.fileWithImporters;
      if (!scenario)
        throw new Error('File with importers scenario not initialized');
      const { lib, fileName } = scenario;

      // Reset file to original location before benchmark
      resetFileLocation(lib, benchmarkLib2, fileName);

      execSync(
        `npx nx generate @nxworker/workspace:move-file ${lib}/src/lib/${fileName} --project ${benchmarkLib2} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );
    },
  },
  { timeoutSeconds: 120 }, // 2 minute timeout
);

benchmarkSuite(
  'Update imports with early exit optimization',
  {
    ['Update imports in 50 files (early exit)']() {
      const scenario = testFiles.earlyExitOptimization;
      if (!scenario)
        throw new Error('Early exit optimization scenario not initialized');
      const { lib, fileName } = scenario;

      // Reset file to original location before benchmark
      resetFileLocation(lib, benchmarkLib2, fileName);

      execSync(
        `npx nx generate @nxworker/workspace:move-file ${lib}/src/lib/${fileName} --project ${benchmarkLib2} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );
    },
  },
  { timeoutSeconds: 120 }, // 2 minute timeout
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
