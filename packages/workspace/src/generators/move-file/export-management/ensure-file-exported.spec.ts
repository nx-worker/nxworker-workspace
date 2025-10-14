import { Tree, logger } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { ensureFileExported } from './ensure-file-exported';
import type { ProjectConfiguration } from '@nx/devkit';
import { treeReadCache } from '../tree-cache';
import { clearCompilerPathsCache } from '../project-analysis/read-compiler-paths';

describe('ensureFileExported', () => {
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

  it('should add export statement to existing entrypoint', () => {
    tree.write('libs/mylib/src/index.ts', '// Existing exports\n');
    ensureFileExported(tree, project, 'lib/utils.ts', cachedTreeExists);

    const content = tree.read('libs/mylib/src/index.ts', 'utf-8');
    expect(content).toContain(`export * from './lib/utils';`);
    expect(logger.verbose).toHaveBeenCalledWith(
      'Added export to libs/mylib/src/index.ts',
    );
  });

  it('should not duplicate existing exports', () => {
    tree.write('libs/mylib/src/index.ts', `export * from './lib/utils';\n`);
    ensureFileExported(tree, project, 'lib/utils.ts', cachedTreeExists);

    const content = tree.read('libs/mylib/src/index.ts', 'utf-8');
    const matches = content.match(/export \* from '\.\/lib\/utils'/g);
    expect(matches).toHaveLength(1);
    expect(logger.verbose).not.toHaveBeenCalled();
  });

  it('should create new entrypoint with export when none exists', () => {
    // Pre-create an empty index file like integration tests do
    tree.write('libs/mylib/src/index.ts', '');
    
    ensureFileExported(tree, project, 'lib/utils.ts', cachedTreeExists);

    const content = tree.read('libs/mylib/src/index.ts', 'utf-8');
    expect(content).toBe(`export * from './lib/utils';\n`);
    expect(logger.verbose).toHaveBeenCalledWith(
      'Added export to libs/mylib/src/index.ts',
    );
  });

  it('should use first existing entrypoint', () => {
    tree.write('libs/mylib/src/index.tsx', '// TSX entrypoint\n');
    ensureFileExported(tree, project, 'lib/utils.ts', cachedTreeExists);

    const tsxContent = tree.read('libs/mylib/src/index.tsx', 'utf-8');
    expect(tsxContent).toContain(`export * from './lib/utils';`);

    // Should not create index.ts
    const tsExists = tree.exists('libs/mylib/src/index.ts');
    expect(tsExists).toBe(false);
  });

  it('should use first path when no entrypoint exists', () => {
    // Pre-create empty index file
    tree.write('libs/mylib/src/index.ts', '');
    
    ensureFileExported(tree, project, 'lib/utils.ts', cachedTreeExists);

    // Should write to index.ts (first in the default list)
    const content = tree.read('libs/mylib/src/index.ts', 'utf-8');
    expect(content).toBe(`export * from './lib/utils';\n`);
  });

  it('should handle files without extension', () => {
    tree.write('libs/mylib/src/index.ts', '');
    ensureFileExported(tree, project, 'lib/utils.ts', cachedTreeExists);

    const content = tree.read('libs/mylib/src/index.ts', 'utf-8');
    expect(content).toContain(`export * from './lib/utils';`);
  });

  it('should handle nested file paths', () => {
    tree.write('libs/mylib/src/index.ts', '');
    ensureFileExported(tree, project, 'lib/nested/utils.ts', cachedTreeExists);

    const content = tree.read('libs/mylib/src/index.ts', 'utf-8');
    expect(content).toContain(`export * from './lib/nested/utils';`);
  });

  it('should append to existing exports', () => {
    tree.write('libs/mylib/src/index.ts', `export * from './lib/helpers';\n`);
    ensureFileExported(tree, project, 'lib/utils.ts', cachedTreeExists);

    const content = tree.read('libs/mylib/src/index.ts', 'utf-8');
    expect(content).toContain(`export * from './lib/helpers';`);
    expect(content).toContain(`export * from './lib/utils';`);
  });

  it('should handle project without sourceRoot', () => {
    const projectWithoutSourceRoot: ProjectConfiguration = {
      root: 'libs/mylib',
      name: 'mylib',
    };
    // Pre-create index file
    tree.write('libs/mylib/index.ts', '');
    
    ensureFileExported(tree, projectWithoutSourceRoot, 'lib/utils.ts', cachedTreeExists);

    const content = tree.read('libs/mylib/index.ts', 'utf-8');
    expect(content).toBe(`export * from './lib/utils';\n`);
  });

  it('should strip various file extensions', () => {
    tree.write('libs/mylib/src/index.ts', '');
    ensureFileExported(tree, project, 'lib/utils.tsx', cachedTreeExists);

    const content = tree.read('libs/mylib/src/index.ts', 'utf-8');
    expect(content).toContain(`export * from './lib/utils';`);
    expect(content).not.toContain('.tsx');
  });
});
