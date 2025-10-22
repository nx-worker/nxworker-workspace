import { benchmarkSuite } from '../../../../../../tools/tinybench-utils';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { cachedTreeExists } from '../cache/cached-tree-exists';
import { getProjectSourceFiles } from '../cache/get-project-source-files';
import { updateProjectSourceFilesCache } from '../cache/update-project-source-files-cache';

benchmarkSuite('Cache Operations', {
  'Cache hit': () => {
    const tree = createTreeWithEmptyWorkspace();
    const fileExistenceCache = new Map();
    const testFiles = Array.from({ length: 100 }, (_, i) => `file-${i}.ts`);
    testFiles.forEach((file) => tree.write(file, 'content'));
    // Warmup - populate cache
    testFiles.forEach((file) =>
      cachedTreeExists(tree, file, fileExistenceCache),
    );
    // Benchmark
    testFiles.forEach((file) =>
      cachedTreeExists(tree, file, fileExistenceCache),
    );
  },

  'Cache miss': () => {
    const tree = createTreeWithEmptyWorkspace();
    const fileExistenceCache = new Map();
    const testFiles = Array.from({ length: 10 }, (_, i) => `file-${i}.ts`);
    testFiles.forEach((file) =>
      cachedTreeExists(tree, file, fileExistenceCache),
    );
  },

  'Source file retrieval': () => {
    const tree = createTreeWithEmptyWorkspace();
    const projectSourceFilesCache = new Map();
    const fileExistenceCache = new Map();
    const projectRoot = 'libs/test-lib';
    const sourceFiles = Array.from(
      { length: 50 },
      (_, i) => `${projectRoot}/src/lib/file-${i}.ts`,
    );
    sourceFiles.forEach((file) => tree.write(file, 'content'));
    // Warmup
    getProjectSourceFiles(
      tree,
      projectRoot,
      projectSourceFilesCache,
      fileExistenceCache,
    );
    // Benchmark
    getProjectSourceFiles(
      tree,
      projectRoot,
      projectSourceFilesCache,
      fileExistenceCache,
    );
  },

  'Cache update': () => {
    const projectSourceFilesCache = new Map();
    const projectRoot = 'libs/test-lib';
    const oldPath = `${projectRoot}/old.ts`;
    const newPath = `${projectRoot}/new.ts`;
    updateProjectSourceFilesCache(
      projectRoot,
      oldPath,
      newPath,
      projectSourceFilesCache,
    );
  },
});
