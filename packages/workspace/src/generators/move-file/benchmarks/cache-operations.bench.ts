import {
  beforeAll,
  describe,
  it,
  teardown,
} from '../../../../../../tools/tinybench-utils';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { cachedTreeExists } from '../cache/cached-tree-exists';
import { getProjectSourceFiles } from '../cache/get-project-source-files';
import { updateProjectSourceFilesCache } from '../cache/update-project-source-files-cache';
import { Tree } from '@nx/devkit';

describe('Cache Operations', () => {
  let fileExistenceCache: Map<string, boolean>;
  let projectRoot: string;
  let projectSourceFilesCache: Map<string, string[]>;
  let tree: Tree;
  let testFiles: readonly string[];

  beforeAll(() => {
    fileExistenceCache = new Map();
    projectRoot = 'libs/test-lib';
    projectSourceFilesCache = new Map();
    tree = createTreeWithEmptyWorkspace();
    testFiles = Array.from(
      { length: 100 },
      (_, i) => `${projectRoot}/src/lib/file-${i}.ts`,
    );
    testFiles.forEach((file) => tree.write(file, 'export {};'));
  });

  teardown(() => {
    fileExistenceCache.clear();
    projectSourceFilesCache.clear();
  });

  describe('Cache hit', () => {
    it(
      'should check cache hits',
      () => {
        testFiles.forEach((file) =>
          cachedTreeExists(tree, file, fileExistenceCache),
        );
      },
      { warmup: true, warmupIterations: 1 },
    );
  });

  describe('Cache miss', () => {
    it('should handle cache misses', () => {
      testFiles.forEach((file) =>
        cachedTreeExists(tree, file, fileExistenceCache),
      );
    });
  });

  describe('Source file retrieval', () => {
    it(
      'should retrieve source files',
      () => {
        getProjectSourceFiles(
          tree,
          projectRoot,
          projectSourceFilesCache,
          fileExistenceCache,
        );
      },
      { warmup: true, warmupIterations: 1 },
    );
  });

  describe('Cache update', () => {
    it('should update cache', () => {
      const oldPath = `${projectRoot}/src/lib/old.ts`;
      const newPath = `${projectRoot}/src/lib/new.ts`;
      updateProjectSourceFilesCache(
        projectRoot,
        oldPath,
        newPath,
        projectSourceFilesCache,
      );
    });
  });
});
