import {
  beforeAll,
  beforeEachIteration,
  describe,
  it,
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

  // ✅ OPTIMIZED: Move expensive tree creation and file writes to suite-level beforeAll
  // Runs once per suite instead of once per benchmark
  beforeAll(() => {
    projectRoot = 'libs/test-lib';
    tree = createTreeWithEmptyWorkspace();
    testFiles = Array.from(
      { length: 100 },
      (_, i) => `${projectRoot}/src/lib/file-${i}.ts`,
    );
    testFiles.forEach((file) => tree.write(file, 'export {};'));
  });

  describe('Cache hit', () => {
    // ✅ OPTIMIZED: With warmup disabled, setup runs once per benchmark (not per cycle)
    // Use nested beforeAll to make this explicit
    beforeAll(() => {
      fileExistenceCache = new Map();
      projectSourceFilesCache = new Map();
    });
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
      {
        warmup: false, // Disable warmup: cache state is explicitly controlled per iteration
      },
    );
  });

  describe('Cache miss', () => {
    // ✅ OPTIMIZED: With warmup disabled, setup runs once per benchmark (not per cycle)
    // Use nested beforeAll to make this explicit
    beforeAll(() => {
      fileExistenceCache = new Map();
      projectSourceFilesCache = new Map();
    });

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
      {
        warmup: false, // Disable warmup: cache state is explicitly controlled per iteration
      },
    );
  });

  describe('Source file retrieval', () => {
    // ✅ OPTIMIZED: With warmup disabled, setup runs once per benchmark (not per cycle)
    // Use nested beforeAll to make this explicit
    beforeAll(() => {
      fileExistenceCache = new Map();
      projectSourceFilesCache = new Map();
    });

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
      {
        warmup: false, // Disable warmup: cache state is explicitly controlled per iteration
      },
    );
  });

  describe('Cache update', () => {
    // ✅ OPTIMIZED: With warmup disabled, setup runs once per benchmark (not per cycle)
    // Use nested beforeAll to make this explicit
    beforeAll(() => {
      fileExistenceCache = new Map();
      projectSourceFilesCache = new Map();
    });

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
      {
        warmup: false, // Disable warmup: cache state is explicitly controlled per iteration
      },
    );
  });
});
