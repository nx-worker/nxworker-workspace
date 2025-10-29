import {
  beforeAll,
  beforeEachIteration,
  describe,
  it,
} from '../../../tools/tinybench-utils';
import { uniqueId } from 'lodash';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * E2E Performance benchmarks for the move-file generator.
 * These benchmarks measure the execution time of the generator with various
 * file sizes and counts to validate the performance optimizations.
 *
 * Uses the same Jest-like describe-it structure as workspace benchmarks.
 */

describe('Move-File Generator E2E Performance', () => {
  let projectDirectory: string;
  let benchmarkLib1: string;
  let benchmarkLib2: string;

  beforeAll(async () => {
    projectDirectory = await createTestProject();
    benchmarkLib1 = uniqueId('bench-lib1-');
    benchmarkLib2 = uniqueId('bench-lib2-');

    // The plugin has been built and published to a local registry in the jest globalSetup
    // Install the plugin built with the latest source code into the test repo
    execSync(`npm install @nxworker/workspace@e2e`, {
      cwd: projectDirectory,
      stdio: 'inherit',
      env: process.env,
    });

    // Create benchmark libraries
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
  }, 300000); // 5 minute timeout for beforeAll

  afterAll(async () => {
    // Cleanup the test project (Windows: handle EBUSY)
    if (projectDirectory) {
      await cleanupProject(projectDirectory);
    }
  }, 60000);

  describe('Single file operations', () => {
    let smallFileName: string;
    let mediumFileName: string;
    let largeFileName: string;

    beforeAll(() => {
      // Create test files
      smallFileName = 'small-file.ts';
      const smallFilePath = join(
        projectDirectory,
        benchmarkLib1,
        'src',
        'lib',
        smallFileName,
      );
      writeFileSync(
        smallFilePath,
        'export function smallFunction() { return "small"; }\n',
      );

      mediumFileName = 'medium-file.ts';
      const mediumFilePath = join(
        projectDirectory,
        benchmarkLib1,
        'src',
        'lib',
        mediumFileName,
      );
      writeFileSync(mediumFilePath, generateLargeTypeScriptFile(200));

      largeFileName = 'large-file.ts';
      const largeFilePath = join(
        projectDirectory,
        benchmarkLib1,
        'src',
        'lib',
        largeFileName,
      );
      writeFileSync(largeFilePath, generateLargeTypeScriptFile(1000));
    });

    it('should move a small file (< 1KB) efficiently', () => {
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${benchmarkLib1}/src/lib/${smallFileName} --project ${benchmarkLib2} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );

      // Verify the move succeeded
      const movedPath = join(
        projectDirectory,
        benchmarkLib2,
        'src',
        'lib',
        smallFileName,
      );
      const content = readFileSync(movedPath, 'utf-8');
      if (!content.includes('smallFunction')) {
        throw new Error('File move verification failed');
      }
    });

    it('should move a medium file (~10KB) efficiently', () => {
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${benchmarkLib1}/src/lib/${mediumFileName} --project ${benchmarkLib2} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );

      const movedPath = join(
        projectDirectory,
        benchmarkLib2,
        'src',
        'lib',
        mediumFileName,
      );
      const content = readFileSync(movedPath, 'utf-8');
      if (!content.includes('func0')) {
        throw new Error('File move verification failed');
      }
    });

    it('should move a large file (~50KB) efficiently', () => {
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${benchmarkLib1}/src/lib/${largeFileName} --project ${benchmarkLib2} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );

      const movedPath = join(
        projectDirectory,
        benchmarkLib2,
        'src',
        'lib',
        largeFileName,
      );
      const content = readFileSync(movedPath, 'utf-8');
      if (!content.includes('func0')) {
        throw new Error('File move verification failed');
      }
    });
  });

  describe('Multiple file operations', () => {
    beforeAll(() => {
      const fileCount = 10;
      // Create multiple small files
      for (let i = 0; i < fileCount; i++) {
        const fileName = `multi-small-${i}.ts`;
        writeFileSync(
          join(projectDirectory, benchmarkLib1, 'src', 'lib', fileName),
          `export function func${i}() { return ${i}; }\n`,
        );
      }
    });

    it('should move multiple small files efficiently', () => {
      execSync(
        `npx nx generate @nxworker/workspace:move-file "${benchmarkLib1}/src/lib/multi-small-*.ts" --project ${benchmarkLib2} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );

      // Verify at least one file was moved
      const movedPath = join(
        projectDirectory,
        benchmarkLib2,
        'src',
        'lib',
        'multi-small-0.ts',
      );
      const content = readFileSync(movedPath, 'utf-8');
      if (!content.includes('func0')) {
        throw new Error('File move verification failed');
      }
    });
  });
});

// ==================== Helper Functions ====================

function generateLargeTypeScriptFile(lines: number): string {
  const header = '// Large auto-generated TypeScript file\n\n';
  const functions = Array.from(
    { length: lines },
    (_, i) => `export function func${i}() {\n  return ${i};\n}\n`,
  ).join('\n');
  return header + functions;
}

async function createTestProject(): Promise<string> {
  const projectName = `benchmark-${uniqueId()}`;
  const projectDirectory = join(process.cwd(), 'tmp', projectName);

  // Ensure projectDirectory is empty (Windows: handle EBUSY)
  await cleanupProject(projectDirectory);

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
      stdio: 'inherit',
      env: process.env,
    },
  );
  console.log(`Created benchmark project in "${projectDirectory}"`);

  return projectDirectory;
}

async function cleanupProject(projectDirectory: string): Promise<void> {
  if (!projectDirectory) {
    return;
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
