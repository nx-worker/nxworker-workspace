import { jest } from '@jest/globals';
import * as path from 'path';
import { sanitizePath, escapeRegex } from './security-utils';

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
      // Test that path normalization works correctly across platforms
      const testPath = 'packages\\lib1\\src\\file.ts';
      const result = sanitizePath(testPath);

      // On POSIX systems, backslashes are treated as part of the filename
      // On Windows, they're treated as path separators
      // In both cases, the path should normalize to a valid workspace path
      expect(result).toBeTruthy();
      expect(result).not.toMatch(/\.\./); // Should not contain parent directory references
    });

    it('should throw error for Windows-style path traversal on Windows', () => {
      // Mock Windows path separator using jest.replaceProperty
      const restore = jest.replaceProperty(path, 'sep', '\\');

      try {
        // This should be detected as path traversal on Windows
        expect(() => sanitizePath('packages\\..\\..\\..\\etc\\passwd')).toThrow(
          'Invalid path: path traversal detected',
        );
      } finally {
        restore.restore();
      }
    });

    it('should detect path traversal after Windows normalization', () => {
      // Mock Windows path separator and normalize behavior
      const restoreSep = jest.replaceProperty(path, 'sep', '\\');
      
      const normalizeSpy = jest.spyOn(path, 'normalize').mockImplementation((p: string) => {
        // Simulate Windows normalization
        // Remove leading slash
        p = p.replace(/^\//, '');
        // On Windows, resolve .. properly
        const parts = p.split(/[/\\]/);
        const result: string[] = [];
        for (const part of parts) {
          if (part === '..') {
            if (result.length > 0) {
              result.pop();
            } else {
              // Can't go higher, keep the ..
              result.push(part);
            }
          } else if (part !== '.' && part !== '') {
            result.push(part);
          }
        }
        return result.join('\\');
      });

      try {
        // Path that would escape after normalization
        expect(() =>
          sanitizePath('packages\\lib1\\..\\..\\..\\etc\\passwd'),
        ).toThrow('Invalid path: path traversal detected');
      } finally {
        restoreSep.restore();
        normalizeSpy.mockRestore();
      }
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
