import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

describe('workspace', () => {
  let projectDirectory: string;
  let libNames: Record<string, string>;
  function uniqueId() {
    return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  }
  beforeAll(async () => {
    projectDirectory = await createTestProject();
    libNames = {
      lib1: `lib-${uniqueId()}`,
      lib2: `lib-${uniqueId()}`,
      lib3: `lib-${uniqueId()}`,
      lib4: `lib-${uniqueId()}`,
      lib5: `lib-${uniqueId()}`,
    };

    // The plugin has been built and published to a local registry in the jest globalSetup
    // Install the plugin built with the latest source code into the test repo
    execSync(`npm install @nxworker/workspace@e2e`, {
      cwd: projectDirectory,
      stdio: 'inherit',
      env: process.env,
    });
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
          if (err.code === 'EBUSY' || err.code === 'ENOTEMPTY') {
            attempts++;
            await sleep(delay);
          } else {
            throw err;
          }
        }
      }
    }
  });

  it('should be installed', () => {
    // npm ls will fail if the package is not installed properly
    execSync('npm ls @nxworker/workspace', {
      cwd: projectDirectory,
      stdio: 'inherit',
    });
  });

  describe('move-file generator', () => {
    it('should move a file between projects', () => {
      // Create two library projects
      execSync(
        `npx nx generate @nx/js:library ${libNames.lib1} --unitTestRunner=none --bundler=none --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      execSync(
        `npx nx generate @nx/js:library ${libNames.lib2} --unitTestRunner=none --bundler=none --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      // Create a file in lib1
      const helperPath = join(
        projectDirectory,
        libNames.lib1,
        'src',
        'lib',
        'helper.ts',
      );
      mkdirSync(dirname(helperPath), { recursive: true });
      writeFileSync(
        helperPath,
        'export function helper() { return "hello"; }\n',
      );

      // Create a file that imports the helper
      const mainPath = join(
        projectDirectory,
        libNames.lib1,
        'src',
        'lib',
        'main.ts',
      );
      writeFileSync(
        mainPath,
        "import { helper } from './helper';\n\nexport const result = helper();\n",
      );

      // Run the move-file generator
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${libNames.lib1}/src/lib/helper.ts ${libNames.lib2}/src/lib/helper.ts --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      // Verify the file was moved
      const movedPath = join(
        projectDirectory,
        libNames.lib2,
        'src',
        'lib',
        'helper.ts',
      );
      expect(readFileSync(movedPath, 'utf-8')).toContain(
        'export function helper()',
      );

      // Verify original file is deleted
      const originalPath = join(
        projectDirectory,
        libNames.lib1,
        'src',
        'lib',
        'helper.ts',
      );
      expect(() => readFileSync(originalPath, 'utf-8')).toThrow();
    });

    it('should update imports when moving exported files', () => {
      // Create two library projects
      execSync(
        `npx nx generate @nx/js:library ${libNames.lib3} --unitTestRunner=none --bundler=none --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      execSync(
        `npx nx generate @nx/js:library ${libNames.lib4} --unitTestRunner=none --bundler=none --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      const sourceAlias = getProjectImportAlias(
        projectDirectory,
        libNames.lib3,
      );
      const targetAlias = getProjectImportAlias(
        projectDirectory,
        libNames.lib4,
      );

      // Create and export a file in lib3
      const utilPath = join(
        projectDirectory,
        libNames.lib3,
        'src',
        'lib',
        'util.ts',
      );
      mkdirSync(dirname(utilPath), { recursive: true });
      writeFileSync(utilPath, 'export function util() { return "utility"; }\n');

      // Export from index
      const indexPath = join(
        projectDirectory,
        libNames.lib3,
        'src',
        'index.ts',
      );
      writeFileSync(indexPath, "export * from './lib/util';\n");

      // Create consuming files in another lib
      const consumerPath = join(
        projectDirectory,
        libNames.lib1,
        'src',
        'lib',
        'consumer.ts',
      );
      writeFileSync(
        consumerPath,
        `import { util } from '${sourceAlias}';\nexport const value = util();\n`,
      );

      const lazyConsumerPath = join(
        projectDirectory,
        libNames.lib1,
        'src',
        'lib',
        'lazy-consumer.ts',
      );
      writeFileSync(
        lazyConsumerPath,
        `export const loadUtil = () => import('${sourceAlias}').then((m) => m.util);\n`,
      );

      // Run the move-file generator
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${libNames.lib3}/src/lib/util.ts ${libNames.lib4}/src/lib/util.ts --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      // Verify the file was moved
      const movedUtilPath = join(
        projectDirectory,
        libNames.lib4,
        'src',
        'lib',
        'util.ts',
      );
      expect(readFileSync(movedUtilPath, 'utf-8')).toContain(
        'export function util()',
      );

      // Verify imports were updated in consuming files
      const consumerContent = readFileSync(consumerPath, 'utf-8');
      expect(consumerContent).toContain(targetAlias);

      const lazyConsumerContent = readFileSync(lazyConsumerPath, 'utf-8');
      const normalizedLazyConsumerContent = lazyConsumerContent.replace(
        /\s+/g,
        '',
      );
      expect(normalizedLazyConsumerContent).toContain(
        `import('${targetAlias}').then((m)=>m.util);`,
      );
    });

    it('should handle relative imports within same project', () => {
      // Create a new library
      execSync(
        `npx nx generate @nx/js:library ${libNames.lib5} --unitTestRunner=none --bundler=none --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      const featurePath = join(
        projectDirectory,
        libNames.lib5,
        'src',
        'lib',
        'feature.ts',
      );
      writeFileSync(
        featurePath,
        'export function feature() { return "feature"; }\n',
      );

      const servicePath = join(
        projectDirectory,
        libNames.lib5,
        'src',
        'lib',
        'service.ts',
      );
      writeFileSync(
        servicePath,
        "import { feature } from './feature';\nexport function service() { return feature(); }\n",
      );

      const lazyPath = join(
        projectDirectory,
        libNames.lib5,
        'src',
        'lib',
        'lazy.ts',
      );
      writeFileSync(
        lazyPath,
        "export const loadFeature = () => import('./feature').then((m) => m.feature);\n",
      );

      // Move to subdirectory within same project
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${libNames.lib5}/src/lib/feature.ts ${libNames.lib5}/src/lib/features/feature.ts --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      // Verify file was moved
      const movedFeaturePath = join(
        projectDirectory,
        libNames.lib5,
        'src',
        'lib',
        'features',
        'feature.ts',
      );
      expect(readFileSync(movedFeaturePath, 'utf-8')).toContain(
        'export function feature()',
      );

      // Verify imports were updated
      const serviceContent = readFileSync(servicePath, 'utf-8');
      expect(serviceContent).toMatch(/from ['"]\.\/features\/feature['"]/);

      const lazyContent = readFileSync(lazyPath, 'utf-8');
      expect(lazyContent).toContain(
        "import('./features/feature').then((m) => m.feature)",
      );
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

/**
 * Creates a test project with create-nx-workspace and installs the plugin
 * @returns The directory where the test project was created
 */
async function createTestProject() {
  function uniqueId() {
    return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  }
  const projectName = `test-project-${uniqueId()}`;
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
      if (err.code === 'EBUSY' || err.code === 'ENOTEMPTY') {
        attempts++;
        // Use an async sleep instead of Atomics.wait which is not intended for this use
        // and can be unreliable across environments.
        // This is safe because the surrounding callers (beforeAll/afterAll) are async.
        // eslint-disable-next-line no-await-in-loop
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
  mkdirSync(dirname(projectDirectory), {
    recursive: true,
  });

  execSync(
    `npx --yes create-nx-workspace@latest ${projectName} --preset apps --nxCloud=skip --no-interactive`,
    {
      cwd: dirname(projectDirectory),
      stdio: 'inherit',
      env: process.env,
    },
  );
  console.log(`Created test project in "${projectDirectory}"`);

  return projectDirectory;
}
