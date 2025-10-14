import { Tree, ProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { getProjectImportPath } from './get-project-import-path';
import { clearCompilerPathsCache } from './read-compiler-paths';
import { treeReadCache } from '../tree-cache';

describe('getProjectImportPath', () => {
  let tree: Tree;
  let project: ProjectConfiguration;

  beforeEach(() => {
    clearCompilerPathsCache();
    treeReadCache.clear();
    tree = createTreeWithEmptyWorkspace();
    // Remove the default tsconfig.base.json created by createTreeWithEmptyWorkspace
    if (tree.exists('tsconfig.base.json')) {
      tree.delete('tsconfig.base.json');
    }
    if (tree.exists('tsconfig.json')) {
      tree.delete('tsconfig.json');
    }
    clearCompilerPathsCache();
    treeReadCache.clear();
    project = {
      root: 'packages/lib1',
      sourceRoot: 'packages/lib1/src',
      projectType: 'library',
    };
  });

  afterEach(() => {
    clearCompilerPathsCache();
    treeReadCache.clear();
  });

  describe('direct alias', () => {
    it('should return the alias for a project', () => {
      tree.write(
        'tsconfig.base.json',
        JSON.stringify({
          compilerOptions: {
            paths: {
              '@myorg/lib1': ['packages/lib1/src/index.ts'],
            },
          },
        }),
      );

      const result = getProjectImportPath(tree, 'lib1', project);

      expect(result).toBe('@myorg/lib1');
    });

    it('should return the first matching alias', () => {
      tree.write(
        'tsconfig.base.json',
        JSON.stringify({
          compilerOptions: {
            paths: {
              '@myorg/lib1': ['packages/lib1/src/index.ts'],
              '@myorg/lib1-alt': ['packages/lib1/src/public-api.ts'],
            },
          },
        }),
      );

      const result = getProjectImportPath(tree, 'lib1', project);

      expect(result).toBe('@myorg/lib1');
    });

    it('should work with actual file existing', () => {
      tree.write('packages/lib1/src/index.ts', 'export * from "./lib";');
      tree.write(
        'tsconfig.base.json',
        JSON.stringify({
          compilerOptions: {
            paths: {
              '@myorg/lib1': ['packages/lib1/src/index.ts'],
            },
          },
        }),
      );

      const result = getProjectImportPath(tree, 'lib1', project);

      expect(result).toBe('@myorg/lib1');
    });
  });

  describe('wildcard alias', () => {
    it('should not match wildcard patterns (wildcards not expanded)', () => {
      // Wildcard patterns in tsconfig paths are not expanded during matching
      // so they won't be detected as pointing to project index
      tree.write(
        'tsconfig.base.json',
        JSON.stringify({
          compilerOptions: {
            paths: {
              '@myorg/*': ['packages/*/src/index.ts'],
            },
          },
        }),
      );

      const result = getProjectImportPath(tree, 'lib1', project);

      // Returns null because wildcard path doesn't match sourceRoot literally
      expect(result).toBeNull();
    });

    it('should match when wildcard pattern points to actual file path', () => {
      // If the resolved path (after wildcard) points to an actual file
      // But this requires the tsconfig to have the expanded path, not a pattern
      const rootProject: ProjectConfiguration = {
        root: 'lib1',
        sourceRoot: 'lib1',
        projectType: 'library',
      };

      tree.write(
        'tsconfig.base.json',
        JSON.stringify({
          compilerOptions: {
            paths: {
              '@myorg/lib1': ['lib1/index.ts'],
            },
          },
        }),
      );

      const result = getProjectImportPath(tree, 'lib1', rootProject);

      expect(result).toBe('@myorg/lib1');
    });
  });

  describe('no matching alias', () => {
    it('should return null when no tsconfig exists', () => {
      const result = getProjectImportPath(tree, 'lib1', project);

      expect(result).toBeNull();
    });

    it('should return null when no paths in tsconfig', () => {
      tree.write(
        'tsconfig.base.json',
        JSON.stringify({
          compilerOptions: {},
        }),
      );

      const result = getProjectImportPath(tree, 'lib1', project);

      expect(result).toBeNull();
    });

    it('should return null when no matching path', () => {
      tree.write(
        'tsconfig.base.json',
        JSON.stringify({
          compilerOptions: {
            paths: {
              '@myorg/lib2': ['packages/lib2/src/index.ts'],
            },
          },
        }),
      );

      const result = getProjectImportPath(tree, 'lib1', project);

      expect(result).toBeNull();
    });

    it('should return null when path does not point to index', () => {
      tree.write(
        'tsconfig.base.json',
        JSON.stringify({
          compilerOptions: {
            paths: {
              '@myorg/lib1/utils': ['packages/lib1/src/lib/utils.ts'],
            },
          },
        }),
      );

      const result = getProjectImportPath(tree, 'lib1', project);

      expect(result).toBeNull();
    });
  });

  describe('different project structures', () => {
    it('should work with project without sourceRoot', () => {
      const noSourceProject: ProjectConfiguration = {
        root: 'packages/lib2',
        projectType: 'library',
      };

      tree.write(
        'tsconfig.base.json',
        JSON.stringify({
          compilerOptions: {
            paths: {
              '@myorg/lib2': ['packages/lib2/index.ts'],
            },
          },
        }),
      );

      const result = getProjectImportPath(tree, 'lib2', noSourceProject);

      expect(result).toBe('@myorg/lib2');
    });

    it('should work with application project', () => {
      const appProject: ProjectConfiguration = {
        root: 'apps/app1',
        sourceRoot: 'apps/app1/src',
        projectType: 'application',
      };

      tree.write(
        'tsconfig.base.json',
        JSON.stringify({
          compilerOptions: {
            paths: {
              '@myorg/app1': ['apps/app1/src/index.ts'],
            },
          },
        }),
      );

      const result = getProjectImportPath(tree, 'app1', appProject);

      expect(result).toBe('@myorg/app1');
    });
  });

  describe('path array values', () => {
    it('should use first path from array', () => {
      tree.write(
        'tsconfig.base.json',
        JSON.stringify({
          compilerOptions: {
            paths: {
              '@myorg/lib1': [
                'packages/lib1/src/index.ts',
                'packages/lib1/src/public-api.ts',
              ],
            },
          },
        }),
      );

      const result = getProjectImportPath(tree, 'lib1', project);

      expect(result).toBe('@myorg/lib1');
    });

    it('should return null when first path does not point to index', () => {
      tree.write(
        'tsconfig.base.json',
        JSON.stringify({
          compilerOptions: {
            paths: {
              '@myorg/lib1': [
                'packages/lib1/src/utils.ts',
                'packages/lib1/src/index.ts',
              ],
            },
          },
        }),
      );

      const result = getProjectImportPath(tree, 'lib1', project);

      expect(result).toBeNull();
    });
  });

  describe('public-api pattern', () => {
    it('should match public-api.ts entry point', () => {
      tree.write(
        'tsconfig.base.json',
        JSON.stringify({
          compilerOptions: {
            paths: {
              '@myorg/lib1': ['packages/lib1/src/public-api.ts'],
            },
          },
        }),
      );

      const result = getProjectImportPath(tree, 'lib1', project);

      expect(result).toBe('@myorg/lib1');
    });
  });
});
