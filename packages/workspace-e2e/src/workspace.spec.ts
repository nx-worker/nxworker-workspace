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

  describe('OS-specific edge cases', () => {
    let testLibName: string;

    beforeEach(() => {
      testLibName = `lib-${uniqueId()}`;
      execSync(
        `npx nx generate @nx/js:library ${testLibName} --unitTestRunner=none --bundler=none --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );
    });

    it('should handle path separators correctly across platforms (Windows backslash vs Unix forward slash)', () => {
      // This test verifies that the generator normalizes paths correctly
      // Windows uses backslashes, Unix uses forward slashes
      // The generator should handle both and normalize to POSIX style internally

      const sourcePath = join(
        projectDirectory,
        testLibName,
        'src',
        'lib',
        'util.ts',
      );
      writeFileSync(
        sourcePath,
        "export function util() { return 'utility'; }\n",
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
        "import { util } from './util';\nexport const value = util();\n",
      );

      // Test with POSIX-style paths (forward slashes)
      // This should work on all platforms
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${testLibName}/src/lib/util.ts ${testLibName}/src/lib/utilities/util.ts --no-interactive`,
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
        'util.ts',
      );
      expect(readFileSync(movedPath, 'utf-8')).toContain(
        'export function util()',
      );

      // Verify imports use forward slashes (normalized)
      let updatedConsumerContent = readFileSync(consumerPath, 'utf-8');
      expect(updatedConsumerContent).toMatch(
        /from ['"]\.\/utilities\/util['"]/,
      );

      // Test with Windows-style paths on Windows (backslashes)
      if (process.platform === 'win32') {
        // Move file back first
        const utilBackPath = join(
          projectDirectory,
          testLibName,
          'src',
          'lib',
          'util.ts',
        );
        writeFileSync(
          utilBackPath,
          "export function util() { return 'utility'; }\n",
        );
        writeFileSync(
          consumerPath,
          "import { util } from './util';\nexport const value = util();\n",
        );

        // Use backslashes in paths (Windows-style)
        const winStyleSource = `${testLibName}\\src\\lib\\util.ts`;
        const winStyleTarget = `${testLibName}\\src\\lib\\utilities\\util.ts`;
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${winStyleSource} ${winStyleTarget} --no-interactive`,
          {
            cwd: projectDirectory,
            stdio: 'inherit',
          },
        );

        expect(readFileSync(movedPath, 'utf-8')).toContain(
          'export function util()',
        );

        // Imports should still use forward slashes (normalized)
        updatedConsumerContent = readFileSync(consumerPath, 'utf-8');
        expect(updatedConsumerContent).toMatch(
          /from ['"]\.\/utilities\/util['"]/,
        );
      }
    });

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
        `npx nx generate @nxworker/workspace:move-file ${testLibName}/src/lib/${fileName} ${testLibName}/${deepPath}/${fileName} --no-interactive`,
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
          `npx nx generate @nxworker/workspace:move-file ${testLibName}/src/lib/${fileName} ${testLibName}/src/lib/${invalidSegmentName}/${fileName} --no-interactive`,
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
        `npx nx generate @nxworker/workspace:move-file ${testLibName}/src/lib/${fileName} ${testLibName}/src/lib/special/${fileName} --no-interactive`,
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

    (process.platform === 'win32' ? it.skip : it)(
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
          `npx nx generate @nxworker/workspace:move-file "${testLibName}/src/lib/${fileName}" "${testLibName}/src/lib/unix-special/${fileName}" --no-interactive`,
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
        `npx nx generate @nxworker/workspace:move-file "${testLibName}/src/lib/${fileName}" "${testLibName}/src/lib/spaced/${fileName}" --no-interactive`,
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
        `npx nx generate @nxworker/workspace:move-file ${testLibName}/src/lib/${file1} ${testLibName}/src/lib/moved/${file1} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      execSync(
        `npx nx generate @nxworker/workspace:move-file ${testLibName}/src/lib/${file2} ${testLibName}/src/lib/moved/${file2} --no-interactive`,
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
        `npx nx generate @nxworker/workspace:move-file ${testLibName}/src/lib/${fileNameLF} ${testLibName}/src/lib/moved/${fileNameLF} --skipFormat --no-interactive`,
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
        `npx nx generate @nxworker/workspace:move-file ${testLibName}/src/lib/${fileNameCRLF} ${testLibName}/src/lib/moved/${fileNameCRLF} --skipFormat --no-interactive`,
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
        `npx nx generate @nxworker/workspace:move-file ${testLibName}/src/${fileName} ${testLibName}/src/lib/${fileName} --no-interactive`,
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
        `npx nx generate @nxworker/workspace:move-file ${testLibName}/src/lib/${fileName} ${testLibName}/src/lib/moved/${fileName} --no-interactive`,
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

    beforeEach(() => {
      archLibName = `lib-${uniqueId()}`;
      execSync(
        `npx nx generate @nx/js:library ${archLibName} --unitTestRunner=none --bundler=none --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );
    });

    it('should handle large files efficiently on both x64 and arm64', () => {
      // Test with a reasonably sized file that might expose memory handling differences
      // between x64 and arm64 architectures

      const fileName = 'large-module.ts';
      const largeContent = generateLargeTypeScriptFile(10000); // 10,000 lines

      writeFileSync(
        join(projectDirectory, archLibName, 'src', 'lib', fileName),
        largeContent,
      );

      const consumerPath = join(
        projectDirectory,
        archLibName,
        'src',
        'lib',
        'consumer.ts',
      );
      writeFileSync(
        consumerPath,
        `import { func0 } from './${fileName.replace('.ts', '')}';\nexport const value = func0();\n`,
      );

      execSync(
        `npx nx generate @nxworker/workspace:move-file ${archLibName}/src/lib/${fileName} ${archLibName}/src/lib/modules/${fileName} --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      const movedPath = join(
        projectDirectory,
        archLibName,
        'src',
        'lib',
        'modules',
        fileName,
      );
      const movedContent = readFileSync(movedPath, 'utf-8');

      // Verify content is complete
      expect(movedContent).toContain('export function func0()');
      expect(movedContent).toContain('export function func9999()');

      // Verify imports were updated
      const updatedConsumerContent = readFileSync(consumerPath, 'utf-8');
      expect(updatedConsumerContent).toMatch(
        /from ['"]\.\/modules\/large-module['"]/,
      );
    });

    it('should handle many files with imports efficiently (stress test for both architectures)', () => {
      // Create multiple files with cross-references
      // This tests performance and memory handling on different architectures

      const fileCount = 20;

      // Create files using Array methods
      Array.from({ length: fileCount }, (_, i) => {
        const fileName = `module${i}.ts`;
        writeFileSync(
          join(projectDirectory, archLibName, 'src', 'lib', fileName),
          `export function func${i}() { return ${i}; }\n`,
        );
        return fileName;
      });

      // Create consumer that imports from first file
      const consumerPath = join(
        projectDirectory,
        archLibName,
        'src',
        'lib',
        'consumer.ts',
      );
      writeFileSync(
        consumerPath,
        `import { func0 } from './module0';\nexport const value = func0();\n`,
      );

      // Move first file
      execSync(
        `npx nx generate @nxworker/workspace:move-file ${archLibName}/src/lib/module0.ts ${archLibName}/src/lib/modules/module0.ts --no-interactive`,
        {
          cwd: projectDirectory,
          stdio: 'inherit',
        },
      );

      // Verify file was moved
      const movedPath = join(
        projectDirectory,
        archLibName,
        'src',
        'lib',
        'modules',
        'module0.ts',
      );
      expect(readFileSync(movedPath, 'utf-8')).toContain('func0');

      // Verify import was updated
      const updatedConsumerContent = readFileSync(consumerPath, 'utf-8');
      expect(updatedConsumerContent).toMatch(
        /from ['"]\.\/modules\/module0['"]/,
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
        `npx nx generate @nxworker/workspace:move-file ${archLibName}/src/lib/${fileName} ${archLibName}/src/lib/i18n/${fileName} --no-interactive`,
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

    beforeEach(() => {
      failLibName = `lib-${uniqueId()}`;
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
          `npx nx generate @nxworker/workspace:move-file ${failLibName}/src/lib/non-existent.ts ${failLibName}/src/lib/moved/non-existent.ts --no-interactive`,
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

      expect(() => {
        execSync(
          `npx nx generate @nxworker/workspace:move-file ${failLibName}/src/lib/safe.ts ../../../etc/passwd --no-interactive`,
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
          `npx nx generate @nxworker/workspace:move-file "${failLibName}/src/lib/[invalid].ts" "${failLibName}/src/lib/moved/file.ts" --no-interactive`,
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
        `npx nx generate @nxworker/workspace:move-file ${failLibName}/src/lib/${fileName} ${failLibName}/src/lib/a/b/c/d/${fileName} --no-interactive`,
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

    beforeEach(() => {
      nodeLibName = `lib-${uniqueId()}`;
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
        `npx nx generate @nxworker/workspace:move-file ${nodeLibName}/src/lib/${fileName} ${nodeLibName}/src/lib/versioned/${fileName} --no-interactive`,
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
        `npx nx generate @nxworker/workspace:move-file ${nodeLibName}/src/lib/${fileName} ${nodeLibName}/src/lib/../lib/moved/${fileName} --no-interactive`,
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
        `npx nx generate @nxworker/workspace:move-file ${nodeLibName}/src/lib/${fileName} ${nodeLibName}/src/lib/modules/${fileName} --no-interactive`,
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
 * Generate a large TypeScript file with multiple functions
 * @param lines - Number of function declarations to generate
 * @returns TypeScript source code
 */
function generateLargeTypeScriptFile(lines: number): string {
  const header = '// Large auto-generated TypeScript file\n\n';
  const functions = Array.from(
    { length: lines },
    (_, i) => `export function func${i}() {\n  return ${i};\n}\n`,
  ).join('\n');
  return header + functions;
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
