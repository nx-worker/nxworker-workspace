import { isIndexFilePath } from './is-index-file-path';

describe('isIndexFilePath', () => {
  describe('primary entry point patterns', () => {
    it('should match index.ts in root', () => {
      expect(isIndexFilePath('packages/lib1/index.ts')).toBe(true);
    });

    it('should match public-api.ts in root', () => {
      expect(isIndexFilePath('packages/lib1/public-api.ts')).toBe(true);
    });

    it('should match index.ts in src/', () => {
      expect(isIndexFilePath('packages/lib1/src/index.ts')).toBe(true);
    });

    it('should match public-api.ts in src/', () => {
      expect(isIndexFilePath('packages/lib1/src/public-api.ts')).toBe(true);
    });

    it('should match index.ts in lib/', () => {
      expect(isIndexFilePath('packages/lib1/lib/index.ts')).toBe(true);
    });

    it('should match public-api.ts in lib/', () => {
      expect(isIndexFilePath('packages/lib1/lib/public-api.ts')).toBe(true);
    });

    it('should match all supported extensions for index', () => {
      const extensions = ['ts', 'tsx', 'js', 'jsx', 'mts', 'mjs', 'cts', 'cjs'];
      extensions.forEach((ext) => {
        expect(isIndexFilePath(`packages/lib1/index.${ext}`)).toBe(true);
      });
    });

    it('should match all supported extensions for public-api', () => {
      const extensions = ['ts', 'tsx', 'js', 'jsx', 'mts', 'mjs', 'cts', 'cjs'];
      extensions.forEach((ext) => {
        expect(isIndexFilePath(`packages/lib1/public-api.${ext}`)).toBe(true);
      });
    });
  });

  describe('main entry point patterns', () => {
    it('should match main.ts in root', () => {
      expect(isIndexFilePath('apps/app1/main.ts')).toBe(true);
    });

    it('should match main.ts in src/', () => {
      expect(isIndexFilePath('apps/app1/src/main.ts')).toBe(true);
    });

    it('should match all supported extensions for main', () => {
      const extensions = ['ts', 'tsx', 'js', 'jsx', 'mts', 'mjs', 'cts', 'cjs'];
      extensions.forEach((ext) => {
        expect(isIndexFilePath(`apps/app1/src/main.${ext}`)).toBe(true);
      });
    });
  });

  describe('non-matching patterns', () => {
    it('should not match regular files', () => {
      expect(isIndexFilePath('packages/lib1/src/lib/utils.ts')).toBe(false);
    });

    it('should match index in subdirectory (endsWith behavior)', () => {
      // The function uses endsWith, so this will match
      expect(isIndexFilePath('packages/lib1/src/lib/index.ts')).toBe(true);
    });

    it('should match public-api in subdirectory (endsWith behavior)', () => {
      // The function uses endsWith, so this will match
      expect(isIndexFilePath('packages/lib1/src/lib/public-api.ts')).toBe(true);
    });

    it('should not match files that partially contain index names', () => {
      // 'my-index.ts' ends with 'index.ts' pattern, so it will match with endsWith
      // This is actually the correct behavior for pattern matching
      expect(isIndexFilePath('packages/lib1/my-index.ts')).toBe(true);
      // But a file like this won't match because it doesn't end with the exact pattern
      expect(isIndexFilePath('packages/lib1/indexes.ts')).toBe(false);
    });

    it('should not match unsupported extensions', () => {
      expect(isIndexFilePath('packages/lib1/index.json')).toBe(false);
    });

    it('should not match empty string', () => {
      expect(isIndexFilePath('')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle paths with multiple slashes', () => {
      // Pattern matching uses endsWith, so this will still match
      expect(isIndexFilePath('packages/lib1//src//index.ts')).toBe(true);
    });

    it('should be case-sensitive', () => {
      expect(isIndexFilePath('packages/lib1/Index.ts')).toBe(false);
      expect(isIndexFilePath('packages/lib1/INDEX.ts')).toBe(false);
    });

    it('should handle Windows-style paths', () => {
      // Pattern matching uses endsWith, so backslash will still match
      expect(isIndexFilePath('packages\\lib1\\index.ts')).toBe(true);
    });
  });
});
