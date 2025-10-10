import { uniqueId } from 'lodash';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Performance benchmark tests for the move-file generator.
 * These tests measure the execution time of the generator with various
 * file sizes and counts to validate the jscodeshift performance optimizations.
 *
 * The tests are organized into the following categories:
 *
 * 1. Single file operations - Tests with different file sizes (small, medium, large)
 * 2. Multiple file operations - Tests with multiple files and many imports
 * 3. Import update performance - Tests early exit optimization with irrelevant files
 * 4. Complex workspace scenarios - Comprehensive tests simulating realistic large workspaces:
 *    - Many projects (10+ projects with cross-project dependencies)
 *    - Many large files (100+ files with 500+ lines each)
 *    - Complex cross-project dependency graph (8 projects in chain)
 *    - Complex intra-project dependencies (50 files, 5 dependency levels)
 *    - Realistic large workspace (combines all factors)
 *
 * These benchmarks validate that the jscodeshift optimizations (early exit via string
 * pre-filtering, single-pass AST traversal, parser reuse) deliver measurable benefits
 * in scenarios that closely match real-world usage.
 *
 * Each test outputs timing information and includes performance expectations to help
 * identify regressions.
 */

describe('move-file generator performance benchmarks', () => {
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

  describe('complex workspace scenarios', () => {
    it('should efficiently handle workspace with many projects (10+)', () => {
      const projectCount = 10;
      const projects: string[] = [];

      console.log(`Creating ${projectCount} projects...`);

      // Create many projects
      for (let i = 0; i < projectCount; i++) {
        const projectName = uniqueId(`many-proj-${i}-`);
        projects.push(projectName);
        execSync(
          `npx nx generate @nx/js:library ${projectName} --unitTestRunner=none --bundler=none --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe', // Reduce output noise
          },
        );
      }

      console.log(
        `Created ${projectCount} projects, setting up dependencies...`,
      );

      // Create a source file in the first project
      const sourceFile = 'shared-util.ts';
      writeFileSync(
        join(projectDirectory, projects[0], 'src', 'lib', sourceFile),
        'export function sharedUtil() { return "shared"; }\n',
      );

      // Export from index
      const indexPath = join(projectDirectory, projects[0], 'src', 'index.ts');
      writeFileSync(
        indexPath,
        `export * from './lib/${sourceFile.replace('.ts', '')}';\n`,
      );

      // Create cross-project dependencies: each project imports from project[0]
      const project0Alias = getProjectImportAlias(
        projectDirectory,
        projects[0],
      );
      for (let i = 1; i < projectCount; i++) {
        const consumerFile = 'consumer.ts';
        writeFileSync(
          join(projectDirectory, projects[i], 'src', 'lib', consumerFile),
          `import { sharedUtil } from '${project0Alias}';\nexport const value = sharedUtil();\n`,
        );
      }

      console.log(
        `Setup complete. Benchmarking move with ${projectCount} projects...`,
      );

      // Benchmark moving the source file (should update all consumers across projects)
      const startTime = performance.now();
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${projects[0]}/src/lib/${sourceFile} --project ${projects[1]} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );
      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(
        `Moving file across ${projectCount} projects took: ${duration.toFixed(2)}ms`,
      );

      // Verify source was moved
      const movedPath = join(
        projectDirectory,
        projects[1],
        'src',
        'lib',
        sourceFile,
      );
      expect(readFileSync(movedPath, 'utf-8')).toContain('sharedUtil');

      // Verify at least one consumer was updated
      const project1Alias = getProjectImportAlias(
        projectDirectory,
        projects[1],
      );
      const consumerPath = join(
        projectDirectory,
        projects[2],
        'src',
        'lib',
        'consumer.ts',
      );
      expect(readFileSync(consumerPath, 'utf-8')).toContain(project1Alias);

      // Should handle many projects efficiently
      expect(duration).toBeLessThan(120000); // 2 minutes for 10 projects
    });

    it('should efficiently handle many large files (100+ files with 500+ lines each)', () => {
      const fileCount = 100;
      const linesPerFile = 500;

      console.log(`Creating ${fileCount} large files...`);

      // Create many large files in benchmarkLib1
      for (let i = 0; i < fileCount; i++) {
        const fileName = `large-${i}.ts`;
        const content = generateLargeTypeScriptFile(linesPerFile);
        writeFileSync(
          join(projectDirectory, benchmarkLib1, 'src', 'lib', fileName),
          content,
        );
      }

      // Create a source file that will be moved
      const sourceFile = 'source-in-many-files.ts';
      writeFileSync(
        join(projectDirectory, benchmarkLib1, 'src', 'lib', sourceFile),
        'export function sourceInManyFiles() { return "source"; }\n',
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

      // Create a consumer that imports the source
      const lib1Alias = getProjectImportAlias(projectDirectory, benchmarkLib1);
      const consumerFile = 'consumer-in-many.ts';
      writeFileSync(
        join(projectDirectory, benchmarkLib1, 'src', 'lib', consumerFile),
        `import { sourceInManyFiles } from '${lib1Alias}';\nexport const value = sourceInManyFiles();\n`,
      );

      console.log(
        `Created ${fileCount} files with ~${linesPerFile} lines each. Benchmarking move...`,
      );

      // Benchmark the move - should be fast due to early exit on files without imports
      const startTime = performance.now();
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${benchmarkLib1}/src/lib/${sourceFile} --project ${benchmarkLib2} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );
      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(
        `Moving file with ${fileCount} large files in workspace took: ${duration.toFixed(2)}ms`,
      );

      // Verify source was moved
      const movedPath = join(
        projectDirectory,
        benchmarkLib2,
        'src',
        'lib',
        sourceFile,
      );
      expect(readFileSync(movedPath, 'utf-8')).toContain('sourceInManyFiles');

      // Verify consumer was updated
      const lib2Alias = getProjectImportAlias(projectDirectory, benchmarkLib2);
      const consumerPath = join(
        projectDirectory,
        benchmarkLib1,
        'src',
        'lib',
        consumerFile,
      );
      expect(readFileSync(consumerPath, 'utf-8')).toContain(lib2Alias);

      // Should handle many large files efficiently due to early exit optimization
      expect(duration).toBeLessThan(120000); // 2 minutes for 100 files
    });

    it('should efficiently handle complex cross-project dependency graph', () => {
      const projectCount = 8;
      const projects: string[] = [];

      console.log(
        `Creating ${projectCount} projects with cross-project dependencies...`,
      );

      // Create projects
      for (let i = 0; i < projectCount; i++) {
        const projectName = uniqueId(`cross-dep-${i}-`);
        projects.push(projectName);
        execSync(
          `npx nx generate @nx/js:library ${projectName} --unitTestRunner=none --bundler=none --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe',
          },
        );
      }

      // Create utility files in each project and set up cross-dependencies
      // Project i depends on project i-1 (chain dependency)
      for (let i = 0; i < projectCount; i++) {
        const utilFile = `util-${i}.ts`;
        writeFileSync(
          join(projectDirectory, projects[i], 'src', 'lib', utilFile),
          `export function util${i}() { return ${i}; }\n`,
        );

        // Export from index
        const indexPath = join(
          projectDirectory,
          projects[i],
          'src',
          'index.ts',
        );
        writeFileSync(
          indexPath,
          `export * from './lib/${utilFile.replace('.ts', '')}';\n`,
        );

        // If not the first project, create a dependency on the previous project
        if (i > 0) {
          const prevProjectAlias = getProjectImportAlias(
            projectDirectory,
            projects[i - 1],
          );
          const consumerFile = `consumer-${i}.ts`;
          writeFileSync(
            join(projectDirectory, projects[i], 'src', 'lib', consumerFile),
            `import { util${i - 1} } from '${prevProjectAlias}';\nexport const value${i} = util${i - 1}();\n`,
          );
        }
      }

      console.log(
        `Setup complete. Benchmarking move in complex dependency graph...`,
      );

      // Move a file from the middle of the chain
      const middleIndex = Math.floor(projectCount / 2);
      const sourceFile = `util-${middleIndex}.ts`;

      const startTime = performance.now();
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${projects[middleIndex]}/src/lib/${sourceFile} --project ${projects[middleIndex + 1]} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );
      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(
        `Moving file in complex dependency graph (${projectCount} projects) took: ${duration.toFixed(2)}ms`,
      );

      // Verify source was moved
      const movedPath = join(
        projectDirectory,
        projects[middleIndex + 1],
        'src',
        'lib',
        sourceFile,
      );
      expect(readFileSync(movedPath, 'utf-8')).toContain(`util${middleIndex}`);

      // Verify dependent was updated (if exists)
      if (middleIndex + 1 < projectCount - 1) {
        const targetAlias = getProjectImportAlias(
          projectDirectory,
          projects[middleIndex + 1],
        );
        const dependentPath = join(
          projectDirectory,
          projects[middleIndex + 2],
          'src',
          'lib',
          `consumer-${middleIndex + 2}.ts`,
        );
        expect(readFileSync(dependentPath, 'utf-8')).toContain(targetAlias);
      }

      expect(duration).toBeLessThan(90000); // 90 seconds for complex graph
    });

    it('should efficiently handle complex intra-project dependencies', () => {
      const fileCount = 50;
      const depthLevels = 5;

      console.log(
        `Creating ${fileCount} files with ${depthLevels} levels of intra-project dependencies...`,
      );

      // Create a pyramid of dependencies within benchmarkLib1
      // Level 0: 1 base file
      // Level 1: files that import from level 0
      // Level 2: files that import from level 1, etc.

      const filesByLevel: string[][] = [];

      for (let level = 0; level < depthLevels; level++) {
        const filesInLevel: string[] = [];
        const filesInThisLevel = Math.ceil(fileCount / depthLevels);

        for (let i = 0; i < filesInThisLevel; i++) {
          const fileName = `level-${level}-file-${i}.ts`;
          filesInLevel.push(fileName);

          let content = '';
          if (level === 0) {
            // Base level - no imports
            content = `export function level${level}File${i}() { return '${level}-${i}'; }\n`;
          } else {
            // Import from a file in the previous level
            const prevFileName = filesByLevel[level - 1][
              i % filesByLevel[level - 1].length
            ].replace('.ts', '');
            content = `import { level${level - 1}File${i % filesByLevel[level - 1].length} } from './${prevFileName}';\nexport function level${level}File${i}() { return level${level - 1}File${i % filesByLevel[level - 1].length}(); }\n`;
          }

          writeFileSync(
            join(projectDirectory, benchmarkLib1, 'src', 'lib', fileName),
            content,
          );
        }

        filesByLevel.push(filesInLevel);
      }

      console.log(
        `Created ${depthLevels} levels of dependencies. Benchmarking move...`,
      );

      // Move a file from the middle level
      const middleLevel = Math.floor(depthLevels / 2);
      const sourceFile = filesByLevel[middleLevel][0];

      const startTime = performance.now();
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${benchmarkLib1}/src/lib/${sourceFile} --project ${benchmarkLib2} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );
      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(
        `Moving file with ${fileCount} intra-project dependencies (${depthLevels} levels) took: ${duration.toFixed(2)}ms`,
      );

      // Verify source was moved
      const movedPath = join(
        projectDirectory,
        benchmarkLib2,
        'src',
        'lib',
        sourceFile,
      );
      expect(readFileSync(movedPath, 'utf-8')).toContain(
        `level${middleLevel}File0`,
      );

      // Verify at least one dependent was updated
      if (middleLevel + 1 < depthLevels) {
        const dependentFile = filesByLevel[middleLevel + 1][0];
        const dependentPath = join(
          projectDirectory,
          benchmarkLib1,
          'src',
          'lib',
          dependentFile,
        );
        const dependentContent = readFileSync(dependentPath, 'utf-8');
        // Should now import from the target project
        const lib2Alias = getProjectImportAlias(
          projectDirectory,
          benchmarkLib2,
        );
        expect(dependentContent).toContain(lib2Alias);
      }

      expect(duration).toBeLessThan(90000); // 90 seconds for complex intra-dependencies
    });

    it('should efficiently handle realistic large workspace scenario', () => {
      const projectCount = 6;
      const filesPerProject = 30;
      const linesPerFile = 200;

      console.log(
        `Creating realistic workspace: ${projectCount} projects, ${filesPerProject} files each, ${linesPerFile} lines per file...`,
      );

      const projects: string[] = [];

      // Create projects
      for (let i = 0; i < projectCount; i++) {
        const projectName = uniqueId(`realistic-${i}-`);
        projects.push(projectName);
        execSync(
          `npx nx generate @nx/js:library ${projectName} --unitTestRunner=none --bundler=none --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe',
          },
        );
      }

      // Create files in each project
      for (let i = 0; i < projectCount; i++) {
        for (let f = 0; f < filesPerProject; f++) {
          const fileName = `file-${f}.ts`;
          const content = generateLargeTypeScriptFile(linesPerFile);
          writeFileSync(
            join(projectDirectory, projects[i], 'src', 'lib', fileName),
            content,
          );
        }

        // Create one exported utility per project
        const utilFile = `util-${i}.ts`;
        writeFileSync(
          join(projectDirectory, projects[i], 'src', 'lib', utilFile),
          `export function util${i}() { return ${i}; }\n`,
        );

        const indexPath = join(
          projectDirectory,
          projects[i],
          'src',
          'index.ts',
        );
        writeFileSync(
          indexPath,
          `export * from './lib/${utilFile.replace('.ts', '')}';\n`,
        );
      }

      // Create cross-project dependencies
      for (let i = 1; i < projectCount; i++) {
        const prevProjectAlias = getProjectImportAlias(
          projectDirectory,
          projects[i - 1],
        );
        const consumerFile = `consumer.ts`;
        writeFileSync(
          join(projectDirectory, projects[i], 'src', 'lib', consumerFile),
          `import { util${i - 1} } from '${prevProjectAlias}';\nexport const value = util${i - 1}();\n`,
        );
      }

      console.log(
        `Created realistic workspace with ${projectCount * filesPerProject} total files. Benchmarking move...`,
      );

      // Move a utility file
      const sourceFile = `util-2.ts`;

      const startTime = performance.now();
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${projects[2]}/src/lib/${sourceFile} --project ${projects[3]} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );
      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(
        `Moving file in realistic workspace (${projectCount * filesPerProject} files, ${projectCount} projects) took: ${duration.toFixed(2)}ms`,
      );

      // Verify source was moved
      const movedPath = join(
        projectDirectory,
        projects[3],
        'src',
        'lib',
        sourceFile,
      );
      expect(readFileSync(movedPath, 'utf-8')).toContain('util2');

      // Verify dependent was updated
      const targetAlias = getProjectImportAlias(projectDirectory, projects[3]);
      const dependentPath = join(
        projectDirectory,
        projects[3],
        'src',
        'lib',
        'consumer.ts',
      );
      expect(readFileSync(dependentPath, 'utf-8')).toContain(targetAlias);

      // Should handle realistic workspace efficiently
      expect(duration).toBeLessThan(180000); // 3 minutes for realistic scenario
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
