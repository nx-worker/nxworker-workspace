import { benchmarkSuite } from '../../../../../../tools/tinybench-utils';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import type { ProjectConfiguration } from '@nx/devkit';
import { isFileExported } from '../export-management/is-file-exported';
import { ensureFileExported } from '../export-management/ensure-file-exported';
import { removeFileExport } from '../export-management/remove-file-export';
import { treeReadCache } from '../tree-cache';

describe('Export Management', () => {
  it('should run benchmarks', async () => {
    await benchmarkSuite('Export Management', {
      'Export detection': () => {
        const tree = createTreeWithEmptyWorkspace();
        const project = {
          root: 'libs/my-lib',
          sourceRoot: 'libs/my-lib/src',
          name: 'my-lib',
        } as ProjectConfiguration;
        const cachedTreeExists = (t, path) => t.exists(path);
        treeReadCache.clear();
        const entryPoint = 'libs/my-lib/src/index.ts';
        tree.write(
          entryPoint,
          `
      export * from './lib/file1';
      export * from './lib/file2';
      export * from './lib/file3';
    `,
        );
        isFileExported(tree, project, 'lib/file2.ts', cachedTreeExists);
      },

      'Export addition': () => {
        const tree = createTreeWithEmptyWorkspace();
        const project = {
          root: 'libs/my-lib',
          sourceRoot: 'libs/my-lib/src',
          name: 'my-lib',
        } as ProjectConfiguration;
        const cachedTreeExists = (t, path) => t.exists(path);
        treeReadCache.clear();
        const entryPoint = 'libs/my-lib/src/index.ts';
        const initialContent = `
      export * from './lib/file1';
      export * from './lib/file2';
    `;
        tree.write(entryPoint, initialContent);
        ensureFileExported(tree, project, 'lib/new-file.ts', cachedTreeExists);
      },

      'Export removal': () => {
        const tree = createTreeWithEmptyWorkspace();
        const project = {
          root: 'libs/my-lib',
          sourceRoot: 'libs/my-lib/src',
          name: 'my-lib',
        } as ProjectConfiguration;
        const cachedTreeExists = (t, path) => t.exists(path);
        treeReadCache.clear();
        const entryPoint = 'libs/my-lib/src/index.ts';
        tree.write(
          entryPoint,
          `
      export * from './lib/file1';
      export * from './lib/to-remove';
      export * from './lib/file2';
    `,
        );
        removeFileExport(tree, project, 'lib/to-remove.ts', cachedTreeExists);
      },
    });
  });
});
