import {
  beforeAllIterations,
  describe,
  it,
  setupTask,
  teardownTask,
} from '../../../../../../tools/tinybench-utils';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import type { ProjectConfiguration, Tree } from '@nx/devkit';
import { isFileExported } from '../export-management/is-file-exported';
import { ensureFileExported } from '../export-management/ensure-file-exported';
import { removeFileExport } from '../export-management/remove-file-export';
import { TreeReadCache } from '../tree-cache';
import { cachedTreeExists as cachedTreeExistsImpl } from '../cache/cached-tree-exists';

describe('Export Management', () => {
  let cachedTreeExists: (tree: Tree, filePath: string) => boolean;
  let entryPoint: string;
  let fileExistenceCache: Map<string, boolean>;
  let project: ProjectConfiguration;
  let tree: Tree;
  let treeReadCache: TreeReadCache;

  beforeAllIterations(() => {
    cachedTreeExists = (tree, filePath) =>
      cachedTreeExistsImpl(tree, filePath, fileExistenceCache);
    entryPoint = 'libs/my-lib/src/index.ts';
    fileExistenceCache = new Map<string, boolean>();
    project = {
      root: 'libs/my-lib',
      sourceRoot: 'libs/my-lib/src',
      name: 'my-lib',
    };
    treeReadCache = new TreeReadCache();
  });

  setupTask(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  teardownTask(() => {
    fileExistenceCache.clear();
    treeReadCache.clear();
  });

  describe('Export detection', () => {
    beforeAllIterations(() => {
      tree.write(
        entryPoint,
        `export * from './lib/file1';
            export * from './lib/file2';
            export * from './lib/file3';`,
      );
    });

    it('should detect exports', () => {
      isFileExported(tree, project, 'lib/file2.ts', cachedTreeExists);
    });
  });

  describe('Export addition', () => {
    beforeAllIterations(() => {
      const initialContent = `export * from './lib/file1';
            export * from './lib/file2';`;
      tree.write(entryPoint, initialContent);
    });

    it('should add exports', () => {
      ensureFileExported(tree, project, 'lib/new-file.ts', cachedTreeExists);
    });
  });

  describe('Export removal', () => {
    beforeAllIterations(() => {
      tree.write(
        entryPoint,
        `export * from './lib/file1';
            export * from './lib/to-remove';
            export * from './lib/file2';`,
      );
    });

    it('should remove exports', () => {
      removeFileExport(tree, project, 'lib/to-remove.ts', cachedTreeExists);
    });
  });
});
