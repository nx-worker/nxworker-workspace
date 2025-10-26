import { benchmarkSuite } from '../../../../tools/tinybench-utils';
import { uniqueId } from 'lodash';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';

/**
 * E2E benchmarks for multi-project operations.
 * These benchmarks measure performance of the move-file generator
 * in complex scenarios with multiple projects and dependencies.
 */

let projectDirectory: string;
let libs: string[] = [];

benchmarkSuite(
  'E2E Multi-Project Operations',
  {
    'Move exported file with cross-project imports': () => {
      const utilFileName = `shared-${uniqueId()}.ts`;
      const utilPath = join(
        projectDirectory,
        libs[0],
        'src',
        'lib',
        utilFileName,
      );

      // Create utility file
      writeFileSync(
        utilPath,
        'export function sharedUtil() { return "shared"; }\n',
      );

      // Export from source project's index
      const sourceIndexPath = join(projectDirectory, libs[0], 'src', 'index.ts');
      writeFileSync(
        sourceIndexPath,
        `export * from './lib/${utilFileName.replace('.ts', '')}';\n`,
      );

      // Get project aliases
      const sourceAlias = getProjectImportAlias(projectDirectory, libs[0]);
      const targetAlias = getProjectImportAlias(projectDirectory, libs[1]);

      // Create consumer file in another project
      const consumerPath = join(
        projectDirectory,
        libs[2],
        'src',
        'lib',
        `consumer-${uniqueId()}.ts`,
      );
      writeFileSync(
        consumerPath,
        `import { sharedUtil } from '${sourceAlias}';\nexport const value = sharedUtil();\n`,
      );

      // Execute move operation
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${libs[0]}/src/lib/${utilFileName} --project ${libs[1]} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );

      // Cleanup for next iteration
      const movedPath = join(
        projectDirectory,
        libs[1],
        'src',
        'lib',
        utilFileName,
      );
      rmSync(movedPath, { force: true });
      rmSync(consumerPath, { force: true });
      writeFileSync(sourceIndexPath, '');
      writeFileSync(join(projectDirectory, libs[1], 'src', 'index.ts'), '');
    },

    'Move file in workspace with 5 projects': {
      fn: () => {
        const fileName = `multi-${uniqueId()}.ts`;
        const filePath = join(projectDirectory, libs[0], 'src', 'lib', fileName);

        // Create file
        writeFileSync(filePath, 'export function multiUtil() { return "multi"; }\n');

        // Execute move operation
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${libs[0]}/src/lib/${fileName} --project ${libs[1]} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe',
          },
        );

        // Cleanup for next iteration
        const movedPath = join(projectDirectory, libs[1], 'src', 'lib', fileName);
        rmSync(movedPath, { force: true });
      },
      warmup: true,
      warmupIterations: 2,
    },

    'Move file with glob pattern (3 files)': () => {
      const baseFileName = `glob-${uniqueId()}`;

      // Create 3 test files
      for (let i = 0; i < 3; i++) {
        const fileName = `${baseFileName}-${i}.spec.ts`;
        const filePath = join(projectDirectory, libs[0], 'src', 'lib', fileName);
        writeFileSync(filePath, `export const test${i} = "test";\n`);
      }

      // Execute move operation with glob pattern
      execSync(
        `npx nx generate @nxworker/workspace:move-file "${libs[0]}/src/lib/${baseFileName}-*.spec.ts" --project ${libs[1]} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'pipe',
        },
      );

      // Cleanup for next iteration
      for (let i = 0; i < 3; i++) {
        const movedPath = join(
          projectDirectory,
          libs[1],
          'src',
          'lib',
          `${baseFileName}-${i}.spec.ts`,
        );
        rmSync(movedPath, { force: true });
      }
    },
  },
  {
    setupSuite() {
      // Create test project and install plugin
      const projectName = `multi-bench-${uniqueId()}`;
      projectDirectory = join(process.cwd(), 'tmp', projectName);

      // Clean directory if exists
      rmSync(projectDirectory, { recursive: true, force: true });
      mkdirSync(dirname(projectDirectory), { recursive: true });

      // Create workspace
      execSync(
        `npx --yes create-nx-workspace@latest ${projectName} --preset apps --nxCloud=skip --no-interactive`,
        {
          cwd: dirname(projectDirectory),
          stdio: 'pipe',
          env: process.env,
        },
      );

      // Install the plugin
      execSync(`npm install @nxworker/workspace@e2e --prefer-offline`, {
        cwd: projectDirectory,
        stdio: 'pipe',
        env: process.env,
      });

      // Create 5 libraries
      for (let i = 0; i < 5; i++) {
        const libName = `multi-lib${i}-${uniqueId()}`;
        libs.push(libName);

        execSync(
          `npx nx generate @nx/js:library ${libName} --unitTestRunner=none --bundler=none --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe',
          },
        );
      }
    },
    teardownSuite() {
      // Cleanup test project
      if (projectDirectory) {
        rmSync(projectDirectory, { recursive: true, force: true });
      }
    },
  },
);

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
      pathEntries.some((entry: string) =>
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
