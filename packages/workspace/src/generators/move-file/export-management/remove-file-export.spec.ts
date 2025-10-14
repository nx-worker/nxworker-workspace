import { Tree, logger } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { removeFileExport } from './remove-file-export';
import type { ProjectConfiguration } from '@nx/devkit';
import { treeReadCache } from '../tree-cache';
import { clearCompilerPathsCache } from '../project-analysis/read-compiler-paths';

describe('removeFileExport', () => {
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
    jest.spyOn(logger, 'verbose').mockImplementation();
    treeReadCache.clear();
    clearCompilerPathsCache();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    clearCompilerPathsCache();
  });

  it('should remove export * pattern', () => {
    tree.write(
      'libs/mylib/src/index.ts',
      `export * from './lib/utils';\nexport * from './lib/helpers';\n`,
    );
    removeFileExport(tree, project, 'lib/utils.ts', cachedTreeExists);

    const content = tree.read('libs/mylib/src/index.ts', 'utf-8');
    expect(content).not.toContain(`export * from './lib/utils'`);
    expect(content).toContain(`export * from './lib/helpers'`);
    expect(logger.verbose).toHaveBeenCalledWith(
      'Removed export from libs/mylib/src/index.ts',
    );
  });

  it('should remove export { ... } pattern', () => {
    tree.write(
      'libs/mylib/src/index.ts',
      `export { helperFn } from './lib/utils';\nexport * from './lib/helpers';\n`,
    );
    removeFileExport(tree, project, 'lib/utils.ts', cachedTreeExists);

    const content = tree.read('libs/mylib/src/index.ts', 'utf-8');
    expect(content).not.toContain(`export { helperFn } from './lib/utils'`);
    expect(content).toContain(`export * from './lib/helpers'`);
  });

  it('should add export {} when file becomes empty', () => {
    tree.write('libs/mylib/src/index.ts', `export * from './lib/utils';\n`);
    removeFileExport(tree, project, 'lib/utils.ts', cachedTreeExists);

    const content = tree.read('libs/mylib/src/index.ts', 'utf-8');
    expect(content).toBe('export {};\n');
  });

  it('should handle multiple entrypoints', () => {
    tree.write('libs/mylib/src/index.ts', `export * from './lib/utils';\n`);
    tree.write('libs/mylib/src/index.tsx', `export * from './lib/utils';\n`);
    removeFileExport(tree, project, 'lib/utils.ts', cachedTreeExists);

    const tsContent = tree.read('libs/mylib/src/index.ts', 'utf-8');
    const tsxContent = tree.read('libs/mylib/src/index.tsx', 'utf-8');
    expect(tsContent).toBe('export {};\n');
    expect(tsxContent).toBe('export {};\n');
  });

  it('should skip non-existent entrypoints', () => {
    removeFileExport(tree, project, 'lib/utils.ts', cachedTreeExists);
    expect(logger.verbose).not.toHaveBeenCalled();
  });

  it('should not modify file if no matching export found', () => {
    tree.write(
      'libs/mylib/src/index.ts',
      `export * from './lib/helpers';\n`,
    );
    removeFileExport(tree, project, 'lib/utils.ts', cachedTreeExists);

    const content = tree.read('libs/mylib/src/index.ts', 'utf-8');
    expect(content).toBe(`export * from './lib/helpers';\n`);
    expect(logger.verbose).not.toHaveBeenCalled();
  });

  it('should handle files without extension', () => {
    tree.write('libs/mylib/src/index.ts', `export * from './lib/utils';\n`);
    removeFileExport(tree, project, 'lib/utils.ts', cachedTreeExists);

    const content = tree.read('libs/mylib/src/index.ts', 'utf-8');
    expect(content).toBe('export {};\n');
  });

  it('should handle nested file paths', () => {
    tree.write(
      'libs/mylib/src/index.ts',
      `export * from './lib/nested/utils';\nexport * from './lib/helpers';\n`,
    );
    removeFileExport(tree, project, 'lib/nested/utils.ts', cachedTreeExists);

    const content = tree.read('libs/mylib/src/index.ts', 'utf-8');
    expect(content).not.toContain(`export * from './lib/nested/utils'`);
    expect(content).toContain(`export * from './lib/helpers'`);
  });

  it('should remove multiple export patterns for same file', () => {
    tree.write(
      'libs/mylib/src/index.ts',
      `export * from './lib/utils';\nexport { helperFn } from './lib/utils';\nexport * from './lib/helpers';\n`,
    );
    removeFileExport(tree, project, 'lib/utils.ts', cachedTreeExists);

    const content = tree.read('libs/mylib/src/index.ts', 'utf-8');
    expect(content).not.toContain(`export * from './lib/utils'`);
    expect(content).not.toContain(`export { helperFn } from './lib/utils'`);
    expect(content).toContain(`export * from './lib/helpers'`);
  });

  it('should handle export with semicolon', () => {
    tree.write(
      'libs/mylib/src/index.ts',
      `export * from './lib/utils';\nexport * from './lib/helpers';\n`,
    );
    removeFileExport(tree, project, 'lib/utils.ts', cachedTreeExists);

    const content = tree.read('libs/mylib/src/index.ts', 'utf-8');
    expect(content).not.toContain(`export * from './lib/utils'`);
  });

  it('should handle export without semicolon', () => {
    tree.write(
      'libs/mylib/src/index.ts',
      `export * from './lib/utils'\nexport * from './lib/helpers'\n`,
    );
    removeFileExport(tree, project, 'lib/utils.ts', cachedTreeExists);

    const content = tree.read('libs/mylib/src/index.ts', 'utf-8');
    expect(content).not.toContain(`export * from './lib/utils'`);
  });

  it('should handle double quotes', () => {
    tree.write(
      'libs/mylib/src/index.ts',
      `export * from "./lib/utils";\nexport * from "./lib/helpers";\n`,
    );
    removeFileExport(tree, project, 'lib/utils.ts', cachedTreeExists);

    const content = tree.read('libs/mylib/src/index.ts', 'utf-8');
    expect(content).not.toContain(`export * from "./lib/utils"`);
    expect(content).toContain(`export * from "./lib/helpers"`);
  });

  it('should handle project without sourceRoot', () => {
    const projectWithoutSourceRoot: ProjectConfiguration = {
      root: 'libs/mylib',
      name: 'mylib',
    };
    tree.write(
      'libs/mylib/index.ts',
      `export * from './lib/utils';\nexport * from './lib/helpers';\n`,
    );
    removeFileExport(tree, projectWithoutSourceRoot, 'lib/utils.ts', cachedTreeExists);

    const content = tree.read('libs/mylib/index.ts', 'utf-8');
    expect(content).not.toContain(`export * from './lib/utils'`);
    expect(content).toContain(`export * from './lib/helpers'`);
  });

  it('should preserve whitespace when removing exports', () => {
    tree.write(
      'libs/mylib/src/index.ts',
      `export * from './lib/utils';\n\nexport * from './lib/helpers';\n`,
    );
    removeFileExport(tree, project, 'lib/utils.ts', cachedTreeExists);

    const content = tree.read('libs/mylib/src/index.ts', 'utf-8');
    expect(content).toContain(`export * from './lib/helpers'`);
  });
});
