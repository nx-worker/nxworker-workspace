import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { cachedTreeExists } from './cached-tree-exists';

describe('cachedTreeExists', () => {
  let tree: Tree;
  let fileExistenceCache: Map<string, boolean>;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    fileExistenceCache = new Map();
  });

  it('should return true for existing file', () => {
    tree.write('test.ts', 'content');

    const result = cachedTreeExists(tree, 'test.ts', fileExistenceCache);

    expect(result).toBe(true);
  });

  it('should return false for non-existing file', () => {
    const result = cachedTreeExists(tree, 'missing.ts', fileExistenceCache);

    expect(result).toBe(false);
  });

  it('should cache the result and not call tree.exists() again', () => {
    tree.write('test.ts', 'content');
    const existsSpy = jest.spyOn(tree, 'exists');

    // First call
    const result1 = cachedTreeExists(tree, 'test.ts', fileExistenceCache);
    expect(result1).toBe(true);
    expect(existsSpy).toHaveBeenCalledTimes(1);

    // Second call should use cache
    const result2 = cachedTreeExists(tree, 'test.ts', fileExistenceCache);
    expect(result2).toBe(true);
    expect(existsSpy).toHaveBeenCalledTimes(1); // Still 1, not 2

    existsSpy.mockRestore();
  });

  it('should cache false results', () => {
    const existsSpy = jest.spyOn(tree, 'exists');

    // First call
    const result1 = cachedTreeExists(tree, 'missing.ts', fileExistenceCache);
    expect(result1).toBe(false);
    expect(existsSpy).toHaveBeenCalledTimes(1);

    // Second call should use cache
    const result2 = cachedTreeExists(tree, 'missing.ts', fileExistenceCache);
    expect(result2).toBe(false);
    expect(existsSpy).toHaveBeenCalledTimes(1);

    existsSpy.mockRestore();
  });

  it('should handle multiple files independently', () => {
    tree.write('file1.ts', 'content');

    const result1 = cachedTreeExists(tree, 'file1.ts', fileExistenceCache);
    const result2 = cachedTreeExists(tree, 'file2.ts', fileExistenceCache);
    const result3 = cachedTreeExists(tree, 'file1.ts', fileExistenceCache);

    expect(result1).toBe(true);
    expect(result2).toBe(false);
    expect(result3).toBe(true);
    expect(fileExistenceCache.size).toBe(2);
  });

  it('should use pre-populated cache values', () => {
    fileExistenceCache.set('test.ts', true);
    const existsSpy = jest.spyOn(tree, 'exists');

    const result = cachedTreeExists(tree, 'test.ts', fileExistenceCache);

    expect(result).toBe(true);
    expect(existsSpy).not.toHaveBeenCalled();

    existsSpy.mockRestore();
  });
});
