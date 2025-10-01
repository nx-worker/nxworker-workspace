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
