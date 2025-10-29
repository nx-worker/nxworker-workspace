import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, addProjectConfiguration } from '@nx/devkit';
import { checkForUnexportedRelativeDependencies } from './check-for-unexported-relative-dependencies';
import { clearCache } from '../jscodeshift-utils';
import { treeReadCache } from '../tree-cache';
import { clearIndexExportsCache } from '../export-management/index-exports-cache';

describe('checkForUnexportedRelativeDependencies', () => {
  let tree: Tree;
  const cachedTreeExists = (t: Tree, filePath: string) => t.exists(filePath);

  beforeEach(() => {
    // Clear AST cache to prevent pollution from previous tests
    clearCache();
    // Clear tree read cache as well
    treeReadCache.clear();
    // Clear index exports cache
    clearIndexExportsCache();

    tree = createTreeWithEmptyWorkspace();

    addProjectConfiguration(tree, 'lib1', {
      root: 'packages/lib1',
      sourceRoot: 'packages/lib1/src',
      projectType: 'library',
    });

    // Create index file
    tree.write('packages/lib1/src/index.ts', '');
  });

  it('should return empty array when file has no imports', () => {
    tree.write(
      'packages/lib1/src/lib/file.ts',
      'export function file() { return "test"; }',
    );

    const result = checkForUnexportedRelativeDependencies(
      tree,
      'packages/lib1/src/lib/file.ts',
      { root: 'packages/lib1', sourceRoot: 'packages/lib1/src' },
      cachedTreeExists,
    );

    expect(result).toEqual([]);
  });

  it('should return empty array when file has only external imports', () => {
    tree.write(
      'packages/lib1/src/lib/file.ts',
      `import { something } from '@test/external';
export function file() { return something; }`,
    );

    const result = checkForUnexportedRelativeDependencies(
      tree,
      'packages/lib1/src/lib/file.ts',
      { root: 'packages/lib1', sourceRoot: 'packages/lib1/src' },
      cachedTreeExists,
    );

    expect(result).toEqual([]);
  });

  it('should return empty array when all relative dependencies are exported', () => {
    // Create dependency file
    tree.write(
      'packages/lib1/src/lib/utils.ts',
      'export function utils() { return "utils"; }',
    );

    // Export it from index
    tree.write('packages/lib1/src/index.ts', "export * from './lib/utils';");

    // Create file that imports the exported dependency
    tree.write(
      'packages/lib1/src/lib/file.ts',
      `import { utils } from './utils';
export function file() { return utils(); }`,
    );

    const result = checkForUnexportedRelativeDependencies(
      tree,
      'packages/lib1/src/lib/file.ts',
      { root: 'packages/lib1', sourceRoot: 'packages/lib1/src' },
      cachedTreeExists,
    );

    expect(result).toEqual([]);
  });

  it('should detect unexported relative dependency', () => {
    // Create dependency file
    tree.write(
      'packages/lib1/src/lib/utils.ts',
      'export function utils() { return "utils"; }',
    );

    // DO NOT export it from index - leave index empty

    // Create file that imports the unexported dependency
    tree.write(
      'packages/lib1/src/lib/file.ts',
      `import { utils } from './utils';
export function file() { return utils(); }`,
    );

    const result = checkForUnexportedRelativeDependencies(
      tree,
      'packages/lib1/src/lib/file.ts',
      { root: 'packages/lib1', sourceRoot: 'packages/lib1/src' },
      cachedTreeExists,
    );

    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe('./utils');
    expect(result[0].relativePathInProject).toContain('lib/utils');
  });

  it('should detect multiple unexported relative dependencies', () => {
    // Create dependency files
    tree.write(
      'packages/lib1/src/lib/utils1.ts',
      'export function utils1() { return "utils1"; }',
    );
    tree.write(
      'packages/lib1/src/lib/utils2.ts',
      'export function utils2() { return "utils2"; }',
    );

    // DO NOT export them from index

    // Create file that imports both unexported dependencies
    tree.write(
      'packages/lib1/src/lib/file.ts',
      `import { utils1 } from './utils1';
import { utils2 } from './utils2';
export function file() { return utils1() + utils2(); }`,
    );

    const result = checkForUnexportedRelativeDependencies(
      tree,
      'packages/lib1/src/lib/file.ts',
      { root: 'packages/lib1', sourceRoot: 'packages/lib1/src' },
      cachedTreeExists,
    );

    expect(result).toHaveLength(2);
    expect(result.map((d) => d.specifier)).toEqual(
      expect.arrayContaining(['./utils1', './utils2']),
    );
  });

  it('should detect unexported dependency with nested path', () => {
    // Create nested dependency file
    tree.write(
      'packages/lib1/src/lib/nested/utils.ts',
      'export function utils() { return "utils"; }',
    );

    // DO NOT export it from index

    // Create file that imports the nested unexported dependency
    tree.write(
      'packages/lib1/src/lib/file.ts',
      `import { utils } from './nested/utils';
export function file() { return utils(); }`,
    );

    const result = checkForUnexportedRelativeDependencies(
      tree,
      'packages/lib1/src/lib/file.ts',
      { root: 'packages/lib1', sourceRoot: 'packages/lib1/src' },
      cachedTreeExists,
    );

    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe('./nested/utils');
    expect(result[0].relativePathInProject).toContain('lib/nested/utils');
  });

  it('should handle export named declarations with relative imports', () => {
    // Create dependency file
    tree.write(
      'packages/lib1/src/lib/utils.ts',
      'export function utils() { return "utils"; }',
    );

    // DO NOT export it from index

    // Create file that re-exports from the unexported dependency
    tree.write(
      'packages/lib1/src/lib/file.ts',
      `export { utils } from './utils';`,
    );

    const result = checkForUnexportedRelativeDependencies(
      tree,
      'packages/lib1/src/lib/file.ts',
      { root: 'packages/lib1', sourceRoot: 'packages/lib1/src' },
      cachedTreeExists,
    );

    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe('./utils');
  });

  it('should handle export all declarations with relative imports', () => {
    // Create dependency file
    tree.write(
      'packages/lib1/src/lib/utils.ts',
      'export function utils() { return "utils"; }',
    );

    // DO NOT export it from index

    // Create file that re-exports all from the unexported dependency
    tree.write('packages/lib1/src/lib/file.ts', `export * from './utils';`);

    const result = checkForUnexportedRelativeDependencies(
      tree,
      'packages/lib1/src/lib/file.ts',
      { root: 'packages/lib1', sourceRoot: 'packages/lib1/src' },
      cachedTreeExists,
    );

    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe('./utils');
  });

  it('should ignore partially exported dependencies where one is exported', () => {
    // Create dependency files
    tree.write(
      'packages/lib1/src/lib/utils1.ts',
      'export function utils1() { return "utils1"; }',
    );
    tree.write(
      'packages/lib1/src/lib/utils2.ts',
      'export function utils2() { return "utils2"; }',
    );

    // Export only utils1 from index
    tree.write('packages/lib1/src/index.ts', "export * from './lib/utils1';");

    // Create file that imports both
    tree.write(
      'packages/lib1/src/lib/file.ts',
      `import { utils1 } from './utils1';
import { utils2 } from './utils2';
export function file() { return utils1() + utils2(); }`,
    );

    const result = checkForUnexportedRelativeDependencies(
      tree,
      'packages/lib1/src/lib/file.ts',
      { root: 'packages/lib1', sourceRoot: 'packages/lib1/src' },
      cachedTreeExists,
    );

    // Only utils2 should be flagged as unexported
    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe('./utils2');
  });
});
