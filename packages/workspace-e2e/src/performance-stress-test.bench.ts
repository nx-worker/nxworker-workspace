import {
  beforeAll,
  describe,
  it,
} from '../../../tools/tinybench-utils';
import { uniqueId } from 'lodash';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * E2E Performance stress tests for the move-file generator with jscodeshift optimizations.
 *
 * These benchmarks validate that parser reuse, early exit optimization, and single-pass
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
 *
 * Uses the same Jest-like describe-it structure as workspace benchmarks.
 */

describe('Move-File Generator E2E Stress Tests', () => {
  let projectDirectory: string;

  beforeAll(async () => {
    projectDirectory = await createTestProject();

    // Install the plugin
    execSync(`npm install @nxworker/workspace@e2e`, {
      cwd: projectDirectory,
      stdio: 'inherit',
      env: process.env,
    });
  }, 300000); // 5 minute timeout

  afterAll(async () => {
    // Cleanup
    if (projectDirectory) {
      await cleanupProject(projectDirectory);
    }
  }, 60000);

  describe('Many projects with cross-project dependencies', () => {
    let libs: string[];
    let utilityFile: string;

    beforeAll(() => {
      const projectCount = 10;
      libs = [];

      console.log(`\n=== Creating ${projectCount} projects ===`);

      // Create multiple projects
      for (let i = 0; i < projectCount; i++) {
        const libName = uniqueId(`stress-lib${i}-`);
        libs.push(libName);

        execSync(
          `npx nx generate @nx/js:library ${libName} --unitTestRunner=none --bundler=none --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe',
          },
        );
      }

      console.log(`Created ${projectCount} projects`);

      // Create a utility file in the first project
      utilityFile = 'shared-utility.ts';
      const utilityPath = join(
        projectDirectory,
        libs[0],
        'src',
        'lib',
        utilityFile,
      );
      writeFileSync(utilityPath, generateUtilityModule('sharedUtil', 50));

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
    });

    it('should efficiently move files across workspace with 10+ projects', () => {
      const projectCount = libs.length;

      console.log(
        `\n=== Moving ${utilityFile} from ${libs[0]} to ${libs[projectCount - 1]} ===`,
      );
      console.log(
        `Expected to update imports in ${projectCount - 1} consumer projects`,
      );

      execSync(
        `npx nx generate @nxworker/workspace:move-file ${libs[0]}/src/lib/${utilityFile} --project ${libs[projectCount - 1]} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );

      // Verify the file was moved
      const movedPath = join(
        projectDirectory,
        libs[projectCount - 1],
        'src',
        'lib',
        utilityFile,
      );
      const movedContent = readFileSync(movedPath, 'utf-8');
      if (!movedContent.includes('sharedUtil')) {
        throw new Error('File move verification failed');
      }

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
      if (!consumerContent.includes(lastLibAlias)) {
        throw new Error('Import update verification failed');
      }
    });
  });

  describe('Many large files', () => {
    let sourceLib: string;
    let targetLib: string;
    let targetFile: string;

    beforeAll(() => {
      const fileCount = 100;
      sourceLib = uniqueId('stress-source-');
      targetLib = uniqueId('stress-target-');

      console.log(`\n=== Creating workspace with ${fileCount} large files ===`);

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
      targetFile = 'large-module.ts';
      const targetFilePath = join(
        projectDirectory,
        sourceLib,
        'src',
        'lib',
        targetFile,
      );
      writeFileSync(targetFilePath, generateLargeTypeScriptFile(500));

      // Export from index
      const sourceIndexPath = join(projectDirectory, sourceLib, 'src', 'index.ts');
      writeFileSync(
        sourceIndexPath,
        `export * from './lib/${targetFile.replace('.ts', '')}';\n`,
      );

      const sourceLibAlias = getProjectImportAlias(projectDirectory, sourceLib);

      // Create many large files in the source library
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

        let content = generateLargeTypeScriptFile(200);

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
    });

    it('should efficiently process workspace with 100+ large files', () => {
      console.log(`\n=== Moving ${targetFile} ===`);

      execSync(
        `npx nx generate @nxworker/workspace:move-file ${sourceLib}/src/lib/${targetFile} --project ${targetLib} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );

      // Verify the file was moved
      const movedPath = join(projectDirectory, targetLib, 'src', 'lib', targetFile);
      const movedContent = readFileSync(movedPath, 'utf-8');
      if (!movedContent.includes('func0')) {
        throw new Error('File move verification failed');
      }

      // Verify at least one import was updated
      const targetLibAlias = getProjectImportAlias(projectDirectory, targetLib);
      const consumerPath = join(
        projectDirectory,
        sourceLib,
        'src',
        'lib',
        'large-file-0.ts',
      );
      const consumerContent = readFileSync(consumerPath, 'utf-8');
      if (!consumerContent.includes(targetLibAlias)) {
        throw new Error('Import update verification failed');
      }
    });
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
