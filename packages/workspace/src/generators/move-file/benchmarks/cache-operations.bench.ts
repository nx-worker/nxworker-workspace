import {
  beforeEachIteration,
  describe,
  it,
  setupTask,
  teardownTask,
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

  setupTask(() => {
    // Create fresh state for each task cycle (warmup and run)
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

  teardownTask(() => {
    fileExistenceCache.clear();
    projectSourceFilesCache.clear();
  });

  describe('Cache hit', () => {
    beforeEachIteration(() => {
      // Pre-populate cache before each iteration to ensure we measure cache hits
      testFiles.forEach((file) => fileExistenceCache.set(file, true));
    });

    it(
      'should check cache hits',
      () => {
        testFiles.forEach((file) =>
          cachedTreeExists(tree, file, fileExistenceCache),
        );
      },
      { warmup: false }, // Disable warmup since we're controlling cache state explicitly
    );
  });

  describe('Cache miss', () => {
    beforeEachIteration(() => {
      // Clear cache before each iteration to ensure we measure cache misses
      fileExistenceCache.clear();
    });

    it(
      'should handle cache misses',
      () => {
        testFiles.forEach((file) =>
          cachedTreeExists(tree, file, fileExistenceCache),
        );
      },
      { warmup: false }, // Disable warmup since we're controlling cache state explicitly
    );
  });

  describe('Source file retrieval', () => {
    beforeEachIteration(() => {
      // Clear caches before each iteration to ensure consistent measurement
      fileExistenceCache.clear();
      projectSourceFilesCache.clear();
    });

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
      { warmup: false }, // Disable warmup since we're controlling cache state explicitly
    );
  });

  describe('Cache update', () => {
    beforeEachIteration(() => {
      // Pre-populate cache with the old path that will be updated
      projectSourceFilesCache.clear();
      projectSourceFilesCache.set(projectRoot, [
        `${projectRoot}/src/lib/old.ts`,
      ]);
    });

    it(
      'should update cache',
      () => {
        const oldPath = `${projectRoot}/src/lib/old.ts`;
        const newPath = `${projectRoot}/src/lib/new.ts`;
        updateProjectSourceFilesCache(
          projectRoot,
          oldPath,
          newPath,
          projectSourceFilesCache,
        );
      },
      { warmup: false }, // Disable warmup since we're controlling cache state explicitly
    );
  });
});
