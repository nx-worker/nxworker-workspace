import { benchmarkSuite } from '../../../../../../tools/tinybench-utils';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { cachedTreeExists } from '../cache/cached-tree-exists';
import { getProjectSourceFiles } from '../cache/get-project-source-files';
import { updateProjectSourceFilesCache } from '../cache/update-project-source-files-cache';
import { Tree } from '@nx/devkit';

benchmarkSuite('Cache Operations', () => {
  // Shared scope for all benchmarks - replaces module-level variables
  let fileExistenceCache: Map<string, boolean>;
  let projectRoot: string;
  let projectSourceFilesCache: Map<string, string[]>;
  let tree: Tree;
  let testFiles: readonly string[];

  return {
    benchmarks: {
      'Cache hit': {
        fn: () => {
          testFiles.forEach((file) =>
            cachedTreeExists(tree, file, fileExistenceCache),
          );
        },
        warmup: true,
        warmupIterations: 1,
      },

      'Cache miss': () => {
        testFiles.forEach((file) =>
          cachedTreeExists(tree, file, fileExistenceCache),
        );
      },

      'Source file retrieval': {
        fn: () => {
          getProjectSourceFiles(
            tree,
            projectRoot,
            projectSourceFilesCache,
            fileExistenceCache,
          );
        },
        warmup: true,
        warmupIterations: 1,
      },

      'Cache update': () => {
        const oldPath = `${projectRoot}/src/lib/old.ts`;
        const newPath = `${projectRoot}/src/lib/new.ts`;
        updateProjectSourceFilesCache(
          projectRoot,
          oldPath,
          newPath,
          projectSourceFilesCache,
        );
      },
    },
    setupSuite() {
      fileExistenceCache = new Map();
      projectRoot = 'libs/test-lib';
      projectSourceFilesCache = new Map();
      tree = createTreeWithEmptyWorkspace();
      testFiles = Array.from(
        { length: 100 },
        (_, i) => `${projectRoot}/src/lib/file-${i}.ts`,
      );
      testFiles.forEach((file) => tree.write(file, 'export {};'));
    },
    teardown() {
      fileExistenceCache.clear();
      projectSourceFilesCache.clear();
    },
  };
});
