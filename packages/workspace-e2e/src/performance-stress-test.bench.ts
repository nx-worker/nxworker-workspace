import {
  afterEachIteration,
  beforeAll,
  describe,
  it,
} from '../../../tools/tinybench-utils';
import { uniqueId } from '@internal/test-util';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

/**
 * E2E Performance stress tests for the move-file generator with jscodeshift optimizations.
 *
 * These benchmarks validate that parser reuse, early exit optimization, and single-pass
 * AST traversal provide measurable performance benefits in realistic scenarios:
 * - Many projects (10+)
 * - Many large files (100+ files, 10KB+ each)
 * - Many cross-project dependencies
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
    let utilityContent: string;

    beforeAll(() => {
      const projectCount = 10;
      libs = [];

      // Create multiple projects with short unique names
      const suffix = randomBytes(4).toString('hex');
      for (let i = 0; i < projectCount; i++) {
        const libName = `stress-lib${i}-${suffix}`;
        libs.push(libName);

        execSync(
          `npx nx generate @nx/js:library ${libName} --unitTestRunner=none --bundler=none --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );
      }

      // Create a utility file in the first project
      utilityFile = 'shared-utility.ts';
      utilityContent = generateUtilityModule('sharedUtil', 50);
      const utilityPath = join(
        projectDirectory,
        libs[0],
        'src',
        'lib',
        utilityFile,
      );
      writeFileSync(utilityPath, utilityContent);

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

    afterEachIteration(() => {
      const projectCount = libs.length;
      // Move utility file back to first project
      const movedPath = join(
        projectDirectory,
        libs[projectCount - 1],
        'src',
        'lib',
        utilityFile,
      );
      const originalPath = join(
        projectDirectory,
        libs[0],
        'src',
        'lib',
        utilityFile,
      );

      try {
        writeFileSync(originalPath, utilityContent);
        rmSync(movedPath, { force: true });

        // Reset index file
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
      } catch {
        // File might not have been moved yet, ignore
      }
    });

    it('should efficiently move files across workspace with 10+ projects', () => {
      const projectCount = libs.length;

      execSync(
        `npx nx generate @nxworker/workspace:move-file ${libs[0]}/src/lib/${utilityFile} --project ${libs[projectCount - 1]} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );
    });
  });

  describe('Many large files', () => {
    let sourceLib: string;
    let targetLib: string;
    let targetFile: string;
    let targetFileContent: string;

    beforeAll(() => {
      const fileCount = 100;
      const suffix = randomBytes(4).toString('hex');
      sourceLib = `stress-source-${suffix}`;
      targetLib = `stress-target-${suffix}`;

      // Create source and target libraries
      for (const lib of [sourceLib, targetLib]) {
        execSync(
          `npx nx generate @nx/js:library ${lib} --unitTestRunner=none --bundler=none --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );
      }

      // Create file to be moved
      targetFile = 'large-module.ts';
      targetFileContent = generateLargeTypeScriptFile(500);
      const targetFilePath = join(
        projectDirectory,
        sourceLib,
        'src',
        'lib',
        targetFile,
      );
      writeFileSync(targetFilePath, targetFileContent);

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

      const sourceLibAlias = getProjectImportAlias(projectDirectory, sourceLib);

      // Create many large files in the source library
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
    });

    afterEachIteration(() => {
      // Move file back to source library
      const movedPath = join(
        projectDirectory,
        targetLib,
        'src',
        'lib',
        targetFile,
      );
      const originalPath = join(
        projectDirectory,
        sourceLib,
        'src',
        'lib',
        targetFile,
      );

      try {
        writeFileSync(originalPath, targetFileContent);
        rmSync(movedPath, { force: true });

        // Reset index file
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
      } catch {
        // File might not have been moved yet, ignore
      }
    });

    it('should efficiently process workspace with 100+ large files', () => {
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${sourceLib}/src/lib/${targetFile} --project ${targetLib} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );
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

  execSync(
    `npx --yes create-nx-workspace@${workspaceNxVersion} ${projectName} --preset apps --nxCloud=skip --no-interactive`,
    {
      cwd: dirname(projectDirectory),
      stdio: 'inherit',
      env: process.env,
    },
  );

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
