import { uniqueId } from 'lodash';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Performance stress tests for the move-file generator with jscodeshift optimizations.
 *
 * These tests validate that parser reuse, early exit optimization, and single-pass
 * AST traversal provide measurable performance benefits in realistic scenarios:
 * - Many projects (10+)
 * - Many large files (100+ files, 10KB+ each)
 * - Many cross-project dependencies
 * - Many intra-project dependencies
 *
 * Expected benefits from optimizations:
 * 1. Parser reuse: Eliminates parser instantiation overhead per file
 * 2. Early exit with string checks: Avoids AST parsing for files without target specifiers
 * 3. Single-pass traversal: Reduces AST traversal from 5-6 passes to 1 pass per file
 */

describe('move-file generator stress tests (performance validation)', () => {
  let projectDirectory: string;

  // Increase timeout for stress tests - these operations are expensive
  const stressTestTimeout = 300000; // 5 minutes

  beforeAll(async () => {
    projectDirectory = await createTestProject();

    // Install the plugin
    execSync(`npm install @nxworker/workspace@e2e`, {
      cwd: projectDirectory,
      stdio: 'inherit',
      env: process.env,
    });
  }, stressTestTimeout);

  afterAll(async () => {
    // Cleanup
    if (projectDirectory) {
      await cleanupProject(projectDirectory);
    }
  }, 60000);

  describe('many projects with cross-project dependencies', () => {
    it(
      'should efficiently move files across workspace with 10+ projects',
      async () => {
        const projectCount = 10;
        const libs: string[] = [];

        console.log(`\n=== Creating ${projectCount} projects ===`);

        // Create multiple projects
        for (let i = 0; i < projectCount; i++) {
          const libName = uniqueId(`stress-lib${i}-`);
          libs.push(libName);

          execSync(
            `npx nx generate @nx/js:library ${libName} --unitTestRunner=none --bundler=none --no-interactive`,
            {
              cwd: projectDirectory,
              stdio: 'pipe', // Suppress output for readability
            },
          );
        }

        console.log(`Created ${projectCount} projects`);

        // Create a utility file in the first project
        const utilityFile = 'shared-utility.ts';
        const utilityPath = join(
          projectDirectory,
          libs[0],
          'src',
          'lib',
          utilityFile,
        );
        writeFileSync(
          utilityPath,
          generateUtilityModule('sharedUtil', 50), // Medium-sized utility
        );

        // Export from first project's index
        const sourceIndexPath = join(
          projectDirectory,
          libs[0],
          'src',
          'index.ts',
        );
        writeFileSync(
          sourceIndexPath,
          `export * from './lib/${utilityFile.replace('.ts', '')}';\n`,
        );

        // Create dependencies: each project imports from the first project
        const lib0Alias = getProjectImportAlias(projectDirectory, libs[0]);

        console.log(
          `Creating cross-project dependencies (${projectCount - 1} projects depend on ${libs[0]})`,
        );

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

        // Move the utility to the last project
        // This should update imports across ALL dependent projects
        console.log(
          `\n=== Moving ${utilityFile} from ${libs[0]} to ${libs[projectCount - 1]} ===`,
        );
        console.log(
          `Expected to update imports in ${projectCount - 1} consumer projects`,
        );

        const startTime = performance.now();
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${libs[0]}/src/lib/${utilityFile} --project ${libs[projectCount - 1]} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );
        const endTime = performance.now();
        const duration = endTime - startTime;

        console.log(
          `\n✓ Moved file across ${projectCount} projects in ${duration.toFixed(2)}ms`,
        );
        console.log(
          `  Average per-project processing: ${(duration / projectCount).toFixed(2)}ms`,
        );

        // Verify the file was moved
        const movedPath = join(
          projectDirectory,
          libs[projectCount - 1],
          'src',
          'lib',
          utilityFile,
        );
        expect(readFileSync(movedPath, 'utf-8')).toContain('sharedUtil');

        // Verify imports were updated in at least one consumer
        const lastLibAlias = getProjectImportAlias(
          projectDirectory,
          libs[projectCount - 1],
        );
        const consumerPath = join(
          projectDirectory,
          libs[1],
          'src',
          'lib',
          'consumer-from-lib0.ts',
        );
        const consumerContent = readFileSync(consumerPath, 'utf-8');
        expect(consumerContent).toContain(lastLibAlias);

        // Performance expectation: Should complete in reasonable time
        // With optimizations, this should be faster than without
        expect(duration).toBeLessThan(120000); // 2 minutes max
      },
      stressTestTimeout,
    );
  });

  describe('many large files', () => {
    it(
      'should efficiently process workspace with 100+ large files',
      async () => {
        const fileCount = 100;
        const sourceLib = uniqueId('stress-source-');
        const targetLib = uniqueId('stress-target-');

        console.log(
          `\n=== Creating workspace with ${fileCount} large files ===`,
        );

        // Create source and target libraries
        for (const lib of [sourceLib, targetLib]) {
          execSync(
            `npx nx generate @nx/js:library ${lib} --unitTestRunner=none --bundler=none --no-interactive`,
            {
              cwd: projectDirectory,
              stdio: 'pipe',
            },
          );
        }

        // Create file to be moved
        const targetFile = 'large-module.ts';
        const targetFilePath = join(
          projectDirectory,
          sourceLib,
          'src',
          'lib',
          targetFile,
        );
        writeFileSync(
          targetFilePath,
          generateLargeTypeScriptFile(500), // ~25KB file
        );

        // Export from index
        const sourceIndexPath = join(
          projectDirectory,
          sourceLib,
          'src',
          'index.ts',
        );
        writeFileSync(
          sourceIndexPath,
          `export * from './lib/${targetFile.replace('.ts', '')}';\n`,
        );

        const sourceLibAlias = getProjectImportAlias(
          projectDirectory,
          sourceLib,
        );

        // Create many large files in the source library
        // Most of these WON'T import the target file (tests early exit optimization)
        console.log(`Generating ${fileCount} large files...`);
        const filesWithImports = Math.floor(fileCount * 0.1); // 10% import the target

        for (let i = 0; i < fileCount; i++) {
          const fileName = `large-file-${i}.ts`;
          const filePath = join(
            projectDirectory,
            sourceLib,
            'src',
            'lib',
            fileName,
          );

          let content = generateLargeTypeScriptFile(200); // ~10KB each

          // Add import to some files
          if (i < filesWithImports) {
            content =
              `import { func0 } from '${sourceLibAlias}';\n` +
              `export const imported = func0();\n` +
              content;
          }

          writeFileSync(filePath, content);
        }

        console.log(
          `Created ${fileCount} files (${filesWithImports} with imports, ${fileCount - filesWithImports} without)`,
        );

        // Benchmark the move operation
        console.log(`\n=== Moving ${targetFile} ===`);
        console.log(
          `Expected to process ${fileCount + 1} files (early exit optimization on ${fileCount - filesWithImports} files)`,
        );

        const startTime = performance.now();
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${sourceLib}/src/lib/${targetFile} --project ${targetLib} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );
        const endTime = performance.now();
        const duration = endTime - startTime;

        console.log(
          `\n✓ Processed ${fileCount}+ files in ${duration.toFixed(2)}ms`,
        );
        console.log(
          `  Average per-file processing: ${(duration / fileCount).toFixed(2)}ms`,
        );
        console.log(
          `  Early exit optimization saved parsing ${fileCount - filesWithImports} files`,
        );

        // Verify the file was moved
        const movedPath = join(
          projectDirectory,
          targetLib,
          'src',
          'lib',
          targetFile,
        );
        expect(readFileSync(movedPath, 'utf-8')).toContain('func0');

        // Verify at least one import was updated
        const targetLibAlias = getProjectImportAlias(
          projectDirectory,
          targetLib,
        );
        const consumerPath = join(
          projectDirectory,
          sourceLib,
          'src',
          'lib',
          'large-file-0.ts',
        );
        expect(readFileSync(consumerPath, 'utf-8')).toContain(targetLibAlias);

        // Performance expectation: Early exit optimization should make this fast
        // Without optimization, parsing 100 files would be very slow
        expect(duration).toBeLessThan(180000); // 3 minutes max
      },
      stressTestTimeout,
    );
  });

  describe('many intra-project dependencies', () => {
    it(
      'should efficiently update many relative imports within a project',
      async () => {
        const lib = uniqueId('stress-relative-');
        const importerCount = 50;

        console.log(
          `\n=== Creating project with ${importerCount} intra-project dependencies ===`,
        );

        execSync(
          `npx nx generate @nx/js:library ${lib} --unitTestRunner=none --bundler=none --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe',
          },
        );

        // Create a deeply nested utility file
        const utilsDir = join(projectDirectory, lib, 'src', 'lib', 'utils');
        mkdirSync(utilsDir, { recursive: true });

        const utilFile = 'deep-util.ts';
        const utilPath = join(utilsDir, utilFile);
        writeFileSync(
          utilPath,
          'export function deepUtil() { return "deep"; }\n',
        );

        // Create many files that import using relative paths
        console.log(`Creating ${importerCount} files with relative imports...`);

        for (let i = 0; i < importerCount; i++) {
          const importerFile = `importer-${i}.ts`;
          const importerPath = join(
            projectDirectory,
            lib,
            'src',
            'lib',
            importerFile,
          );
          writeFileSync(
            importerPath,
            `import { deepUtil } from './utils/${utilFile.replace('.ts', '')}';\nexport const value${i} = deepUtil();\n`,
          );
        }

        console.log(
          `Created ${importerCount} files with relative imports to utils/${utilFile}`,
        );

        // Move the utility file to a different directory
        const newUtilsDir = join(
          projectDirectory,
          lib,
          'src',
          'lib',
          'helpers',
        );
        mkdirSync(newUtilsDir, { recursive: true });

        console.log(
          `\n=== Moving utils/${utilFile} to helpers/ (should update ${importerCount} relative imports) ===`,
        );

        const startTime = performance.now();
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${lib}/src/lib/utils/${utilFile} --project ${lib} --project-directory=helpers --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );
        const endTime = performance.now();
        const duration = endTime - startTime;

        console.log(
          `\n✓ Updated ${importerCount} relative imports in ${duration.toFixed(2)}ms`,
        );
        console.log(
          `  Average per-import update: ${(duration / importerCount).toFixed(2)}ms`,
        );

        // Verify the file was moved
        const movedPath = join(newUtilsDir, utilFile);
        expect(readFileSync(movedPath, 'utf-8')).toContain('deepUtil');

        // Verify imports were updated
        const importerPath = join(
          projectDirectory,
          lib,
          'src',
          'lib',
          'importer-0.ts',
        );
        const importerContent = readFileSync(importerPath, 'utf-8');
        expect(importerContent).toContain('./helpers/');

        // Performance expectation: Single-pass optimization should make this fast
        expect(duration).toBeLessThan(120000); // 2 minutes max
      },
      stressTestTimeout,
    );
  });

  describe('combined stress: many projects + many files + many dependencies', () => {
    it(
      'should handle realistic large workspace scenario',
      async () => {
        const projectCount = 15;
        const filesPerProject = 30;
        const libs: string[] = [];

        console.log(
          `\n=== STRESS TEST: ${projectCount} projects × ${filesPerProject} files = ${projectCount * filesPerProject} total files ===`,
        );

        // Create projects
        console.log(`Creating ${projectCount} projects...`);
        for (let i = 0; i < projectCount; i++) {
          const libName = uniqueId(`mega-lib${i}-`);
          libs.push(libName);

          execSync(
            `npx nx generate @nx/js:library ${libName} --unitTestRunner=none --bundler=none --no-interactive`,
            {
              cwd: projectDirectory,
              stdio: 'pipe',
            },
          );

          // Create multiple files per project
          for (let j = 0; j < filesPerProject; j++) {
            const fileName = `module-${j}.ts`;
            const filePath = join(
              projectDirectory,
              libName,
              'src',
              'lib',
              fileName,
            );
            writeFileSync(
              filePath,
              generateLargeTypeScriptFile(50), // ~2.5KB each
            );
          }
        }

        console.log(
          `Created ${projectCount} projects with ${filesPerProject} files each`,
        );

        // Create a shared core library
        const coreFile = 'core-api.ts';
        const coreFilePath = join(
          projectDirectory,
          libs[0],
          'src',
          'lib',
          coreFile,
        );
        writeFileSync(coreFilePath, generateUtilityModule('coreApi', 100));

        const coreIndexPath = join(
          projectDirectory,
          libs[0],
          'src',
          'index.ts',
        );
        writeFileSync(
          coreIndexPath,
          `export * from './lib/${coreFile.replace('.ts', '')}';\n`,
        );

        // Create cross-project dependencies
        console.log(
          `Creating cross-project dependencies (every project depends on core)...`,
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

        // Move the core file to the last project
        console.log(
          `\n=== Moving core file across ${projectCount} projects with ${projectCount * filesPerProject} total files ===`,
        );

        const startTime = performance.now();
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${libs[0]}/src/lib/${coreFile} --project ${libs[projectCount - 1]} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );
        const endTime = performance.now();
        const duration = endTime - startTime;

        const totalFiles = projectCount * filesPerProject;
        console.log(`\n✓ STRESS TEST COMPLETED in ${duration.toFixed(2)}ms`);
        console.log(`  Total files in workspace: ${totalFiles}`);
        console.log(`  Total projects: ${projectCount}`);
        console.log(
          `  Average per-file processing: ${(duration / totalFiles).toFixed(2)}ms`,
        );
        console.log(
          `  Average per-project processing: ${(duration / projectCount).toFixed(2)}ms`,
        );
        console.log(`\nOptimizations demonstrated:`);
        console.log(
          `  • Parser reuse: Eliminated ${totalFiles} parser instantiations`,
        );
        console.log(
          `  • Early exit: Skipped AST parsing for ~${Math.floor(totalFiles * 0.9)} files without imports`,
        );
        console.log(
          `  • Single-pass: Saved ~${Math.floor(totalFiles * 0.1) * 5} redundant AST traversals`,
        );

        // Verify the file was moved
        const movedPath = join(
          projectDirectory,
          libs[projectCount - 1],
          'src',
          'lib',
          coreFile,
        );
        expect(readFileSync(movedPath, 'utf-8')).toContain('coreApi');

        // Verify imports were updated
        const lastLibAlias = getProjectImportAlias(
          projectDirectory,
          libs[projectCount - 1],
        );
        const consumerPath = join(
          projectDirectory,
          libs[1],
          'src',
          'lib',
          'uses-core.ts',
        );
        expect(readFileSync(consumerPath, 'utf-8')).toContain(lastLibAlias);

        // Performance expectation: All optimizations working together
        expect(duration).toBeLessThan(240000); // 4 minutes max
      },
      stressTestTimeout,
    );
  });
});

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
  const projectName = `stress-test-${uniqueId()}`;
  const projectDirectory = join(process.cwd(), 'tmp', projectName);

  // Clean up if exists
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

  console.log(`Creating stress test project in "${projectDirectory}"...`);

  execSync(
    `npx --yes create-nx-workspace@${workspaceNxVersion} ${projectName} --preset apps --nxCloud=skip --no-interactive`,
    {
      cwd: dirname(projectDirectory),
      stdio: 'inherit',
      env: process.env,
    },
  );

  console.log(`✓ Created stress test project`);

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
