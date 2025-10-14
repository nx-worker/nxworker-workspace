import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { isFileExported } from './is-file-exported';
import type { ProjectConfiguration } from '@nx/devkit';
import { treeReadCache } from '../tree-cache';
import { clearCompilerPathsCache } from '../project-analysis/read-compiler-paths';

describe('isFileExported', () => {
  let tree: Tree;
  let project: ProjectConfiguration;
  let cachedTreeExists: jest.Mock;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    project = {
      root: 'libs/mylib',
      sourceRoot: 'libs/mylib/src',
      name: 'mylib',
    } as ProjectConfiguration;
    cachedTreeExists = jest.fn((t, path) => t.exists(path));
    treeReadCache.clear();
    clearCompilerPathsCache();
  });

  afterEach(() => {
    clearCompilerPathsCache();
  });

  it('should detect export * from pattern', () => {
    tree.write('libs/mylib/src/index.ts', `export * from './lib/utils';\n`);
    expect(isFileExported(tree, project, 'lib/utils.ts', cachedTreeExists)).toBe(true);
  });

  it('should detect export { ... } from pattern', () => {
    tree.write(
      'libs/mylib/src/index.ts',
      `export { helperFn } from './lib/utils';\n`,
    );
    expect(isFileExported(tree, project, 'lib/utils.ts', cachedTreeExists)).toBe(true);
  });

  it('should detect export with named exports', () => {
    tree.write(
      'libs/mylib/src/index.ts',
      `export { helperFn, anotherFn } from './lib/utils';\n`,
    );
    expect(isFileExported(tree, project, 'lib/utils.ts', cachedTreeExists)).toBe(true);
  });

  it('should return false when no export found', () => {
    tree.write('libs/mylib/src/index.ts', `// No exports\n`);
    expect(isFileExported(tree, project, 'lib/utils.ts', cachedTreeExists)).toBe(false);
  });

  it('should return false when entrypoint does not exist', () => {
    expect(isFileExported(tree, project, 'lib/utils.ts', cachedTreeExists)).toBe(false);
  });

  it('should match files without extension', () => {
    tree.write('libs/mylib/src/index.ts', `export * from './lib/utils';\n`);
    expect(isFileExported(tree, project, 'lib/utils.ts', cachedTreeExists)).toBe(true);
    expect(isFileExported(tree, project, 'lib/utils.tsx', cachedTreeExists)).toBe(true);
    expect(isFileExported(tree, project, 'lib/utils.js', cachedTreeExists)).toBe(true);
  });

  it('should handle relative paths correctly', () => {
    tree.write('libs/mylib/src/index.ts', `export * from './lib/utils';\n`);
    expect(isFileExported(tree, project, 'lib/utils.ts', cachedTreeExists)).toBe(true);
  });

  it('should not match partial file names', () => {
    tree.write('libs/mylib/src/index.ts', `export * from './lib/utils';\n`);
    expect(isFileExported(tree, project, 'lib/util.ts', cachedTreeExists)).toBe(false);
  });

  it('should handle nested paths', () => {
    tree.write(
      'libs/mylib/src/index.ts',
      `export * from './lib/nested/utils';\n`,
    );
    expect(isFileExported(tree, project, 'lib/nested/utils.ts', cachedTreeExists)).toBe(true);
  });

  it('should detect exports in multiple entrypoints', () => {
    tree.write('libs/mylib/src/index.ts', `export * from './lib/utils';\n`);
    tree.write('libs/mylib/src/index.tsx', `export * from './lib/other';\n`);
    expect(isFileExported(tree, project, 'lib/utils.ts', cachedTreeExists)).toBe(true);
    expect(isFileExported(tree, project, 'lib/other.ts', cachedTreeExists)).toBe(true);
  });

  it('should handle empty entrypoint file', () => {
    tree.write('libs/mylib/src/index.ts', '');
    expect(isFileExported(tree, project, 'lib/utils.ts', cachedTreeExists)).toBe(false);
  });

  it('should handle export with double quotes', () => {
    tree.write('libs/mylib/src/index.ts', `export * from "./lib/utils";\n`);
    expect(isFileExported(tree, project, 'lib/utils.ts', cachedTreeExists)).toBe(true);
  });

  it('should handle export with single quotes', () => {
    tree.write('libs/mylib/src/index.ts', `export * from './lib/utils';\n`);
    expect(isFileExported(tree, project, 'lib/utils.ts', cachedTreeExists)).toBe(true);
  });

  it('should handle multiple exports in same file', () => {
    tree.write(
      'libs/mylib/src/index.ts',
      `export * from './lib/utils';\nexport * from './lib/helpers';\n`,
    );
    expect(isFileExported(tree, project, 'lib/utils.ts', cachedTreeExists)).toBe(true);
    expect(isFileExported(tree, project, 'lib/helpers.ts', cachedTreeExists)).toBe(true);
    expect(isFileExported(tree, project, 'lib/other.ts', cachedTreeExists)).toBe(false);
  });

  it('should handle project without sourceRoot', () => {
    const projectWithoutSourceRoot: ProjectConfiguration = {
      root: 'libs/mylib',
      name: 'mylib',
    };
    tree.write('libs/mylib/index.ts', `export * from './lib/utils';\n`);
    expect(isFileExported(tree, projectWithoutSourceRoot, 'lib/utils.ts', cachedTreeExists)).toBe(
      true,
    );
  });
});
