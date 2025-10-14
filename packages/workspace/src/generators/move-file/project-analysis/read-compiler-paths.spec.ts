import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import {
  readCompilerPaths,
  clearCompilerPathsCache,
} from './read-compiler-paths';

describe('readCompilerPaths', () => {
  let tree: Tree;

  beforeEach(() => {
    // Clear cache FIRST before creating new tree
    clearCompilerPathsCache();
    tree = createTreeWithEmptyWorkspace();
    // Remove the default tsconfig.base.json created by createTreeWithEmptyWorkspace
    if (tree.exists('tsconfig.base.json')) {
      tree.delete('tsconfig.base.json');
    }
    if (tree.exists('tsconfig.json')) {
      tree.delete('tsconfig.json');
    }
    // Clear cache again to ensure clean state
    clearCompilerPathsCache();
  });

  afterEach(() => {
    clearCompilerPathsCache();
  });

  it('should read paths from tsconfig.base.json', () => {
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

    const result = readCompilerPaths(tree);

    expect(result).toEqual({
      '@myorg/lib1': ['packages/lib1/src/index.ts'],
      '@myorg/lib2': ['packages/lib2/src/index.ts'],
    });
  });

  it('should read paths from tsconfig.json when tsconfig.base.json is missing', () => {
    tree.write(
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          paths: {
            '@myorg/lib1': ['packages/lib1/src/index.ts'],
          },
        },
      }),
    );

    const result = readCompilerPaths(tree);

    expect(result).toEqual({
      '@myorg/lib1': ['packages/lib1/src/index.ts'],
    });
  });

  it('should prefer tsconfig.base.json over tsconfig.json', () => {
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

    tree.write(
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          paths: {
            '@myorg/lib2': ['packages/lib2/src/index.ts'],
          },
        },
      }),
    );

    const result = readCompilerPaths(tree);

    expect(result).toEqual({
      '@myorg/lib1': ['packages/lib1/src/index.ts'],
    });
  });

  it('should return null when no tsconfig files exist', () => {
    const result = readCompilerPaths(tree);

    expect(result).toBeNull();
  });

  it('should return null when tsconfig has no paths', () => {
    tree.write(
      'tsconfig.base.json',
      JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
        },
      }),
    );

    const result = readCompilerPaths(tree);

    expect(result).toBeNull();
  });

  it('should return null when tsconfig has no compilerOptions', () => {
    tree.write('tsconfig.base.json', JSON.stringify({}));

    const result = readCompilerPaths(tree);

    expect(result).toBeNull();
  });

  it('should cache the result', () => {
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

    const result1 = readCompilerPaths(tree);
    const result2 = readCompilerPaths(tree);

    expect(result1).toBe(result2); // Same reference
  });

  it('should cache null results', () => {
    const result1 = readCompilerPaths(tree);
    const result2 = readCompilerPaths(tree);

    expect(result1).toBeNull();
    expect(result2).toBeNull();
  });

  it('should clear cache when clearCompilerPathsCache is called', () => {
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

    const result1 = readCompilerPaths(tree);

    clearCompilerPathsCache();

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

    const result2 = readCompilerPaths(tree);

    expect(result1).toEqual({
      '@myorg/lib1': ['packages/lib1/src/index.ts'],
    });
    expect(result2).toEqual({
      '@myorg/lib2': ['packages/lib2/src/index.ts'],
    });
  });

  it('should handle invalid JSON gracefully', () => {
    tree.write('tsconfig.base.json', 'invalid json {');

    const result = readCompilerPaths(tree);

    expect(result).toBeNull();
  });

  it('should handle empty paths object', () => {
    tree.write(
      'tsconfig.base.json',
      JSON.stringify({
        compilerOptions: {
          paths: {},
        },
      }),
    );

    const result = readCompilerPaths(tree);

    expect(result).toEqual({});
  });

  it('should read from custom tsconfig.*.json files', () => {
    tree.write(
      'tsconfig.custom.json',
      JSON.stringify({
        compilerOptions: {
          paths: {
            '@myorg/lib1': ['packages/lib1/src/index.ts'],
          },
        },
      }),
    );

    const result = readCompilerPaths(tree);

    expect(result).toEqual({
      '@myorg/lib1': ['packages/lib1/src/index.ts'],
    });
  });

  it('should handle paths as null', () => {
    tree.write(
      'tsconfig.base.json',
      JSON.stringify({
        compilerOptions: {
          paths: null,
        },
      }),
    );

    const result = readCompilerPaths(tree);

    expect(result).toBeNull();
  });
});
