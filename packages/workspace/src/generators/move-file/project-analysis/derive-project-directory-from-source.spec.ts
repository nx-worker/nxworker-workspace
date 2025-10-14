import { ProjectConfiguration } from '@nx/devkit';
import { deriveProjectDirectoryFromSource } from './derive-project-directory-from-source';

describe('deriveProjectDirectoryFromSource', () => {
  describe('library projects', () => {
    const libraryProject: ProjectConfiguration = {
      root: 'packages/lib1',
      sourceRoot: 'packages/lib1/src',
      projectType: 'library',
    };

    it('should derive directory from nested lib path', () => {
      const result = deriveProjectDirectoryFromSource(
        'packages/lib1/src/lib/utils/string-utils.ts',
        libraryProject,
      );

      expect(result).toBe('utils');
    });

    it('should derive deeply nested directory', () => {
      const result = deriveProjectDirectoryFromSource(
        'packages/lib1/src/lib/utils/string/helpers.ts',
        libraryProject,
      );

      expect(result).toBe('utils/string');
    });

    it('should return undefined for file directly in lib/', () => {
      const result = deriveProjectDirectoryFromSource(
        'packages/lib1/src/lib/utils.ts',
        libraryProject,
      );

      expect(result).toBeUndefined();
    });

    it('should return undefined for file not in lib/', () => {
      const result = deriveProjectDirectoryFromSource(
        'packages/lib1/src/index.ts',
        libraryProject,
      );

      expect(result).toBeUndefined();
    });

    it('should return undefined for file in root', () => {
      const result = deriveProjectDirectoryFromSource(
        'packages/lib1/README.md',
        libraryProject,
      );

      expect(result).toBeUndefined();
    });
  });

  describe('application projects', () => {
    const appProject: ProjectConfiguration = {
      root: 'apps/app1',
      sourceRoot: 'apps/app1/src',
      projectType: 'application',
    };

    it('should derive directory from nested app path', () => {
      const result = deriveProjectDirectoryFromSource(
        'apps/app1/src/app/components/button.tsx',
        appProject,
      );

      expect(result).toBe('components');
    });

    it('should derive deeply nested directory', () => {
      const result = deriveProjectDirectoryFromSource(
        'apps/app1/src/app/features/auth/login.tsx',
        appProject,
      );

      expect(result).toBe('features/auth');
    });

    it('should return undefined for file directly in app/', () => {
      const result = deriveProjectDirectoryFromSource(
        'apps/app1/src/app/app.tsx',
        appProject,
      );

      expect(result).toBeUndefined();
    });

    it('should return undefined for file not in app/', () => {
      const result = deriveProjectDirectoryFromSource(
        'apps/app1/src/main.ts',
        appProject,
      );

      expect(result).toBeUndefined();
    });
  });

  describe('projects without sourceRoot', () => {
    it('should use root as sourceRoot', () => {
      const project: ProjectConfiguration = {
        root: 'packages/lib2',
        projectType: 'library',
      };

      const result = deriveProjectDirectoryFromSource(
        'packages/lib2/lib/utils/helper.ts',
        project,
      );

      expect(result).toBe('utils');
    });
  });

  describe('edge cases', () => {
    const libraryProject: ProjectConfiguration = {
      root: 'packages/lib1',
      sourceRoot: 'packages/lib1/src',
      projectType: 'library',
    };

    it('should handle single-level nesting', () => {
      const result = deriveProjectDirectoryFromSource(
        'packages/lib1/src/lib/x/file.ts',
        libraryProject,
      );

      expect(result).toBe('x');
    });

    it('should preserve directory names with special characters', () => {
      const result = deriveProjectDirectoryFromSource(
        'packages/lib1/src/lib/my-utils_v2/helper.ts',
        libraryProject,
      );

      expect(result).toBe('my-utils_v2');
    });

    it('should handle files with multiple extensions', () => {
      const result = deriveProjectDirectoryFromSource(
        'packages/lib1/src/lib/test/file.spec.ts',
        libraryProject,
      );

      expect(result).toBe('test');
    });
  });
});
