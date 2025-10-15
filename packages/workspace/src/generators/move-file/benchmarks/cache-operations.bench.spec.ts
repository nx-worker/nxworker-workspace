import Benchmark from 'benchmark';
import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { cachedTreeExists } from '../cache/cached-tree-exists';
import { getProjectSourceFiles } from '../cache/get-project-source-files';
import { updateProjectSourceFilesCache } from '../cache/update-project-source-files-cache';

describe('cache-operations benchmarks', () => {
  it('should run cache operation benchmarks', (done) => {
    const suite = new Benchmark.Suite('Cache Operations');

    // Setup shared state
    let tree: Tree;
    let projectSourceFilesCache: Map<string, string[]>;
    let fileExistenceCache: Map<string, boolean>;
    let testFiles: string[];
    let projectRoot: string;

    suite
      .add('Cache hit', {
        setup: function () {
          tree = createTreeWithEmptyWorkspace();
          fileExistenceCache = new Map();
          testFiles = Array.from({ length: 100 }, (_, i) => `file-${i}.ts`);
          testFiles.forEach((file) => tree.write(file, 'content'));
          // Warmup - populate cache
          testFiles.forEach((file) =>
            cachedTreeExists(tree, file, fileExistenceCache),
          );
        },
        fn: function () {
          testFiles.forEach((file) =>
            cachedTreeExists(tree, file, fileExistenceCache),
          );
        },
      })
      .add('Cache miss', {
        setup: function () {
          tree = createTreeWithEmptyWorkspace();
          testFiles = Array.from({ length: 10 }, (_, i) => `file-${i}.ts`);
        },
        fn: function () {
          fileExistenceCache = new Map();
          testFiles.forEach((file) =>
            cachedTreeExists(tree, file, fileExistenceCache),
          );
        },
      })
      .add('Source file retrieval', {
        setup: function () {
          tree = createTreeWithEmptyWorkspace();
          projectSourceFilesCache = new Map();
          fileExistenceCache = new Map();
          projectRoot = 'libs/test-lib';
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
        },
        fn: function () {
          getProjectSourceFiles(
            tree,
            projectRoot,
            projectSourceFilesCache,
            fileExistenceCache,
          );
        },
      })
      .add('Cache update', {
        setup: function () {
          projectSourceFilesCache = new Map();
          projectRoot = 'libs/test-lib';
        },
        fn: function () {
          const oldPath = `${projectRoot}/old.ts`;
          const newPath = `${projectRoot}/new.ts`;
          updateProjectSourceFilesCache(
            projectRoot,
            oldPath,
            newPath,
            projectSourceFilesCache,
          );
        },
      })
      .on('cycle', (event: Benchmark.Event) => {
        console.log(String(event.target));
      })
      .on('complete', function (this: Benchmark.Suite) {
        done();
      })
      .run();
  }, 120000); // 2 minute timeout for all benchmarks
});
