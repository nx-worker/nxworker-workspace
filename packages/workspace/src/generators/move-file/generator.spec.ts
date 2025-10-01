import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, addProjectConfiguration, updateJson } from '@nx/devkit';

import { moveFileGenerator, sanitizePath, escapeRegex } from './generator';
import { MoveFileGeneratorSchema } from './schema';

describe('move-file generator', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();

    // Setup tsconfig.base.json with path mappings
    updateJson(tree, 'tsconfig.base.json', (json) => {
      json.compilerOptions = json.compilerOptions || {};
      json.compilerOptions.paths = {
        '@test/lib1': ['packages/lib1/src/index.ts'],
        '@test/lib2': ['packages/lib2/src/index.ts'],
      };
      return json;
    });

    // Add two test projects
    addProjectConfiguration(tree, 'lib1', {
      root: 'packages/lib1',
      sourceRoot: 'packages/lib1/src',
      projectType: 'library',
    });

    addProjectConfiguration(tree, 'lib2', {
      root: 'packages/lib2',
      sourceRoot: 'packages/lib2/src',
      projectType: 'library',
    });

    // Create index files
    tree.write('packages/lib1/src/index.ts', '');
    tree.write('packages/lib2/src/index.ts', '');
  });

  describe('moving a file that is not exported', () => {
    it('should move the file and update relative imports', async () => {
      // Setup: Create a file in lib1
      tree.write(
        'packages/lib1/src/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      // Create another file that imports it
      tree.write(
        'packages/lib1/src/main.ts',
        "import { helper } from './utils/helper';\n\nexport const result = helper();",
      );

      const options: MoveFileGeneratorSchema = {
        source: 'packages/lib1/src/utils/helper.ts',
        target: 'packages/lib2/src/utils/helper.ts',
      };

      await moveFileGenerator(tree, options);

      // File should be moved
      expect(tree.exists('packages/lib1/src/utils/helper.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/utils/helper.ts')).toBe(true);

      // Content should be preserved
      const movedContent = tree.read(
        'packages/lib2/src/utils/helper.ts',
        'utf-8',
      );
      expect(movedContent).toContain('export function helper()');
    });

    it('should update imports in source project to use target import path', async () => {
      // Setup: Create a file in lib1
      tree.write(
        'packages/lib1/src/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      // Create another file that imports it
      tree.write(
        'packages/lib1/src/main.ts',
        "import { helper } from './utils/helper';\n\nexport const result = helper();",
      );

      const options: MoveFileGeneratorSchema = {
        source: 'packages/lib1/src/utils/helper.ts',
        target: 'packages/lib2/src/utils/helper.ts',
      };

      await moveFileGenerator(tree, options);

      // Imports should be updated to use target import path
      const mainContent = tree.read('packages/lib1/src/main.ts', 'utf-8');
      expect(mainContent).toContain("from '@test/lib2'");
    });
  });

  describe('moving a file that is exported', () => {
    it('should move the file and export it from target project', async () => {
      // Setup: Create a file and export it
      tree.write(
        'packages/lib1/src/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      tree.write(
        'packages/lib1/src/index.ts',
        "export * from './utils/helper';",
      );

      const options: MoveFileGeneratorSchema = {
        source: 'packages/lib1/src/utils/helper.ts',
        target: 'packages/lib2/src/utils/helper.ts',
      };

      await moveFileGenerator(tree, options);

      // File should be moved
      expect(tree.exists('packages/lib1/src/utils/helper.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/utils/helper.ts')).toBe(true);

      // Target index should export it
      const targetIndex = tree.read('packages/lib2/src/index.ts', 'utf-8');
      expect(targetIndex).toContain("export * from './utils/helper'");
    });

    it('should update imports in dependent projects', async () => {
      // Setup: Create a file and export it
      tree.write(
        'packages/lib1/src/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      tree.write(
        'packages/lib1/src/index.ts',
        "export * from './utils/helper';",
      );

      // Create a third project that depends on lib1
      addProjectConfiguration(tree, 'app1', {
        root: 'packages/app1',
        sourceRoot: 'packages/app1/src',
        projectType: 'application',
      });

      tree.write(
        'packages/app1/src/main.ts',
        "import { helper } from '@test/lib1';\n\nconsole.log(helper());",
      );

      const options: MoveFileGeneratorSchema = {
        source: 'packages/lib1/src/utils/helper.ts',
        target: 'packages/lib2/src/utils/helper.ts',
      };

      await moveFileGenerator(tree, options);

      // App should now import from lib2
      const appContent = tree.read('packages/app1/src/main.ts', 'utf-8');
      expect(appContent).toContain("from '@test/lib2'");
    });
  });

  describe('error handling', () => {
    it('should throw error if source file does not exist', async () => {
      const options: MoveFileGeneratorSchema = {
        source: 'packages/lib1/src/utils/non-existent.ts',
        target: 'packages/lib2/src/utils/non-existent.ts',
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        'Source file "packages/lib1/src/utils/non-existent.ts" not found',
      );
    });

    it('should throw error if source project cannot be determined', async () => {
      // Create a file that doesn't belong to any project
      tree.write(
        'unknown/path/helper.ts',
        'export function helper() { return "hello"; }',
      );

      const options: MoveFileGeneratorSchema = {
        source: 'unknown/path/helper.ts',
        target: 'packages/lib2/src/helper.ts',
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        'Could not determine source project for file',
      );
    });

    it('should throw error if target project cannot be determined', async () => {
      tree.write(
        'packages/lib1/src/helper.ts',
        'export function helper() { return "hello"; }',
      );

      const options: MoveFileGeneratorSchema = {
        source: 'packages/lib1/src/helper.ts',
        target: 'unknown/path/helper.ts',
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        'Could not determine target project for file',
      );
    });

    it('should throw error for path traversal in source', async () => {
      const options: MoveFileGeneratorSchema = {
        source: '../../../etc/passwd',
        target: 'packages/lib2/src/helper.ts',
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        'Invalid path: path traversal detected',
      );
    });

    it('should throw error for path traversal in target', async () => {
      tree.write(
        'packages/lib1/src/helper.ts',
        'export function helper() { return "hello"; }',
      );

      const options: MoveFileGeneratorSchema = {
        source: 'packages/lib1/src/helper.ts',
        target: '../../etc/passwd',
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        'Invalid path: path traversal detected',
      );
    });
  });
});

describe('sanitizePath', () => {
  describe('valid paths', () => {
    it('should normalize a simple relative path', () => {
      expect(sanitizePath('packages/lib1/src/file.ts')).toBe(
        'packages/lib1/src/file.ts',
      );
    });

    it('should remove leading slash', () => {
      expect(sanitizePath('/packages/lib1/src/file.ts')).toBe(
        'packages/lib1/src/file.ts',
      );
    });

    it('should normalize path with single dots', () => {
      expect(sanitizePath('packages/./lib1/./src/file.ts')).toBe(
        'packages/lib1/src/file.ts',
      );
    });

    it('should handle paths with forward slashes', () => {
      expect(sanitizePath('packages/lib1/src/utils/file.ts')).toBe(
        'packages/lib1/src/utils/file.ts',
      );
    });

    it('should normalize paths with redundant slashes', () => {
      expect(sanitizePath('packages//lib1///src/file.ts')).toBe(
        'packages/lib1/src/file.ts',
      );
    });

    it('should handle relative navigation within workspace', () => {
      expect(sanitizePath('packages/lib1/../lib2/src/file.ts')).toBe(
        'packages/lib2/src/file.ts',
      );
    });

    it('should handle complex relative navigation within workspace', () => {
      expect(sanitizePath('packages/lib1/src/../../lib2/src/file.ts')).toBe(
        'packages/lib2/src/file.ts',
      );
    });
  });

  describe('path traversal attacks', () => {
    it('should throw error for simple parent directory traversal', () => {
      expect(() => sanitizePath('../etc/passwd')).toThrow(
        'Invalid path: path traversal detected in "../etc/passwd"',
      );
    });

    it('should throw error for multiple parent directory traversal', () => {
      expect(() => sanitizePath('../../../etc/passwd')).toThrow(
        'Invalid path: path traversal detected',
      );
    });

    it('should throw error for parent directory in middle of path', () => {
      expect(() => sanitizePath('packages/../../../etc/passwd')).toThrow(
        'Invalid path: path traversal detected',
      );
    });

    it('should throw error for path that escapes workspace after normalization', () => {
      expect(() => sanitizePath('packages/lib1/../../../etc/passwd')).toThrow(
        'Invalid path: path traversal detected',
      );
    });

    it('should throw error for absolute path traversal', () => {
      expect(() => sanitizePath('/../../etc/passwd')).toThrow(
        'Invalid path: path traversal detected',
      );
    });

    it('should throw error for path that escapes to parent after normalization', () => {
      expect(() => sanitizePath('packages/lib1/../../../outside.ts')).toThrow(
        'Invalid path: path traversal detected',
      );
    });

    it('should handle Windows-style paths within workspace', () => {
      // On Windows, path.normalize will convert backslashes
      // This test verifies normal Windows paths work
      const testPath = 'packages\\lib1\\src\\file.ts';
      const result = sanitizePath(testPath);
      // Result depends on platform - just verify it doesn't throw
      expect(result).toBeTruthy();
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      expect(sanitizePath('')).toBe('.');
    });

    it('should handle root path', () => {
      expect(sanitizePath('/')).toBe('.');
    });

    it('should handle path with only dots', () => {
      expect(sanitizePath('./././')).toBe('./');
    });

    it('should handle deep nested paths', () => {
      expect(
        sanitizePath('packages/lib1/src/utils/helpers/deep/nested/file.ts'),
      ).toBe('packages/lib1/src/utils/helpers/deep/nested/file.ts');
    });

    it('should handle paths with special characters in filenames', () => {
      expect(sanitizePath('packages/lib1/src/@special-file.ts')).toBe(
        'packages/lib1/src/@special-file.ts',
      );
    });

    it('should handle paths with spaces', () => {
      expect(sanitizePath('packages/lib1/src/file name.ts')).toBe(
        'packages/lib1/src/file name.ts',
      );
    });
  });
});

describe('escapeRegex', () => {
  describe('special regex characters', () => {
    it('should escape dot character', () => {
      expect(escapeRegex('file.ts')).toBe('file\\.ts');
    });

    it('should escape asterisk', () => {
      expect(escapeRegex('file*.ts')).toBe('file\\*\\.ts');
    });

    it('should escape plus', () => {
      expect(escapeRegex('file+.ts')).toBe('file\\+\\.ts');
    });

    it('should escape question mark', () => {
      expect(escapeRegex('file?.ts')).toBe('file\\?\\.ts');
    });

    it('should escape caret', () => {
      expect(escapeRegex('^file.ts')).toBe('\\^file\\.ts');
    });

    it('should escape dollar sign', () => {
      expect(escapeRegex('file$.ts')).toBe('file\\$\\.ts');
    });

    it('should escape curly braces', () => {
      expect(escapeRegex('file{1,2}.ts')).toBe('file\\{1,2\\}\\.ts');
    });

    it('should escape parentheses', () => {
      expect(escapeRegex('(file).ts')).toBe('\\(file\\)\\.ts');
    });

    it('should escape pipe', () => {
      expect(escapeRegex('file|name.ts')).toBe('file\\|name\\.ts');
    });

    it('should escape square brackets', () => {
      expect(escapeRegex('[file].ts')).toBe('\\[file\\]\\.ts');
    });

    it('should escape backslash', () => {
      expect(escapeRegex('file\\name.ts')).toBe('file\\\\name\\.ts');
    });
  });

  describe('combinations of special characters', () => {
    it('should escape multiple special characters', () => {
      expect(escapeRegex('file*.ts?^$')).toBe('file\\*\\.ts\\?\\^\\$');
    });

    it('should escape all special characters together', () => {
      expect(escapeRegex('.*+?^${}()|[]\\')).toBe(
        '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\',
      );
    });

    it('should escape path-like strings with dots', () => {
      expect(escapeRegex('packages/lib1/src/file.ts')).toBe(
        'packages/lib1/src/file\\.ts',
      );
    });

    it('should escape regex patterns', () => {
      expect(escapeRegex('(test|demo)+')).toBe('\\(test\\|demo\\)\\+');
    });
  });

  describe('regular strings', () => {
    it('should not modify strings without special characters', () => {
      expect(escapeRegex('filename')).toBe('filename');
    });

    it('should handle empty string', () => {
      expect(escapeRegex('')).toBe('');
    });

    it('should handle alphanumeric with underscores and hyphens', () => {
      expect(escapeRegex('file_name-123')).toBe('file_name-123');
    });

    it('should handle paths without dots', () => {
      expect(escapeRegex('packages/lib1/src/file')).toBe(
        'packages/lib1/src/file',
      );
    });
  });

  describe('ReDoS prevention scenarios', () => {
    it('should escape repeated special characters that could cause ReDoS', () => {
      const malicious = '((((((((((a+)+)+)+)+)+)+)+)+)+)';
      const escaped = escapeRegex(malicious);
      expect(escaped).toBe(
        '\\(\\(\\(\\(\\(\\(\\(\\(\\(\\(a\\+\\)\\+\\)\\+\\)\\+\\)\\+\\)\\+\\)\\+\\)\\+\\)\\+\\)\\+\\)',
      );
      // Verify the escaped version is safe to use in a regex
      expect(() => new RegExp(escaped)).not.toThrow();
    });

    it('should escape nested quantifiers', () => {
      const malicious = 'a*+';
      const escaped = escapeRegex(malicious);
      expect(escaped).toBe('a\\*\\+');
    });

    it('should escape alternation patterns', () => {
      const malicious = '(a|b)*c';
      const escaped = escapeRegex(malicious);
      expect(escaped).toBe('\\(a\\|b\\)\\*c');
    });

    it('should handle complex ReDoS patterns', () => {
      const malicious = '(a+)+$';
      const escaped = escapeRegex(malicious);
      expect(escaped).toBe('\\(a\\+\\)\\+\\$');
      // Verify it's safe
      const regex = new RegExp(escaped);
      expect(() => regex.test('aaa')).not.toThrow();
    });
  });

  describe('real-world file path scenarios', () => {
    it('should escape TypeScript file extensions', () => {
      expect(escapeRegex('component.tsx')).toBe('component\\.tsx');
    });

    it('should escape scoped package names', () => {
      expect(escapeRegex('@angular/core')).toBe('@angular/core');
    });

    it('should escape file paths with version numbers', () => {
      expect(escapeRegex('lib-v1.2.3.ts')).toBe('lib-v1\\.2\\.3\\.ts');
    });

    it('should escape glob-like patterns in filenames', () => {
      expect(escapeRegex('test*.spec.ts')).toBe('test\\*\\.spec\\.ts');
    });
  });

  describe('use in actual regex patterns', () => {
    it('escaped string should work correctly in regex', () => {
      const filename = 'test.file.ts';
      const escaped = escapeRegex(filename);
      const regex = new RegExp(`from\\s+['"].*${escaped}['"]`);

      expect(regex.test("from './test.file.ts'")).toBe(true);
      expect(regex.test("from './test_file.ts'")).toBe(false);
    });

    it('should prevent regex special meaning in patterns', () => {
      const userInput = 'test*.ts'; // User tries to use wildcard
      const escaped = escapeRegex(userInput);
      const regex = new RegExp(escaped);

      // Should match literally "test*.ts", not "test" followed by anything
      expect(regex.test('test*.ts')).toBe(true);
      expect(regex.test('test123.ts')).toBe(false);
      expect(regex.test('testanything.ts')).toBe(false);
    });
  });
});
