import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { getProjectSourceFiles } from './get-project-source-files';

describe('getProjectSourceFiles', () => {
  let tree: Tree;
  let projectSourceFilesCache: Map<string, string[]>;
  let fileExistenceCache: Map<string, boolean>;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    projectSourceFilesCache = new Map();
    fileExistenceCache = new Map();
  });

  it('should return empty array for non-existent project', () => {
    const result = getProjectSourceFiles(
      tree,
      'libs/missing',
      projectSourceFilesCache,
      fileExistenceCache,
    );

    expect(result).toEqual([]);
  });

  it('should find TypeScript files', () => {
    tree.write('libs/mylib/src/index.ts', 'export {}');
    tree.write('libs/mylib/src/util.ts', 'export {}');

    const result = getProjectSourceFiles(
      tree,
      'libs/mylib',
      projectSourceFilesCache,
      fileExistenceCache,
    );

    expect(result).toContain('libs/mylib/src/index.ts');
    expect(result).toContain('libs/mylib/src/util.ts');
    expect(result).toHaveLength(2);
  });

  it('should find JavaScript files', () => {
    tree.write('libs/mylib/src/index.js', 'export {}');
    tree.write('libs/mylib/src/util.jsx', 'export {}');

    const result = getProjectSourceFiles(
      tree,
      'libs/mylib',
      projectSourceFilesCache,
      fileExistenceCache,
    );

    expect(result).toContain('libs/mylib/src/index.js');
    expect(result).toContain('libs/mylib/src/util.jsx');
  });

  it('should find ESM-specific files', () => {
    tree.write('libs/mylib/src/index.mts', 'export {}');
    tree.write('libs/mylib/src/util.mjs', 'export {}');
    tree.write('libs/mylib/src/types.cts', 'export {}');
    tree.write('libs/mylib/src/config.cjs', 'export {}');

    const result = getProjectSourceFiles(
      tree,
      'libs/mylib',
      projectSourceFilesCache,
      fileExistenceCache,
    );

    expect(result).toContain('libs/mylib/src/index.mts');
    expect(result).toContain('libs/mylib/src/util.mjs');
    expect(result).toContain('libs/mylib/src/types.cts');
    expect(result).toContain('libs/mylib/src/config.cjs');
  });

  it('should ignore non-source files', () => {
    tree.write('libs/mylib/src/index.ts', 'export {}');
    tree.write('libs/mylib/README.md', '# README');
    tree.write('libs/mylib/package.json', '{}');
    tree.write('libs/mylib/.gitignore', '');

    const result = getProjectSourceFiles(
      tree,
      'libs/mylib',
      projectSourceFilesCache,
      fileExistenceCache,
    );

    expect(result).toContain('libs/mylib/src/index.ts');
    expect(result).not.toContain('libs/mylib/README.md');
    expect(result).not.toContain('libs/mylib/package.json');
    expect(result).not.toContain('libs/mylib/.gitignore');
  });

  it('should cache results and not traverse again', () => {
    tree.write('libs/mylib/src/index.ts', 'export {}');
    tree.write('libs/mylib/src/util.ts', 'export {}');

    // First call
    const result1 = getProjectSourceFiles(
      tree,
      'libs/mylib',
      projectSourceFilesCache,
      fileExistenceCache,
    );

    expect(result1).toHaveLength(2);
    expect(projectSourceFilesCache.has('libs/mylib')).toBe(true);

    // Add another file after caching
    tree.write('libs/mylib/src/new.ts', 'export {}');

    // Second call should return cached result (without new.ts)
    const result2 = getProjectSourceFiles(
      tree,
      'libs/mylib',
      projectSourceFilesCache,
      fileExistenceCache,
    );

    expect(result2).toHaveLength(2);
    expect(result2).not.toContain('libs/mylib/src/new.ts');
  });

  it('should normalize paths', () => {
    tree.write('libs/mylib/src/index.ts', 'export {}');

    const result = getProjectSourceFiles(
      tree,
      'libs/mylib',
      projectSourceFilesCache,
      fileExistenceCache,
    );

    // All paths should be normalized (no backslashes on Windows)
    result.forEach((path) => {
      expect(path).not.toContain('\\');
    });
  });

  it('should handle empty projects', () => {
    tree.write('libs/emptylib/.gitkeep', '');

    const result = getProjectSourceFiles(
      tree,
      'libs/emptylib',
      projectSourceFilesCache,
      fileExistenceCache,
    );

    expect(result).toEqual([]);
    expect(projectSourceFilesCache.get('libs/emptylib')).toEqual([]);
  });

  it('should handle nested directories', () => {
    tree.write('libs/mylib/src/features/feature1.ts', 'export {}');
    tree.write('libs/mylib/src/utils/helper.ts', 'export {}');

    const result = getProjectSourceFiles(
      tree,
      'libs/mylib',
      projectSourceFilesCache,
      fileExistenceCache,
    );

    expect(result).toContain('libs/mylib/src/features/feature1.ts');
    expect(result).toContain('libs/mylib/src/utils/helper.ts');
  });
});
