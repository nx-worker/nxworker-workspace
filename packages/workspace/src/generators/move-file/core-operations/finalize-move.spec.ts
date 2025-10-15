import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { finalizeMove } from './finalize-move';
import { treeReadCache } from '../tree-cache';
import * as devkit from '@nx/devkit';

jest.mock('../tree-cache');
jest.mock('@nx/devkit', () => ({
  ...jest.requireActual('@nx/devkit'),
  formatFiles: jest.fn(),
}));

describe('finalizeMove', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    jest.clearAllMocks();
  });

  it('should delete source file', async () => {
    const sourcePath = 'packages/lib1/src/lib/test.ts';
    tree.write(sourcePath, 'export const test = 1;');

    await finalizeMove(tree, sourcePath, { file: sourcePath, project: 'lib2' });

    expect(tree.exists(sourcePath)).toBe(false);
  });

  it('should invalidate tree read cache', async () => {
    const sourcePath = 'packages/lib1/src/lib/test.ts';
    tree.write(sourcePath, 'export const test = 1;');

    await finalizeMove(tree, sourcePath, { file: sourcePath, project: 'lib2' });

    expect(treeReadCache.invalidateFile).toHaveBeenCalledWith(sourcePath);
  });

  it('should format files when skipFormat is false', async () => {
    const sourcePath = 'packages/lib1/src/lib/test.ts';
    tree.write(sourcePath, 'export const test = 1;');

    await finalizeMove(tree, sourcePath, {
      file: sourcePath,
      project: 'lib2',
      skipFormat: false,
    });

    expect(devkit.formatFiles).toHaveBeenCalledWith(tree);
  });

  it('should skip formatting when skipFormat is true', async () => {
    const sourcePath = 'packages/lib1/src/lib/test.ts';
    tree.write(sourcePath, 'export const test = 1;');

    await finalizeMove(tree, sourcePath, {
      file: sourcePath,
      project: 'lib2',
      skipFormat: true,
    });

    expect(devkit.formatFiles).not.toHaveBeenCalled();
  });

  it('should skip formatting when skipFormat is undefined (defaults to false)', async () => {
    const sourcePath = 'packages/lib1/src/lib/test.ts';
    tree.write(sourcePath, 'export const test = 1;');

    await finalizeMove(tree, sourcePath, {
      file: sourcePath,
      project: 'lib2',
    });

    expect(devkit.formatFiles).toHaveBeenCalledWith(tree);
  });
});
