import { benchmarkSuite } from '../../../../../../tools/tinybench-utils';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import type { ProjectConfiguration, Tree } from '@nx/devkit';
import { isFileExported } from '../export-management/is-file-exported';
import { ensureFileExported } from '../export-management/ensure-file-exported';
import { removeFileExport } from '../export-management/remove-file-export';
import { TreeReadCache } from '../tree-cache';
import { cachedTreeExists as cachedTreeExistsImpl } from '../cache/cached-tree-exists';

benchmarkSuite('Export Management', () => {
  // Shared scope for all benchmarks - replaces module-level variables
  let cachedTreeExists: (tree: Tree, filePath: string) => boolean;
  let entryPoint: string;
  let fileExistenceCache: Map<string, boolean>;
  let project: ProjectConfiguration;
  let tree: Tree;
  let treeReadCache: TreeReadCache;

  return {
    benchmarks: {
      'Export detection': {
        fn: () => {
          isFileExported(tree, project, 'lib/file2.ts', cachedTreeExists);
        },
        fnOptions: {
          beforeAll() {
            tree.write(
              entryPoint,
              `export * from './lib/file1';
            export * from './lib/file2';
            export * from './lib/file3';`,
            );
          },
        },
      },

      'Export addition': {
        fn: () => {
          ensureFileExported(
            tree,
            project,
            'lib/new-file.ts',
            cachedTreeExists,
          );
        },
        fnOptions: {
          beforeAll() {
            const initialContent = `export * from './lib/file1';
            export * from './lib/file2';`;
            tree.write(entryPoint, initialContent);
          },
        },
      },

      'Export removal': {
        fn: () => {
          removeFileExport(tree, project, 'lib/to-remove.ts', cachedTreeExists);
        },
        fnOptions: {
          beforeAll() {
            tree.write(
              entryPoint,
              `export * from './lib/file1';
            export * from './lib/to-remove';
            export * from './lib/file2';`,
            );
          },
        },
      },
    },
    setupSuite() {
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
    },
    setup() {
      tree = createTreeWithEmptyWorkspace();
    },
    teardown() {
      fileExistenceCache.clear();
      treeReadCache.clear();
    },
  };
});
