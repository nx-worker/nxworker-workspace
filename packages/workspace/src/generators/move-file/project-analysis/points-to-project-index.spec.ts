import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { pointsToProjectIndex } from './points-to-project-index';

describe('pointsToProjectIndex', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  describe('file exists', () => {
    it('should return true when index file exists in source root', () => {
      tree.write('packages/lib1/src/index.ts', 'export * from "./lib";');

      const result = pointsToProjectIndex(
        tree,
        'packages/lib1/src/index.ts',
        'packages/lib1/src',
      );

      expect(result).toBe(true);
    });

    it('should return true when public-api file exists', () => {
      tree.write('packages/lib1/src/public-api.ts', 'export * from "./lib";');

      const result = pointsToProjectIndex(
        tree,
        'packages/lib1/src/public-api.ts',
        'packages/lib1/src',
      );

      expect(result).toBe(true);
    });

    it('should return true when file exists and matches pattern', () => {
      tree.write('packages/lib1/src/lib/index.ts', 'export * from "./file";');

      const result = pointsToProjectIndex(
        tree,
        'packages/lib1/src/lib/index.ts',
        'packages/lib1/src',
      );

      expect(result).toBe(true);
    });
  });

  describe('file does not exist but matches pattern', () => {
    it('should return true for index.ts pattern in root', () => {
      const result = pointsToProjectIndex(
        tree,
        'packages/lib1/src/index.ts',
        'packages/lib1/src',
      );

      expect(result).toBe(true);
    });

    it('should return true for public-api.ts pattern', () => {
      const result = pointsToProjectIndex(
        tree,
        'packages/lib1/src/public-api.ts',
        'packages/lib1/src',
      );

      expect(result).toBe(true);
    });

    it('should return true for index in lib/ directory', () => {
      const result = pointsToProjectIndex(
        tree,
        'packages/lib1/src/lib/index.ts',
        'packages/lib1/src',
      );

      expect(result).toBe(true);
    });

    it('should return true for main.ts in src/', () => {
      const result = pointsToProjectIndex(
        tree,
        'apps/app1/src/main.ts',
        'apps/app1/src',
      );

      expect(result).toBe(true);
    });
  });

  describe('path not in source root', () => {
    it('should return false for path outside source root', () => {
      const result = pointsToProjectIndex(
        tree,
        'packages/lib2/src/index.ts',
        'packages/lib1/src',
      );

      expect(result).toBe(false);
    });

    it('should return false for path in parent directory', () => {
      const result = pointsToProjectIndex(
        tree,
        'packages/index.ts',
        'packages/lib1/src',
      );

      expect(result).toBe(false);
    });

    it('should return false for completely unrelated path', () => {
      const result = pointsToProjectIndex(
        tree,
        'apps/app1/src/index.ts',
        'packages/lib1/src',
      );

      expect(result).toBe(false);
    });
  });

  describe('non-index files', () => {
    it('should return true for any existing file in source root', () => {
      // Per implementation: if file exists, return true (before pattern check)
      tree.write('packages/lib1/src/utils.ts', 'export function util() {}');

      const result = pointsToProjectIndex(
        tree,
        'packages/lib1/src/utils.ts',
        'packages/lib1/src',
      );

      expect(result).toBe(true); // File exists, so returns true
    });

    it('should return false for nested non-index file that does not exist', () => {
      const result = pointsToProjectIndex(
        tree,
        'packages/lib1/src/lib/utils.ts',
        'packages/lib1/src',
      );

      expect(result).toBe(false);
    });
  });

  describe('path normalization', () => {
    it('should handle paths without normalization', () => {
      tree.write('packages/lib1/src/index.ts', 'export * from "./lib";');

      const result = pointsToProjectIndex(
        tree,
        'packages/lib1/src/index.ts',
        'packages/lib1/src',
      );

      expect(result).toBe(true);
    });

    it('should normalize paths with .. segments', () => {
      tree.write('packages/lib1/src/index.ts', 'export * from "./lib";');

      const result = pointsToProjectIndex(
        tree,
        'packages/lib1/src/../src/index.ts',
        'packages/lib1/src',
      );

      // normalizePath should resolve '..' to the correct path
      expect(result).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle source root without trailing slash', () => {
      tree.write('packages/lib1/src/index.ts', 'export * from "./lib";');

      const result = pointsToProjectIndex(
        tree,
        'packages/lib1/src/index.ts',
        'packages/lib1/src',
      );

      expect(result).toBe(true);
    });

    it('should handle empty path', () => {
      const result = pointsToProjectIndex(tree, '', 'packages/lib1/src');

      expect(result).toBe(false);
    });

    it('should handle path equal to source root', () => {
      const result = pointsToProjectIndex(
        tree,
        'packages/lib1/src',
        'packages/lib1/src',
      );

      expect(result).toBe(false); // Source root itself is not an index file
    });
  });
});
