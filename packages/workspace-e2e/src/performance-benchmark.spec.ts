import { uniqueId } from '@nxworker/test-utils';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

const ciOnlyDescribe = process.env['CI'] ? describe : describe.skip;

/**
 * Performance benchmark tests for the move-file generator.
 * These tests measure the execution time of the generator with various
 * file sizes and counts to validate the performance optimizations.
 */

ciOnlyDescribe('move-file generator performance benchmarks', () => {
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
  });

  afterAll(async () => {
    // Cleanup the test project (Windows: handle EBUSY)
    if (projectDirectory) {
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
    }
  });

  describe('single file operations', () => {
    it('should move a small file (< 1KB) efficiently', () => {
      const fileName = 'small-file.ts';
      const filePath = join(
        projectDirectory,
        benchmarkLib1,
        'src',
        'lib',
        fileName,
      );

      // Create small file
      writeFileSync(
        filePath,
        'export function smallFunction() { return "small"; }\n',
      );

      // Benchmark the move operation
      const startTime = performance.now();
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${benchmarkLib1}/src/lib/${fileName} --project ${benchmarkLib2} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );
      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(`Small file move took: ${duration.toFixed(2)}ms`);

      // Verify the move succeeded
      const movedPath = join(
        projectDirectory,
        benchmarkLib2,
        'src',
        'lib',
        fileName,
      );
      expect(readFileSync(movedPath, 'utf-8')).toContain('smallFunction');

      // Performance expectation: should complete in reasonable time
      // This is a sanity check - actual performance will vary by machine
      expect(duration).toBeLessThan(30000); // 30 seconds max
    });

    it('should move a medium file (~10KB) efficiently', () => {
      const fileName = 'medium-file.ts';
      const filePath = join(
        projectDirectory,
        benchmarkLib1,
        'src',
        'lib',
        fileName,
      );

      // Create medium-sized file (~10KB)
      const content = generateLargeTypeScriptFile(200); // ~200 functions
      writeFileSync(filePath, content);

      const startTime = performance.now();
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${benchmarkLib1}/src/lib/${fileName} --project ${benchmarkLib2} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );
      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(`Medium file move took: ${duration.toFixed(2)}ms`);

      const movedPath = join(
        projectDirectory,
        benchmarkLib2,
        'src',
        'lib',
        fileName,
      );
      expect(readFileSync(movedPath, 'utf-8')).toContain('func0');

      expect(duration).toBeLessThan(30000);
    });

    it('should move a large file (~50KB) efficiently', () => {
      const fileName = 'large-file.ts';
      const filePath = join(
        projectDirectory,
        benchmarkLib1,
        'src',
        'lib',
        fileName,
      );

      // Create large file (~50KB)
      const content = generateLargeTypeScriptFile(1000); // ~1000 functions
      writeFileSync(filePath, content);

      const startTime = performance.now();
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${benchmarkLib1}/src/lib/${fileName} --project ${benchmarkLib2} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );
      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(`Large file move took: ${duration.toFixed(2)}ms`);

      const movedPath = join(
        projectDirectory,
        benchmarkLib2,
        'src',
        'lib',
        fileName,
      );
      expect(readFileSync(movedPath, 'utf-8')).toContain('func0');

      expect(duration).toBeLessThan(30000);
    });
  });

  describe('multiple file operations', () => {
    it('should move multiple small files efficiently', () => {
      const fileCount = 10;
      const files: string[] = [];

      // Create multiple small files
      for (let i = 0; i < fileCount; i++) {
        const fileName = `multi-small-${i}.ts`;
        files.push(fileName);
        writeFileSync(
          join(projectDirectory, benchmarkLib1, 'src', 'lib', fileName),
          `export function func${i}() { return ${i}; }\n`,
        );
      }

      const startTime = performance.now();
      execSync(
        `npx nx generate @nxworker/workspace:move-file "${benchmarkLib1}/src/lib/multi-small-*.ts" --project ${benchmarkLib2} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );
      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(
        `Moving ${fileCount} small files took: ${duration.toFixed(2)}ms (${(duration / fileCount).toFixed(2)}ms per file)`,
      );

      // Verify all files were moved
      files.forEach((fileName, i) => {
        const movedPath = join(
          projectDirectory,
          benchmarkLib2,
          'src',
          'lib',
          fileName,
        );
        expect(readFileSync(movedPath, 'utf-8')).toContain(`func${i}`);
      });

      expect(duration).toBeLessThan(60000); // 60 seconds for 10 files
    });

    it('should efficiently handle comma-separated glob patterns', () => {
      const fileCount = 15;

      // Create multiple files with different naming patterns
      // Group 1: api-*.ts
      for (let i = 0; i < 5; i++) {
        const fileName = `api-${i}.ts`;
        writeFileSync(
          join(projectDirectory, benchmarkLib1, 'src', 'lib', fileName),
          `export function api${i}() { return 'api${i}'; }\n`,
        );
      }

      // Group 2: service-*.ts
      for (let i = 0; i < 5; i++) {
        const fileName = `service-${i}.ts`;
        writeFileSync(
          join(projectDirectory, benchmarkLib1, 'src', 'lib', fileName),
          `export function service${i}() { return 'service${i}'; }\n`,
        );
      }

      // Group 3: util-*.ts
      for (let i = 0; i < 5; i++) {
        const fileName = `util-${i}.ts`;
        writeFileSync(
          join(projectDirectory, benchmarkLib1, 'src', 'lib', fileName),
          `export function util${i}() { return 'util${i}'; }\n`,
        );
      }

      // Benchmark moving all files using comma-separated glob patterns
      // This tests the optimization where multiple patterns are batched into a single globAsync call
      const startTime = performance.now();
      execSync(
        `npx nx generate @nxworker/workspace:move-file "${benchmarkLib1}/src/lib/api-*.ts,${benchmarkLib1}/src/lib/service-*.ts,${benchmarkLib1}/src/lib/util-*.ts" --project ${benchmarkLib2} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );
      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(
        `Moving ${fileCount} files with 3 comma-separated glob patterns took: ${duration.toFixed(2)}ms (${(duration / fileCount).toFixed(2)}ms per file)`,
      );

      // Verify all files were moved
      for (let i = 0; i < 5; i++) {
        expect(
          readFileSync(
            join(projectDirectory, benchmarkLib2, 'src', 'lib', `api-${i}.ts`),
            'utf-8',
          ),
        ).toContain(`api${i}`);
        expect(
          readFileSync(
            join(
              projectDirectory,
              benchmarkLib2,
              'src',
              'lib',
              `service-${i}.ts`,
            ),
            'utf-8',
          ),
        ).toContain(`service${i}`);
        expect(
          readFileSync(
            join(projectDirectory, benchmarkLib2, 'src', 'lib', `util-${i}.ts`),
            'utf-8',
          ),
        ).toContain(`util${i}`);
      }

      // With batched glob optimization, this should be very fast
      expect(duration).toBeLessThan(60000); // 60 seconds for 15 files
    });

    it('should handle files with many imports efficiently', () => {
      // Create a source file
      const sourceFile = 'source-with-imports.ts';
      writeFileSync(
        join(projectDirectory, benchmarkLib1, 'src', 'lib', sourceFile),
        'export function source() { return "source"; }\n',
      );

      // Export from index
      const indexPath = join(
        projectDirectory,
        benchmarkLib1,
        'src',
        'index.ts',
      );
      writeFileSync(
        indexPath,
        `export * from './lib/${sourceFile.replace('.ts', '')}';\n`,
      );

      // Create multiple consumer files that import the source
      const consumerCount = 20;
      const lib1Alias = getProjectImportAlias(projectDirectory, benchmarkLib1);

      for (let i = 0; i < consumerCount; i++) {
        const consumerFile = `consumer-${i}.ts`;
        writeFileSync(
          join(projectDirectory, benchmarkLib1, 'src', 'lib', consumerFile),
          `import { source } from '${lib1Alias}';\nexport const value${i} = source();\n`,
        );
      }

      // Benchmark moving the source file (should update all consumer imports)
      const startTime = performance.now();
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${benchmarkLib1}/src/lib/${sourceFile} --project ${benchmarkLib2} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );
      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(
        `Moving file with ${consumerCount} importing files took: ${duration.toFixed(2)}ms`,
      );

      // Verify source was moved
      const movedPath = join(
        projectDirectory,
        benchmarkLib2,
        'src',
        'lib',
        sourceFile,
      );
      expect(readFileSync(movedPath, 'utf-8')).toContain('source');

      // Verify at least one consumer was updated
      const lib2Alias = getProjectImportAlias(projectDirectory, benchmarkLib2);
      const consumerPath = join(
        projectDirectory,
        benchmarkLib1,
        'src',
        'lib',
        'consumer-0.ts',
      );
      expect(readFileSync(consumerPath, 'utf-8')).toContain(lib2Alias);

      expect(duration).toBeLessThan(60000); // Should handle 20 files in under 60s
    });
  });

  describe('import update performance', () => {
    it('should update imports in files without target specifier efficiently (early exit optimization)', () => {
      // Create a file to move
      const sourceFile = 'source-for-update.ts';
      writeFileSync(
        join(projectDirectory, benchmarkLib1, 'src', 'lib', sourceFile),
        'export function sourceForUpdate() { return "update"; }\n',
      );

      // Create many files that DON'T import the source
      // These should benefit from the early exit optimization
      const irrelevantFileCount = 50;
      for (let i = 0; i < irrelevantFileCount; i++) {
        const fileName = `irrelevant-${i}.ts`;
        writeFileSync(
          join(projectDirectory, benchmarkLib1, 'src', 'lib', fileName),
          `// This file doesn't import the source\nexport function irrelevant${i}() { return ${i}; }\n`,
        );
      }

      // Create one file that does import the source
      const lib1Alias = getProjectImportAlias(projectDirectory, benchmarkLib1);
      const indexPath = join(
        projectDirectory,
        benchmarkLib1,
        'src',
        'index.ts',
      );
      writeFileSync(
        indexPath,
        `export * from './lib/${sourceFile.replace('.ts', '')}';\n`,
      );

      const consumerPath = join(
        projectDirectory,
        benchmarkLib1,
        'src',
        'lib',
        'actual-consumer.ts',
      );
      writeFileSync(
        consumerPath,
        `import { sourceForUpdate } from '${lib1Alias}';\nexport const value = sourceForUpdate();\n`,
      );

      // Benchmark the move - should be fast due to early exit on irrelevant files
      const startTime = performance.now();
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${benchmarkLib1}/src/lib/${sourceFile} --project ${benchmarkLib2} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );
      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(
        `Moving file with ${irrelevantFileCount} irrelevant files took: ${duration.toFixed(2)}ms`,
      );

      // Verify the consumer was updated
      const lib2Alias = getProjectImportAlias(projectDirectory, benchmarkLib2);
      expect(readFileSync(consumerPath, 'utf-8')).toContain(lib2Alias);

      // Should be fast because most files are skipped via early exit
      expect(duration).toBeLessThan(60000);
    });
  });
});

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
      stdio: 'inherit',
      env: process.env,
    },
  );
  console.log(`Created benchmark project in "${projectDirectory}"`);

  return projectDirectory;
}
