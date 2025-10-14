import { Tree, ProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { isProjectEmpty } from './is-project-empty';
import { clearCompilerPathsCache } from './read-compiler-paths';

describe('isProjectEmpty', () => {
  let tree: Tree;
  let project: ProjectConfiguration;

  beforeEach(() => {
    clearCompilerPathsCache();
    tree = createTreeWithEmptyWorkspace();
    // Remove the default tsconfig.base.json created by createTreeWithEmptyWorkspace
    if (tree.exists('tsconfig.base.json')) {
      tree.delete('tsconfig.base.json');
    }
    if (tree.exists('tsconfig.json')) {
      tree.delete('tsconfig.json');
    }
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

  describe('empty projects', () => {
    it('should return true for project with only index.ts', () => {
      tree.write('packages/lib1/src/index.ts', 'export * from "./lib";');

      const result = isProjectEmpty(tree, project);

      expect(result).toBe(true);
    });

    it('should return true for project with only public-api.ts', () => {
      tree.write('packages/lib1/src/public-api.ts', 'export * from "./lib";');

      const result = isProjectEmpty(tree, project);

      expect(result).toBe(true);
    });

    it('should return true for project with both index.ts and public-api.ts', () => {
      tree.write('packages/lib1/src/index.ts', 'export * from "./lib";');
      tree.write('packages/lib1/src/public-api.ts', 'export * from "./lib";');

      const result = isProjectEmpty(tree, project);

      expect(result).toBe(true);
    });

    it('should return true for completely empty project', () => {
      const result = isProjectEmpty(tree, project);

      expect(result).toBe(true);
    });

    it('should ignore non-source files', () => {
      tree.write('packages/lib1/src/index.ts', 'export * from "./lib";');
      tree.write('packages/lib1/src/README.md', '# Library 1');
      tree.write('packages/lib1/package.json', '{}');

      const result = isProjectEmpty(tree, project);

      expect(result).toBe(true);
    });
  });

  describe('non-empty projects', () => {
    it('should return false for project with additional source file', () => {
      tree.write('packages/lib1/src/index.ts', 'export * from "./lib";');
      tree.write('packages/lib1/src/utils.ts', 'export function util() {}');

      const result = isProjectEmpty(tree, project);

      expect(result).toBe(false);
    });

    it('should return false for project with nested source files', () => {
      tree.write('packages/lib1/src/index.ts', 'export * from "./lib";');
      tree.write('packages/lib1/src/lib/utils.ts', 'export function util() {}');

      const result = isProjectEmpty(tree, project);

      expect(result).toBe(false);
    });

    it('should detect TypeScript files', () => {
      tree.write('packages/lib1/src/index.ts', 'export * from "./lib";');
      tree.write('packages/lib1/src/file.ts', 'export const x = 1;');

      const result = isProjectEmpty(tree, project);

      expect(result).toBe(false);
    });

    it('should detect JavaScript files', () => {
      tree.write('packages/lib1/src/index.js', 'export * from "./lib";');
      tree.write('packages/lib1/src/file.js', 'export const x = 1;');

      const result = isProjectEmpty(tree, project);

      expect(result).toBe(false);
    });

    it('should detect TSX files', () => {
      tree.write('packages/lib1/src/index.ts', 'export * from "./lib";');
      tree.write(
        'packages/lib1/src/component.tsx',
        'export const Component = () => null;',
      );

      const result = isProjectEmpty(tree, project);

      expect(result).toBe(false);
    });

    it('should detect JSX files', () => {
      tree.write('packages/lib1/src/index.js', 'export * from "./lib";');
      tree.write(
        'packages/lib1/src/component.jsx',
        'export const Component = () => null;',
      );

      const result = isProjectEmpty(tree, project);

      expect(result).toBe(false);
    });
  });

  describe('with tsconfig paths', () => {
    it('should use tsconfig to identify entry points', () => {
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

      tree.write('packages/lib1/src/index.ts', 'export * from "./lib";');

      const result = isProjectEmpty(tree, project);

      expect(result).toBe(true);
    });

    it('should consider multiple entry points from tsconfig', () => {
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

      tree.write('packages/lib1/src/index.ts', 'export * from "./lib";');
      tree.write('packages/lib1/src/public-api.ts', 'export * from "./lib";');

      const result = isProjectEmpty(tree, project);

      expect(result).toBe(true);
    });
  });

  describe('different project structures', () => {
    it('should work with project without sourceRoot', () => {
      const noSourceProject: ProjectConfiguration = {
        root: 'packages/lib2',
        projectType: 'library',
      };

      tree.write('packages/lib2/index.ts', 'export * from "./lib";');

      const result = isProjectEmpty(tree, noSourceProject);

      expect(result).toBe(true);
    });

    it('should work with application project', () => {
      const appProject: ProjectConfiguration = {
        root: 'apps/app1',
        sourceRoot: 'apps/app1/src',
        projectType: 'application',
      };

      // For apps, main.ts is considered an entry point
      tree.write('apps/app1/src/main.ts', 'console.log("app");');
      tree.write('apps/app1/src/index.ts', 'export * from "./app";');

      const result = isProjectEmpty(tree, appProject);

      // Both main.ts and index.ts should be recognized as entry points
      expect(result).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle deeply nested files', () => {
      tree.write('packages/lib1/src/index.ts', 'export * from "./lib";');
      tree.write(
        'packages/lib1/src/a/b/c/d/utils.ts',
        'export function util() {}',
      );

      const result = isProjectEmpty(tree, project);

      expect(result).toBe(false);
    });

    it('should handle files with multiple extensions', () => {
      tree.write('packages/lib1/src/index.ts', 'export * from "./lib";');
      tree.write(
        'packages/lib1/src/file.spec.ts',
        'describe("test", () => {});',
      );

      const result = isProjectEmpty(tree, project);

      expect(result).toBe(false);
    });

    it('should ignore files in subdirectories that are not source files', () => {
      tree.write('packages/lib1/src/index.ts', 'export * from "./lib";');
      tree.write('packages/lib1/src/docs/README.md', '# Docs');
      tree.write('packages/lib1/src/assets/logo.png', 'binary data');

      const result = isProjectEmpty(tree, project);

      expect(result).toBe(true);
    });
  });

  describe('ESM extensions', () => {
    it('should detect .mts files', () => {
      tree.write('packages/lib1/src/index.mts', 'export * from "./lib";');
      tree.write('packages/lib1/src/file.mts', 'export const x = 1;');

      const result = isProjectEmpty(tree, project);

      expect(result).toBe(false);
    });

    it('should detect .mjs files', () => {
      tree.write('packages/lib1/src/index.mjs', 'export * from "./lib";');
      tree.write('packages/lib1/src/file.mjs', 'export const x = 1;');

      const result = isProjectEmpty(tree, project);

      expect(result).toBe(false);
    });

    it('should detect .cts files', () => {
      tree.write('packages/lib1/src/index.cts', 'export * from "./lib";');
      tree.write('packages/lib1/src/file.cts', 'export const x = 1;');

      const result = isProjectEmpty(tree, project);

      expect(result).toBe(false);
    });

    it('should detect .cjs files', () => {
      tree.write('packages/lib1/src/index.cjs', 'export * from "./lib";');
      tree.write('packages/lib1/src/file.cjs', 'export const x = 1;');

      const result = isProjectEmpty(tree, project);

      expect(result).toBe(false);
    });
  });
});
