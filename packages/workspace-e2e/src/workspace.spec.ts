import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs';

describe('workspace', () => {
  let projectDirectory: string;

  beforeAll(() => {
    projectDirectory = createTestProject();

    // The plugin has been built and published to a local registry in the jest globalSetup
    // Install the plugin built with the latest source code into the test repo
    execSync(`npm install @nxworker/workspace@e2e`, {
      cwd: projectDirectory,
      stdio: 'inherit',
      env: process.env,
    });
  });

  afterAll(() => {
    // Cleanup the test project
    rmSync(projectDirectory, {
      recursive: true,
      force: true,
    });
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
        'npx nx generate @nx/js:library lib1 --unitTestRunner=none --bundler=none --no-interactive',
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      execSync(
        'npx nx generate @nx/js:library lib2 --unitTestRunner=none --bundler=none --no-interactive',
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      // Create a file in lib1
      const helperPath = join(
        projectDirectory,
        'lib1',
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
      const mainPath = join(projectDirectory, 'lib1', 'src', 'lib', 'main.ts');
      writeFileSync(
        mainPath,
        "import { helper } from './helper';\n\nexport const result = helper();\n",
      );

      // Run the move-file generator
      execSync(
        'npx nx generate @nxworker/workspace:move-file lib1/src/lib/helper.ts lib2/src/lib/helper.ts --no-interactive',
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      // Verify the file was moved
      const movedPath = join(
        projectDirectory,
        'lib2',
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
        'lib1',
        'src',
        'lib',
        'helper.ts',
      );
      expect(() => readFileSync(originalPath, 'utf-8')).toThrow();
    });

    it('should update imports when moving exported files', () => {
      // Create two library projects
      execSync(
        'npx nx generate @nx/js:library lib3 --unitTestRunner=none --bundler=none --no-interactive',
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      execSync(
        'npx nx generate @nx/js:library lib4 --unitTestRunner=none --bundler=none --no-interactive',
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      // Create and export a file in lib3
      const utilPath = join(projectDirectory, 'lib3', 'src', 'lib', 'util.ts');
      mkdirSync(dirname(utilPath), { recursive: true });
      writeFileSync(utilPath, 'export function util() { return "utility"; }\n');

      // Export from index
      const indexPath = join(projectDirectory, 'lib3', 'src', 'index.ts');
      writeFileSync(indexPath, "export * from './lib/util';\n");

      // Create a consuming file in another lib
      const consumerPath = join(
        projectDirectory,
        'lib1',
        'src',
        'lib',
        'consumer.ts',
      );
      writeFileSync(
        consumerPath,
        "import { util } from '@test-project/lib3';\nexport const value = util();\n",
      );

      // Run the move-file generator
      execSync(
        'npx nx generate @nxworker/workspace:move-file lib3/src/lib/util.ts lib4/src/lib/util.ts --no-interactive',
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      // Verify the file was moved
      const movedUtilPath = join(
        projectDirectory,
        'lib4',
        'src',
        'lib',
        'util.ts',
      );
      expect(readFileSync(movedUtilPath, 'utf-8')).toContain(
        'export function util()',
      );

      // Verify imports were updated in consuming file
      const consumerContent = readFileSync(consumerPath, 'utf-8');
      expect(consumerContent).toContain('@test-project/lib4');
    });

    it('should handle relative imports within same project', () => {
      // Create a new library
      execSync(
        'npx nx generate @nx/js:library lib5 --unitTestRunner=none --bundler=none --no-interactive',
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      // Create nested files with relative imports
      const featurePath = join(
        projectDirectory,
        'lib5',
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
        'lib5',
        'src',
        'lib',
        'service.ts',
      );
      writeFileSync(
        servicePath,
        "import { feature } from './feature';\nexport function service() { return feature(); }\n",
      );

      // Move to subdirectory within same project
      execSync(
        'npx nx generate @nxworker/workspace:move-file lib5/src/lib/feature.ts lib5/src/lib/features/feature.ts --no-interactive',
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      // Verify file was moved
      const movedFeaturePath = join(
        projectDirectory,
        'lib5',
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
    });
  });
});

/**
 * Creates a test project with create-nx-workspace and installs the plugin
 * @returns The directory where the test project was created
 */
function createTestProject() {
  const projectName = 'test-project';
  const projectDirectory = join(process.cwd(), 'tmp', projectName);

  // Ensure projectDirectory is empty
  rmSync(projectDirectory, {
    recursive: true,
    force: true,
  });
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
