import { uniqueId } from '@internal/test-util';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

const itSkipWindows = process.platform === 'win32' ? it.skip : it;
const itWindowsOnly = process.platform === 'win32' ? it : it.skip;

// Use beforeEach on Windows for better performance, beforeAll on other platforms
// Windows has slower file system operations, so creating libraries per-test is faster
// than the upfront cost of sequential creation in beforeAll
const beforeAllOrEach = process.platform === 'win32' ? beforeEach : beforeAll;

/**
 * Extracts supported major versions from @nx/devkit peer dependency.
 * Parses the peerDependencies field in package.json to determine which
 * Nx major versions are supported (e.g., ">=19.8.5 <22.0.0" => [19, 20, 21])
 */
function getSupportedNxMajorVersions(): number[] {
  // Find the workspace package.json by searching up the directory tree
  let currentDir = __dirname;
  let packageJsonPath: string | null = null;

  // Search up to 5 levels to find packages/workspace/package.json
  for (let i = 0; i < 5; i++) {
    const testPath = join(currentDir, 'workspace', 'package.json');
    try {
      readFileSync(testPath, 'utf-8');
      packageJsonPath = testPath;
      break;
    } catch {
      currentDir = join(currentDir, '..');
    }
  }

  if (!packageJsonPath) {
    throw new Error(
      'Could not find packages/workspace/package.json relative to test file',
    );
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const devkitPeerDep = packageJson.peerDependencies?.['@nx/devkit'];

  if (!devkitPeerDep) {
    throw new Error('@nx/devkit peer dependency not found in package.json');
  }

  // Parse version range like ">=19.8.5 <22.0.0"
  const minMatch = devkitPeerDep.match(/>=(\d+)\./);
  const maxMatch = devkitPeerDep.match(/<(\d+)\./);

  if (!minMatch || !maxMatch) {
    throw new Error(
      `Unable to parse @nx/devkit peer dependency: ${devkitPeerDep}`,
    );
  }

  const minMajor = Number.parseInt(minMatch[1], 10);
  const maxMajor = Number.parseInt(maxMatch[1], 10);

  // Generate array of major versions [19, 20, 21, ...]
  const versions: number[] = [];
  for (let v = minMajor; v < maxMajor; v++) {
    versions.push(v);
  }

  return versions;
}

describe('workspace', () => {
  let projectDirectory: string;
  interface LibNames {
    lib1: string;
    lib2: string;
    lib3: string;
    lib4: string;
    lib5: string;
  }
  let libNames: LibNames;
  beforeAll(async () => {
    projectDirectory = await createTestProject();
    libNames = {
      lib1: uniqueId('lib1-'),
      lib2: uniqueId('lib2-'),
      lib3: uniqueId('lib3-'),
      lib4: uniqueId('lib4-'),
      lib5: uniqueId('lib5-'),
    };

    // The plugin has been built and published to a local registry in the jest globalSetup
    // Install the plugin built with the latest source code into the test repo
    execSync(`npm install @nxworker/workspace@e2e --prefer-offline`, {
      cwd: projectDirectory,
      stdio: 'inherit',
      env: process.env,
    });

    // Pre-create all libraries used by the main test suite to avoid repeated generation
    // This significantly speeds up test execution
    const libsToCreate = [
      libNames.lib1,
      libNames.lib2,
      libNames.lib3,
      libNames.lib4,
      libNames.lib5,
    ];

    for (const libName of libsToCreate) {
      execSync(
        `npx nx generate @nx/js:library ${libName} --unitTestRunner=none --bundler=none --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );
    }
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

  it('should be installed', () => {
    // npm ls will fail if the package is not installed properly
    execSync('npm ls @nxworker/workspace', {
      cwd: projectDirectory,
      stdio: 'inherit',
    });
  });

  describe('move-file generator', () => {
    it('should move a file between projects', () => {
      // Libraries lib1 and lib2 are pre-created in beforeAll

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
        `npx nx generate @nxworker/workspace:move-file ${libNames.lib1}/src/lib/helper.ts --project ${libNames.lib2} --no-interactive`,
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
      // Libraries lib3 and lib4 are pre-created in beforeAll

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
        `npx nx generate @nxworker/workspace:move-file ${libNames.lib3}/src/lib/util.ts --project ${libNames.lib4} --no-interactive`,
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
      // Library lib5 is pre-created in beforeAll

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
        `npx nx generate @nxworker/workspace:move-file ${libNames.lib5}/src/lib/feature.ts --project ${libNames.lib5} --project-directory features --no-interactive`,
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

    it('should move multiple files using glob patterns', () => {
      // Create a new library with multiple spec files
      const testLib = uniqueId('libtest-');
      execSync(
        `npx nx generate @nx/js:library ${testLib} --unitTestRunner=none --bundler=none --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      // Create multiple test files
      const test1Path = join(
        projectDirectory,
        testLib,
        'src',
        'lib',
        'test1.spec.ts',
      );
      writeFileSync(test1Path, 'export const test1 = "test";\n');

      const test2Path = join(
        projectDirectory,
        testLib,
        'src',
        'lib',
        'test2.spec.ts',
      );
      writeFileSync(test2Path, 'export const test2 = "test";\n');

      const utilsDir = join(projectDirectory, testLib, 'src', 'lib', 'utils');
      mkdirSync(utilsDir, { recursive: true });
      const test3Path = join(utilsDir, 'test3.spec.ts');
      writeFileSync(test3Path, 'export const test3 = "test";\n');

      // Create a target library
      const targetLib = uniqueId('libtarget-');
      execSync(
        `npx nx generate @nx/js:library ${targetLib} --unitTestRunner=none --bundler=none --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      // Move all spec files using glob pattern
      execSync(
        `npx nx generate @nxworker/workspace:move-file "${testLib}/**/*.spec.ts" --project ${targetLib} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      // Verify all spec files were moved
      const movedTest1Path = join(
        projectDirectory,
        targetLib,
        'src',
        'lib',
        'test1.spec.ts',
      );
      expect(readFileSync(movedTest1Path, 'utf-8')).toContain('test1');

      const movedTest2Path = join(
        projectDirectory,
        targetLib,
        'src',
        'lib',
        'test2.spec.ts',
      );
      expect(readFileSync(movedTest2Path, 'utf-8')).toContain('test2');

      const movedTest3Path = join(
        projectDirectory,
        targetLib,
        'src',
        'lib',
        'test3.spec.ts',
      );
      expect(readFileSync(movedTest3Path, 'utf-8')).toContain('test3');

      // Verify original files are deleted
      expect(() => readFileSync(test1Path, 'utf-8')).toThrow();
      expect(() => readFileSync(test2Path, 'utf-8')).toThrow();
      expect(() => readFileSync(test3Path, 'utf-8')).toThrow();
    });
  });

  describe('OS-specific edge cases', () => {
    let testLibName: string;

    beforeAllOrEach(() => {
      testLibName = uniqueId('libtest-');
      execSync(
        `npx nx generate @nx/js:library ${testLibName} --unitTestRunner=none --bundler=none --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );
    });

    it('should handle path separators correctly (forward slashes)', () => {
      // This test verifies that the generator normalizes POSIX-style paths

      const sourcePath = join(
        projectDirectory,
        testLibName,
        'src',
        'lib',
        'util-posix.ts',
      );
      writeFileSync(
        sourcePath,
        "export function utilPosix() { return 'utility'; }\n",
      );

      const consumerPath = join(
        projectDirectory,
        testLibName,
        'src',
        'lib',
        'consumer-posix.ts',
      );
      writeFileSync(
        consumerPath,
        "import { utilPosix } from './util-posix';\nexport const value = utilPosix();\n",
      );

      execSync(
        `npx nx generate @nxworker/workspace:move-file ${testLibName}/src/lib/util-posix.ts --project ${testLibName} --project-directory utilities --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      const movedPath = join(
        projectDirectory,
        testLibName,
        'src',
        'lib',
        'utilities',
        'util-posix.ts',
      );
      expect(readFileSync(movedPath, 'utf-8')).toContain(
        'export function utilPosix()',
      );

      const updatedConsumerContent = readFileSync(consumerPath, 'utf-8');
      expect(updatedConsumerContent).toMatch(
        /from ['"]\.\/utilities\/util-posix['"]/,
      );
    });

    itWindowsOnly(
      'should handle path separators correctly on Windows (backslashes)',
      () => {
        const sourcePath = join(
          projectDirectory,
          testLibName,
          'src',
          'lib',
          'util-win.ts',
        );
        writeFileSync(
          sourcePath,
          "export function utilWin() { return 'utility'; }\n",
        );

        const consumerPath = join(
          projectDirectory,
          testLibName,
          'src',
          'lib',
          'consumer-win.ts',
        );
        writeFileSync(
          consumerPath,
          "import { utilWin } from './util-win';\nexport const value = utilWin();\n",
        );

        const winStyleSource = `${testLibName}\\src\\lib\\util-win.ts`;
        execSync(
          `npx nx generate @nxworker/workspace:move-file "${winStyleSource}" --project ${testLibName} --project-directory utilities --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );

        const movedPath = join(
          projectDirectory,
          testLibName,
          'src',
          'lib',
          'utilities',
          'util-win.ts',
        );
        expect(readFileSync(movedPath, 'utf-8')).toContain(
          'export function utilWin()',
        );

        const updatedConsumerContent = readFileSync(consumerPath, 'utf-8');
        expect(updatedConsumerContent).toMatch(
          /from ['"]\.\/utilities\/util-win['"]/,
        );
      },
    );

    it('should handle deeply nested paths within OS limits (~900 characters)', () => {
      // Windows historically had a 260-character limit (MAX_PATH)
      // Modern Windows and Unix can handle long paths, but have different limits:
      // - Linux: PATH_MAX=4096, NAME_MAX=255 per directory/file
      // - Windows (with long path support): 32,767 characters
      // - macOS: PATH_MAX=1024 (most restrictive)
      // This tests a realistic deep path (~900 chars) that works within macOS limits

      const fileName = 'deeply-nested-service.ts';

      // Create directory segments with names <255 chars (respecting NAME_MAX)
      // Use shorter segments to stay within macOS's 1024-char limit
      const segmentBase = 'long-dir-name-for-testing-'.repeat(2); // ~54 chars
      const numSegments = 15; // 15 * 60 = ~900 characters (safe for macOS)

      const deepPathSegments = Array.from({ length: numSegments }, (_, i) =>
        `${segmentBase}${i.toString().padStart(2, '0')}`.substring(0, 60),
      );
      const deepPath = `src/lib/${deepPathSegments.join('/')}`;

      const sourcePath = join(
        projectDirectory,
        testLibName,
        'src',
        'lib',
        fileName,
      );
      writeFileSync(
        sourcePath,
        "export class DeeplyNestedService { getId() { return 'deep'; } }\n",
      );

      const consumerPath = join(
        projectDirectory,
        testLibName,
        'src',
        'lib',
        'consumer.ts',
      );
      writeFileSync(
        consumerPath,
        `import { DeeplyNestedService } from './${fileName.replace('.ts', '')}';\nexport const service = new DeeplyNestedService();\n`,
      );

      // Move to deeply nested path
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${testLibName}/src/lib/${fileName} --project ${testLibName} --project-directory "${deepPathSegments.join('/')}" --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      const movedPath = join(projectDirectory, testLibName, deepPath, fileName);
      expect(readFileSync(movedPath, 'utf-8')).toContain(
        'export class DeeplyNestedService',
      );

      // Verify the path is long but within macOS limits (~824 characters in the deep path portion)
      const deepPathLength = deepPathSegments.join('/').length;
      expect(deepPathLength).toBeGreaterThan(800); // ~824 chars (15 segments * 54 chars + 14 slashes)
      expect(deepPathLength).toBeLessThan(900); // Safe margin within macOS 1024 limit

      // Verify imports were updated with correct relative path
      const updatedConsumerContent = readFileSync(consumerPath, 'utf-8');
      expect(updatedConsumerContent).toContain('DeeplyNestedService');
      expect(updatedConsumerContent).toContain(
        deepPathSegments[0].substring(0, 20),
      ); // Verify it references the deep path
    });

    it('should fail gracefully when path exceeds OS limits', () => {
      // This test verifies the generator propagates OS errors for paths that exceed system limits
      // Different OSes have different limits, so we create a path that will fail on most systems

      const fileName = 'service.ts';

      // Create a directory name that exceeds NAME_MAX (255 chars on Linux/macOS/Windows)
      const invalidSegmentName = 'a'.repeat(300); // 300 chars - exceeds NAME_MAX

      const sourcePath = join(
        projectDirectory,
        testLibName,
        'src',
        'lib',
        fileName,
      );
      writeFileSync(sourcePath, 'export class Service {}\n');

      // Attempt to move to a path with an overly long directory name
      // This should fail with an OS error (ENAMETOOLONG on Unix, similar error on Windows)
      expect(() => {
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${testLibName}/src/lib/${fileName} --project ${testLibName} --project-directory "${invalidSegmentName}" --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe', // Capture error output
          },
        );
      }).toThrow(); // Expect the command to fail
    });

    it('should handle files with special characters allowed on Unix but problematic on Windows', () => {
      // Windows doesn't allow certain characters in file names: < > : " / \ | ? *
      // Unix allows most of these
      // We test with hyphens and underscores which are safe on both platforms

      const fileName = 'util_with-special.chars.ts';
      const sourcePath = join(
        projectDirectory,
        testLibName,
        'src',
        'lib',
        fileName,
      );
      writeFileSync(
        sourcePath,
        "export function specialUtil() { return 'special'; }\n",
      );

      const consumerPath = join(
        projectDirectory,
        testLibName,
        'src',
        'lib',
        'consumer.ts',
      );
      writeFileSync(
        consumerPath,
        `import { specialUtil } from './${fileName.replace('.ts', '')}';\nexport const value = specialUtil();\n`,
      );

      execSync(
        `npx nx generate @nxworker/workspace:move-file ${testLibName}/src/lib/${fileName} --project ${testLibName} --project-directory special --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      const movedPath = join(
        projectDirectory,
        testLibName,
        'src',
        'lib',
        'special',
        fileName,
      );
      expect(readFileSync(movedPath, 'utf-8')).toContain(
        'export function specialUtil()',
      );

      const updatedConsumerContent = readFileSync(consumerPath, 'utf-8');
      expect(updatedConsumerContent).toMatch(
        /from ['"]\.\/special\/util_with-special\.chars['"]/,
      );
    });

    itSkipWindows(
      'should handle files with Unix-specific special characters (skipped on Windows)',
      () => {
        // Windows doesn't allow these characters in filenames: < > : " / \ | ? *
        // Unix allows most of these (except / which is the path separator)
        // This test only runs on non-Windows platforms
        // Testing with: < > : (shell metacharacters | ? * " are avoided due to escaping complexity)

        const fileName = 'util<>:test.ts';
        const sourcePath = join(
          projectDirectory,
          testLibName,
          'src',
          'lib',
          fileName,
        );
        writeFileSync(
          sourcePath,
          "export function specialUtil() { return 'special'; }\n",
        );

        const consumerPath = join(
          projectDirectory,
          testLibName,
          'src',
          'lib',
          'consumer-unix.ts',
        );
        writeFileSync(
          consumerPath,
          `import { specialUtil } from './${fileName.replace('.ts', '')}';\nexport const value = specialUtil();\n`,
        );

        execSync(
          `npx nx generate @nxworker/workspace:move-file "${testLibName}/src/lib/${fileName}" --project ${testLibName} --project-directory unix-special --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );

        const movedPath = join(
          projectDirectory,
          testLibName,
          'src',
          'lib',
          'unix-special',
          fileName,
        );
        expect(readFileSync(movedPath, 'utf-8')).toContain(
          'export function specialUtil()',
        );

        const updatedConsumerContent = readFileSync(consumerPath, 'utf-8');
        expect(updatedConsumerContent).toContain('./unix-special/');
      },
    );

    it('should handle files with spaces in names (cross-platform compatibility)', () => {
      // Spaces in file names can be tricky across platforms
      // especially when passed as command-line arguments

      const fileName = 'util with spaces.ts';
      const sourcePath = join(
        projectDirectory,
        testLibName,
        'src',
        'lib',
        fileName,
      );
      writeFileSync(
        sourcePath,
        'export function utilWithSpaces() { return "spaced"; }\n',
      );

      const consumerPath = join(
        projectDirectory,
        testLibName,
        'src',
        'lib',
        'consumer.ts',
      );
      writeFileSync(
        consumerPath,
        `import { utilWithSpaces } from './${fileName.replace('.ts', '')}';\nexport const value = utilWithSpaces();\n`,
      );

      // Note: Paths with spaces need proper quoting in shell commands
      execSync(
        `npx nx generate @nxworker/workspace:move-file "${testLibName}/src/lib/${fileName}" --project ${testLibName} --project-directory spaced --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      const movedPath = join(
        projectDirectory,
        testLibName,
        'src',
        'lib',
        'spaced',
        fileName,
      );
      expect(readFileSync(movedPath, 'utf-8')).toContain(
        'export function utilWithSpaces()',
      );
    });

    it('should handle concurrent file operations (Windows file locking vs Unix)', () => {
      // Windows has stricter file locking than Unix
      // This tests that the generator completes successfully even when
      // files might be briefly locked by other processes

      const file1 = 'concurrent1.ts';
      const file2 = 'concurrent2.ts';

      writeFileSync(
        join(projectDirectory, testLibName, 'src', 'lib', file1),
        'export const concurrent1 = "test1";\n',
      );
      writeFileSync(
        join(projectDirectory, testLibName, 'src', 'lib', file2),
        'export const concurrent2 = "test2";\n',
      );

      // Move files sequentially (simulating back-to-back operations)
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${testLibName}/src/lib/${file1} --project ${testLibName} --project-directory moved --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      execSync(
        `npx nx generate @nxworker/workspace:move-file ${testLibName}/src/lib/${file2} --project ${testLibName} --project-directory moved --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      // Verify both files were moved successfully
      expect(
        readFileSync(
          join(projectDirectory, testLibName, 'src', 'lib', 'moved', file1),
          'utf-8',
        ),
      ).toContain('concurrent1');
      expect(
        readFileSync(
          join(projectDirectory, testLibName, 'src', 'lib', 'moved', file2),
          'utf-8',
        ),
      ).toContain('concurrent2');
    });

    it('should preserve line endings across platforms (CRLF vs LF)', () => {
      // Windows uses CRLF (\r\n), Unix uses LF (\n)
      // The generator should preserve the file content exactly including line endings

      const fileNameLF = 'line-endings-lf.ts';
      const fileNameCRLF = 'line-endings-crlf.ts';

      // Test LF line endings
      const contentLF = "export function testLF() {\n  return 'test';\n}\n";
      writeFileSync(
        join(projectDirectory, testLibName, 'src', 'lib', fileNameLF),
        contentLF,
      );

      execSync(
        `npx nx generate @nxworker/workspace:move-file ${testLibName}/src/lib/${fileNameLF} --project ${testLibName} --project-directory moved --skipFormat --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      const movedContentLF = readFileSync(
        join(projectDirectory, testLibName, 'src', 'lib', 'moved', fileNameLF),
        'utf-8',
      );

      // Content should be preserved exactly (formatting skipped)
      expect(movedContentLF).toContain('export function testLF()');
      expect(movedContentLF).toContain("return 'test'");

      // Assert that LF line endings are preserved
      expect(movedContentLF).toBe(contentLF);
      expect(movedContentLF).not.toContain('\r\n'); // No CRLF
      expect(movedContentLF.split('\n').length).toBe(4); // 3 lines + empty string after final \n

      // Test CRLF line endings
      const contentCRLF =
        "export function testCRLF() {\r\n  return 'test';\r\n}\r\n";
      writeFileSync(
        join(projectDirectory, testLibName, 'src', 'lib', fileNameCRLF),
        contentCRLF,
      );

      execSync(
        `npx nx generate @nxworker/workspace:move-file ${testLibName}/src/lib/${fileNameCRLF} --project ${testLibName} --project-directory moved --skipFormat --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      const movedContentCRLF = readFileSync(
        join(
          projectDirectory,
          testLibName,
          'src',
          'lib',
          'moved',
          fileNameCRLF,
        ),
        'utf-8',
      );

      // Content should be preserved exactly (formatting skipped)
      expect(movedContentCRLF).toContain('export function testCRLF()');
      expect(movedContentCRLF).toContain("return 'test'");

      // Assert that CRLF line endings are preserved
      expect(movedContentCRLF).toBe(contentCRLF);
      expect(movedContentCRLF).toContain('\r\n'); // Has CRLF
      expect(movedContentCRLF.split('\r\n').length).toBe(4); // 3 lines + empty string after final \r\n
    });

    it('should handle files at project root correctly (path edge case)', () => {
      // Test moving files at the root of the project's src directory
      // This can expose path calculation bugs

      const fileName = 'root-level.ts';
      writeFileSync(
        join(projectDirectory, testLibName, 'src', fileName),
        'export const rootLevel = "root";\n',
      );

      const consumerPath = join(
        projectDirectory,
        testLibName,
        'src',
        'lib',
        'consumer.ts',
      );
      writeFileSync(
        consumerPath,
        `import { rootLevel } from '../${fileName.replace('.ts', '')}';\nexport const value = rootLevel;\n`,
      );

      execSync(
        `npx nx generate @nxworker/workspace:move-file ${testLibName}/src/${fileName} --project ${testLibName} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      const movedPath = join(
        projectDirectory,
        testLibName,
        'src',
        'lib',
        fileName,
      );
      expect(readFileSync(movedPath, 'utf-8')).toContain('rootLevel');

      // Verify import path was updated from ../ to ./
      const updatedConsumerContent = readFileSync(consumerPath, 'utf-8');
      expect(updatedConsumerContent).toMatch(/from ['"]\.\/root-level['"]/);
    });

    it('should handle case-sensitive vs case-insensitive file systems', () => {
      // Linux: case-sensitive (file.ts != File.ts)
      // Windows/macOS: case-insensitive (file.ts == File.ts)
      // We test that moving a file updates imports regardless of case

      const fileName = 'CaseSensitive.ts';
      writeFileSync(
        join(projectDirectory, testLibName, 'src', 'lib', fileName),
        'export const caseSensitive = "test";\n',
      );

      const consumerPath = join(
        projectDirectory,
        testLibName,
        'src',
        'lib',
        'consumer.ts',
      );
      // Import with different casing (would work on Windows/macOS, not on Linux)
      writeFileSync(
        consumerPath,
        `import { caseSensitive } from './${fileName.replace('.ts', '')}';\nexport const value = caseSensitive;\n`,
      );

      execSync(
        `npx nx generate @nxworker/workspace:move-file ${testLibName}/src/lib/${fileName} --project ${testLibName} --project-directory moved --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      const movedPath = join(
        projectDirectory,
        testLibName,
        'src',
        'lib',
        'moved',
        fileName,
      );
      expect(readFileSync(movedPath, 'utf-8')).toContain('caseSensitive');

      // Verify imports were updated
      const updatedConsumerContent = readFileSync(consumerPath, 'utf-8');
      expect(updatedConsumerContent).toMatch(
        /from ['"]\.\/moved\/CaseSensitive['"]/,
      );
    });
  });

  describe('Architecture-specific edge cases', () => {
    let archLibName: string;

    beforeAllOrEach(() => {
      archLibName = uniqueId('libarch-');
      execSync(
        `npx nx generate @nx/js:library ${archLibName} --unitTestRunner=none --bundler=none --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );
    });

    it('should handle binary-safe file operations (architecture-independent)', () => {
      // While TypeScript files are text, the generator should handle them
      // in a way that's safe across architectures (no byte-order issues, etc.)

      const fileName = 'unicode-content.ts';
      const unicodeContent =
        '// 日本語コメント\nexport const emoji = "🚀";\nexport const greek = "Ελληνικά";\n';

      writeFileSync(
        join(projectDirectory, archLibName, 'src', 'lib', fileName),
        unicodeContent,
        'utf-8',
      );

      execSync(
        `npx nx generate @nxworker/workspace:move-file ${archLibName}/src/lib/${fileName} --project ${archLibName} --project-directory i18n --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      const movedContent = readFileSync(
        join(projectDirectory, archLibName, 'src', 'lib', 'i18n', fileName),
        'utf-8',
      );

      // Verify Unicode content is preserved correctly
      expect(movedContent).toContain('日本語');
      expect(movedContent).toContain('🚀');
      expect(movedContent).toContain('Ελληνικά');
    });
  });

  describe('Failure scenarios (OS-specific)', () => {
    let failLibName: string;

    beforeAllOrEach(() => {
      failLibName = uniqueId('libfail-');
      execSync(
        `npx nx generate @nx/js:library ${failLibName} --unitTestRunner=none --bundler=none --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );
    });

    it('should fail gracefully when source file does not exist', () => {
      // This should fail consistently across all platforms
      expect(() => {
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${failLibName}/src/lib/non-existent.ts --project ${failLibName} --project-directory moved --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe',
          },
        );
      }).toThrow();
    });

    it('should reject path traversal attempts (security test)', () => {
      // Path traversal should be rejected on all platforms
      writeFileSync(
        join(projectDirectory, failLibName, 'src', 'lib', 'safe.ts'),
        'export const safe = true;\n',
      );

      // Test invalid project name
      expect(() => {
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${failLibName}/src/lib/safe.ts --project ../../../etc --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe',
          },
        );
      }).toThrow();

      // Test invalid project-directory with path traversal
      expect(() => {
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${failLibName}/src/lib/safe.ts --project ${failLibName} --project-directory "../../../etc" --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe',
          },
        );
      }).toThrow();
    });

    it('should reject invalid characters in file paths', () => {
      // Characters like [, ], *, (, ) should be rejected as they can be regex patterns
      expect(() => {
        execSync(
          `npx nx generate @nxworker/workspace:move-file "${failLibName}/src/lib/[invalid].ts" --project ${failLibName} --project-directory moved --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'pipe',
          },
        );
      }).toThrow();
    });

    it('should handle non-existent target directory by creating it', () => {
      // The generator should create the target directory if it doesn't exist
      const fileName = 'create-dir.ts';
      writeFileSync(
        join(projectDirectory, failLibName, 'src', 'lib', fileName),
        'export const createDir = true;\n',
      );

      // Move to a deeply nested directory that doesn't exist
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${failLibName}/src/lib/${fileName} --project ${failLibName} --project-directory "a/b/c/d" --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      const movedPath = join(
        projectDirectory,
        failLibName,
        'src',
        'lib',
        'a',
        'b',
        'c',
        'd',
        fileName,
      );
      expect(readFileSync(movedPath, 'utf-8')).toContain('createDir');
    });
  });

  describe('Node.js version-specific edge cases', () => {
    let nodeLibName: string;
    const nodeVersion = process.version;
    const nodeMajor = parseInt(nodeVersion.split('.')[0].substring(1), 10);

    beforeAllOrEach(() => {
      nodeLibName = uniqueId('libnode-');
      execSync(
        `npx nx generate @nx/js:library ${nodeLibName} --unitTestRunner=none --bundler=none --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );
    });

    it('should work with file system operations on current Node.js version', () => {
      // Node.js 18.x, 20.x, and 22.x have different fs implementations
      // This test ensures the generator works across all supported versions

      const fileName = 'node-version-test.ts';
      const content = `// Node.js version: ${nodeVersion}\nexport const nodeVersion = ${nodeMajor};\n`;

      writeFileSync(
        join(projectDirectory, nodeLibName, 'src', 'lib', fileName),
        content,
      );

      execSync(
        `npx nx generate @nxworker/workspace:move-file ${nodeLibName}/src/lib/${fileName} --project ${nodeLibName} --project-directory versioned --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      const movedPath = join(
        projectDirectory,
        nodeLibName,
        'src',
        'lib',
        'versioned',
        fileName,
      );
      const movedContent = readFileSync(movedPath, 'utf-8');
      expect(movedContent).toContain('nodeVersion');
      expect(movedContent).toContain(nodeVersion);
    });

    it('should handle path resolution across Node.js versions (18.x, 20.x, 22.x)', () => {
      // Node.js path resolution has subtle differences across versions
      // Particularly with how path.resolve and path.normalize work

      const fileName = 'path-resolution.ts';
      writeFileSync(
        join(projectDirectory, nodeLibName, 'src', 'lib', fileName),
        'export const pathTest = "test";\n',
      );

      const consumerPath = join(
        projectDirectory,
        nodeLibName,
        'src',
        'lib',
        'consumer.ts',
      );
      writeFileSync(
        consumerPath,
        `import { pathTest } from './path-resolution';\nexport const value = pathTest;\n`,
      );

      // Move to parent directory and back down - tests path normalization
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${nodeLibName}/src/lib/${fileName} --project ${nodeLibName} --project-directory moved --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      const movedPath = join(
        projectDirectory,
        nodeLibName,
        'src',
        'lib',
        'moved',
        fileName,
      );
      expect(readFileSync(movedPath, 'utf-8')).toContain('pathTest');

      // Verify imports were updated correctly
      const updatedConsumerContent = readFileSync(consumerPath, 'utf-8');
      expect(updatedConsumerContent).toMatch(
        /from ['"]\.\/moved\/path-resolution['"]/,
      );
    });

    it('should handle modern ECMAScript module imports (Node.js 18+)', () => {
      // Node.js 18+ has improved ESM support
      // Test with .mjs extension to verify native ESM file handling

      const fileName = 'esm-module.mjs';
      const esmContent =
        'export const esmFeature = () => `ESM in Node.js ${process.version}`;\n';

      writeFileSync(
        join(projectDirectory, nodeLibName, 'src', 'lib', fileName),
        esmContent,
      );

      const consumerFileName = 'esm-consumer.mjs';
      const consumerPath = join(
        projectDirectory,
        nodeLibName,
        'src',
        'lib',
        consumerFileName,
      );
      writeFileSync(
        consumerPath,
        `import { esmFeature } from './esm-module.mjs';\nexport const feature = esmFeature;\n`,
      );

      execSync(
        `npx nx generate @nxworker/workspace:move-file ${nodeLibName}/src/lib/${fileName} --project ${nodeLibName} --project-directory modules --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      const movedPath = join(
        projectDirectory,
        nodeLibName,
        'src',
        'lib',
        'modules',
        fileName,
      );
      expect(readFileSync(movedPath, 'utf-8')).toContain('esmFeature');

      const updatedConsumerContent = readFileSync(consumerPath, 'utf-8');
      // For .mjs files, imports must include the .mjs extension
      // The generator should update the import path to reflect the new location
      expect(updatedConsumerContent).toContain('./modules/esm-module.mjs');
    });
  });
});

// Test basic happy paths across all supported Nx major versions
// This ensures compatibility with all peer dependency versions
describe('Nx version compatibility (basic happy paths)', () => {
  const supportedVersions = getSupportedNxMajorVersions();

  // For performance, only test the minimum supported version by default
  // In CI (process.env.CI is set), test all supported major versions
  const versionsToTest = process.env['CI']
    ? supportedVersions
    : [Math.min(...supportedVersions)];

  // Run basic tests for each supported Nx major version
  versionsToTest.forEach((nxMajorVersion) => {
    describe(`Nx ${nxMajorVersion}.x`, () => {
      let projectDirectory: string;

      beforeAll(async () => {
        projectDirectory = await createTestProject(nxMajorVersion);

        // Get the Nx version from the generated test workspace
        const testWorkspacePackageJsonPath = join(
          projectDirectory,
          'package.json',
        );
        const testWorkspacePackageJson = JSON.parse(
          readFileSync(testWorkspacePackageJsonPath, 'utf-8'),
        );
        const testWorkspaceNxVersion =
          testWorkspacePackageJson.devDependencies?.nx ||
          testWorkspacePackageJson.dependencies?.nx;

        if (!testWorkspaceNxVersion) {
          throw new Error(
            'nx not found in test workspace package.json dependencies or devDependencies',
          );
        }

        // Install the plugin as a devDependency along with its peer dependencies at the same version as the test workspace
        execSync(
          `npm install --save-dev @nxworker/workspace@e2e @nx/devkit@${testWorkspaceNxVersion} @nx/workspace@${testWorkspaceNxVersion} --prefer-offline`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
            env: process.env,
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

      it('should be installed', () => {
        // npm ls will fail if the package is not installed properly
        execSync('npm ls @nxworker/workspace', {
          cwd: projectDirectory,
          stdio: 'inherit',
        });
      });

      it('should move a file between projects', () => {
        const lib1 = uniqueId('lib1-');
        const lib2 = uniqueId('lib2-');

        // Create two library projects
        execSync(
          `npx nx generate @nx/js:library ${lib1} --unitTestRunner=none --bundler=none --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );

        execSync(
          `npx nx generate @nx/js:library ${lib2} --unitTestRunner=none --bundler=none --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );

        // Create a file in lib1
        const helperPath = join(
          projectDirectory,
          lib1,
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
        const mainPath = join(projectDirectory, lib1, 'src', 'lib', 'main.ts');
        writeFileSync(
          mainPath,
          "import { helper } from './helper';\n\nexport const result = helper();\n",
        );

        // Move the helper file to lib2
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${lib1}/src/lib/helper.ts --project ${lib2} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );

        // Verify the file was moved
        const movedPath = join(
          projectDirectory,
          lib2,
          'src',
          'lib',
          'helper.ts',
        );
        expect(readFileSync(movedPath, 'utf-8')).toContain('helper');

        // Verify imports were updated
        const lib2Alias = getProjectImportAlias(projectDirectory, lib2);
        const mainContent = readFileSync(mainPath, 'utf-8');
        expect(mainContent).toContain(lib2Alias);
      });

      it('should update imports when moving exported files', () => {
        const lib1 = uniqueId('lib1-');
        const lib2 = uniqueId('lib2-');
        const lib3 = uniqueId('lib3-');

        // Create library projects
        execSync(
          `npx nx generate @nx/js:library ${lib1} --unitTestRunner=none --bundler=none --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );

        execSync(
          `npx nx generate @nx/js:library ${lib2} --unitTestRunner=none --bundler=none --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );

        execSync(
          `npx nx generate @nx/js:library ${lib3} --unitTestRunner=none --bundler=none --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );

        // Create an exported utility in lib1
        const utilPath = join(projectDirectory, lib1, 'src', 'lib', 'util.ts');
        writeFileSync(utilPath, 'export function util() { return 42; }\n');

        // Add to lib1's index.ts (package entrypoint)
        const lib1IndexPath = join(projectDirectory, lib1, 'src', 'index.ts');
        writeFileSync(lib1IndexPath, "export * from './lib/util';\n");

        // Import in lib3 (separate project)
        const lib3ServicePath = join(
          projectDirectory,
          lib3,
          'src',
          'lib',
          'service.ts',
        );
        const lib1Alias = getProjectImportAlias(projectDirectory, lib1);
        writeFileSync(
          lib3ServicePath,
          `import { util } from '${lib1Alias}';\nexport const value = util();\n`,
        );

        // Import in lib2 (will become same project after move)
        const lib2ServicePath = join(
          projectDirectory,
          lib2,
          'src',
          'lib',
          'service.ts',
        );
        writeFileSync(
          lib2ServicePath,
          `import { util } from '${lib1Alias}';\nexport const value2 = util();\n`,
        );

        // Move util.ts from lib1 to lib2
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${lib1}/src/lib/util.ts --project ${lib2} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );

        // Verify file was moved
        const movedPath = join(projectDirectory, lib2, 'src', 'lib', 'util.ts');
        expect(readFileSync(movedPath, 'utf-8')).toContain('util');

        // Verify lib3's service.ts now imports from lib2
        const lib2Alias = getProjectImportAlias(projectDirectory, lib2);
        const serviceContent = readFileSync(lib3ServicePath, 'utf-8');
        expect(serviceContent).toContain(lib2Alias);
        expect(serviceContent).not.toContain(lib1Alias);

        // Verify lib2's service.ts now uses relative import (same project)
        const lib2ServiceContent = readFileSync(lib2ServicePath, 'utf-8');
        expect(lib2ServiceContent).toContain("from './util'");
        expect(lib2ServiceContent).not.toContain(lib1Alias);

        // Verify lib1's index no longer exports util
        const lib1IndexContent = readFileSync(lib1IndexPath, 'utf-8');
        expect(lib1IndexContent).not.toContain('util');

        // Verify lib2's index exports util
        const lib2IndexPath = join(projectDirectory, lib2, 'src', 'index.ts');
        const lib2IndexContent = readFileSync(lib2IndexPath, 'utf-8');
        expect(lib2IndexContent).toContain('util');
      });
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
 * @param nxVersion - Optional Nx major version to install (e.g., 19, 20, 21). If not provided, uses the workspace version.
 * @returns The directory where the test project was created
 */
async function createTestProject(nxVersion?: number) {
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
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err.code === 'EBUSY' || err.code === 'ENOTEMPTY')
      ) {
        attempts++;
        // Use an async sleep instead of Atomics.wait which is not intended for this use
        // and can be unreliable across environments.
        // This is safe because the surrounding callers (beforeAll/afterAll) are async.
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
  mkdirSync(dirname(projectDirectory), {
    recursive: true,
  });

  // Determine which version of create-nx-workspace to use
  // If no version is specified, use the workspace version from root package.json
  let versionSpec: string;
  if (nxVersion) {
    versionSpec = `^${nxVersion}.0.0`;
  } else {
    // Get the workspace Nx version from root package.json
    const rootPackageJsonPath = join(process.cwd(), 'package.json');
    const rootPackageJson = JSON.parse(
      readFileSync(rootPackageJsonPath, 'utf-8'),
    );
    const workspaceNxVersion =
      rootPackageJson.devDependencies?.nx || rootPackageJson.dependencies?.nx;
    if (!workspaceNxVersion) {
      throw new Error('Could not determine workspace Nx version');
    }
    versionSpec = workspaceNxVersion;
  }

  execSync(
    `npx --yes create-nx-workspace@${versionSpec} ${projectName} --preset apps --nxCloud=skip --no-interactive`,
    {
      cwd: dirname(projectDirectory),
      stdio: 'inherit',
      env: process.env,
    },
  );
  console.log(
    `Created test project in "${projectDirectory}"${nxVersion ? ` with Nx ${nxVersion}.x` : ` with workspace Nx version`}`,
  );

  return projectDirectory;
}
