import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { createTargetFile } from './create-target-file';
import { treeReadCache } from '../tree-cache';

jest.mock('../tree-cache');

describe('createTargetFile', () => {
  let tree: Tree;
  let mockUpdateFileExistenceCache: jest.Mock;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    mockUpdateFileExistenceCache = jest.fn();
    jest.clearAllMocks();
  });

  it('should write file content to tree', () => {
    const targetPath = 'packages/lib1/src/lib/test.ts';
    const content = 'export const test = 1;';

    createTargetFile(tree, targetPath, content, mockUpdateFileExistenceCache);

    expect(tree.exists(targetPath)).toBe(true);
    expect(tree.read(targetPath, 'utf-8')).toBe(content);
  });

  it('should update file existence cache', () => {
    const targetPath = 'packages/lib1/src/lib/test.ts';
    const content = 'export const test = 1;';

    createTargetFile(tree, targetPath, content, mockUpdateFileExistenceCache);

    expect(mockUpdateFileExistenceCache).toHaveBeenCalledWith(targetPath, true);
  });

  it('should invalidate tree read cache', () => {
    const targetPath = 'packages/lib1/src/lib/test.ts';
    const content = 'export const test = 1;';

    createTargetFile(tree, targetPath, content, mockUpdateFileExistenceCache);

    expect(treeReadCache.invalidateFile).toHaveBeenCalledWith(targetPath);
  });

  it('should handle empty file content', () => {
    const targetPath = 'packages/lib1/src/lib/empty.ts';
    const content = '';

    createTargetFile(tree, targetPath, content, mockUpdateFileExistenceCache);

    expect(tree.exists(targetPath)).toBe(true);
    expect(tree.read(targetPath, 'utf-8')).toBe('');
  });

  it('should handle file paths with special characters', () => {
    const targetPath = 'packages/lib-1/src/lib/test-file.spec.ts';
    const content = 'export const test = 1;';

    createTargetFile(tree, targetPath, content, mockUpdateFileExistenceCache);

    expect(tree.exists(targetPath)).toBe(true);
    expect(tree.read(targetPath, 'utf-8')).toBe(content);
    expect(mockUpdateFileExistenceCache).toHaveBeenCalledWith(targetPath, true);
  });
});
