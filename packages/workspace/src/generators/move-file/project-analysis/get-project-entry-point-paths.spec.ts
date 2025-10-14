import { Tree, ProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { getProjectEntryPointPaths } from './get-project-entry-point-paths';
import { clearCompilerPathsCache } from './read-compiler-paths';

describe('getProjectEntryPointPaths', () => {
  let tree: Tree;
  let project: ProjectConfiguration;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    clearCompilerPathsCache();
    project = {
      root: 'packages/lib1',
      sourceRoot: 'packages/lib1/src',
      projectType: 'library',
    };
  });

  afterEach(() => {
    clearCompilerPathsCache();
  });

  describe('with tsconfig paths', () => {
    it('should find entry point from tsconfig paths', () => {
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

      const result = getProjectEntryPointPaths(tree, project);

      expect(result).toContain('packages/lib1/src/index.ts');
    });

    it('should find multiple entry points from tsconfig', () => {
      tree.write(
        'tsconfig.base.json',
        JSON.stringify({
          compilerOptions: {
            paths: {
              '@myorg/lib1': ['packages/lib1/src/index.ts'],
              '@myorg/lib1/api': ['packages/lib1/src/public-api.ts'],
            },
          },
        }),
      );

      const result = getProjectEntryPointPaths(tree, project);

      expect(result).toContain('packages/lib1/src/index.ts');
      expect(result).toContain('packages/lib1/src/public-api.ts');
    });

    it('should filter out paths not pointing to project', () => {
      tree.write(
        'tsconfig.base.json',
        JSON.stringify({
          compilerOptions: {
            paths: {
              '@myorg/lib1': ['packages/lib1/src/index.ts'],
              '@myorg/lib2': ['packages/lib2/src/index.ts'],
            },
          },
        }),
      );

      const result = getProjectEntryPointPaths(tree, project);

      expect(result).toContain('packages/lib1/src/index.ts');
      expect(result).not.toContain('packages/lib2/src/index.ts');
    });

    it('should include fallback paths even when tsconfig exists', () => {
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

      const result = getProjectEntryPointPaths(tree, project);

      // Should have both tsconfig entry and fallback entries
      expect(result.length).toBeGreaterThan(1);
    });

    it('should deduplicate paths', () => {
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

      const result = getProjectEntryPointPaths(tree, project);

      const uniquePaths = new Set(result);
      expect(uniquePaths.size).toBe(result.length);
    });
  });

  describe('without tsconfig paths', () => {
    it('should return fallback entry points', () => {
      const result = getProjectEntryPointPaths(tree, project);

      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('packages/lib1/src/index.ts');
      expect(result).toContain('packages/lib1/src/public-api.ts');
    });

    it('should include all fallback extensions', () => {
      const result = getProjectEntryPointPaths(tree, project);

      const extensions = ['ts', 'tsx', 'js', 'jsx', 'mts', 'mjs', 'cts', 'cjs'];

      extensions.forEach((ext) => {
        const hasIndexExt = result.some((p) => p.endsWith(`index.${ext}`));
        expect(hasIndexExt).toBe(true);
      });
    });
  });

  describe('with actual files', () => {
    it('should prefer actual file over pattern match', () => {
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

      const result = getProjectEntryPointPaths(tree, project);

      expect(result).toContain('packages/lib1/src/index.ts');
    });
  });

  describe('different project types', () => {
    it('should work for application projects', () => {
      const appProject: ProjectConfiguration = {
        root: 'apps/app1',
        sourceRoot: 'apps/app1/src',
        projectType: 'application',
      };

      const result = getProjectEntryPointPaths(tree, appProject);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should work for projects without sourceRoot', () => {
      const noSourceProject: ProjectConfiguration = {
        root: 'packages/lib2',
        projectType: 'library',
      };

      const result = getProjectEntryPointPaths(tree, noSourceProject);

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('path normalization', () => {
    it('should normalize all returned paths', () => {
      const result = getProjectEntryPointPaths(tree, project);

      result.forEach((path) => {
        expect(path).not.toContain('\\');
        expect(path).not.toContain('//');
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty tsconfig paths', () => {
      tree.write(
        'tsconfig.base.json',
        JSON.stringify({
          compilerOptions: {
            paths: {},
          },
        }),
      );

      const result = getProjectEntryPointPaths(tree, project);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle tsconfig with array path values', () => {
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

      const result = getProjectEntryPointPaths(tree, project);

      // Should use first entry from array
      expect(result).toContain('packages/lib1/src/index.ts');
    });
  });
});
