import {
  beforeAll,
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

  // ✅ OPTIMIZED: Move expensive tree creation and immutable configs to suite-level beforeAll
  // Runs once per suite instead of 1-2 times per benchmark
  beforeAll(() => {
    tree = createTreeWithEmptyWorkspace();
    entryPoint = 'libs/my-lib/src/index.ts';
    project = {
      root: 'libs/my-lib',
      sourceRoot: 'libs/my-lib/src',
      name: 'my-lib',
    };
  });

  // ✅ Use setupTask for parent-level initialization that benchmarks depend on
  // Runs BEFORE nested beforeAllIterations hooks, making dependencies explicit
  setupTask(() => {
    // Reset caches and helper function for each task cycle (warmup and run)
    fileExistenceCache = new Map<string, boolean>();
    cachedTreeExists = (tree, filePath) =>
      cachedTreeExistsImpl(tree, filePath, fileExistenceCache);
    treeReadCache = new TreeReadCache();
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
