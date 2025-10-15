import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { performance } from 'node:perf_hooks';
import { cachedTreeExists } from '../cache/cached-tree-exists';
import { getProjectSourceFiles } from '../cache/get-project-source-files';
import { updateProjectSourceFilesCache } from '../cache/update-project-source-files-cache';

describe('cache-operations benchmarks', () => {
  let tree: Tree;
  let projectSourceFilesCache: Map<string, string[]>;
  let fileExistenceCache: Map<string, boolean>;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    // Initialize caches for each test
    projectSourceFilesCache = new Map();
    fileExistenceCache = new Map();
  });

  describe('cachedTreeExists performance', () => {
    it('should have fast cache hits (< 0.1ms)', () => {
      // Setup: Create test files
      const testFiles = Array.from({ length: 100 }, (_, i) => `file-${i}.ts`);
      testFiles.forEach((file) => tree.write(file, 'content'));

      // Warmup - populate cache
      testFiles.forEach((file) =>
        cachedTreeExists(tree, file, fileExistenceCache),
      );

      // Measure cache hits
      const iterations = 1000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        testFiles.forEach((file) =>
          cachedTreeExists(tree, file, fileExistenceCache),
        );
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations / testFiles.length;

      console.log(`Cache hit average: ${avgTime.toFixed(4)}ms per lookup`);
      expect(avgTime).toBeLessThan(0.1);
    });

    it('should have reasonable cache miss performance (< 5ms)', () => {
      // Setup
      const testFiles = Array.from({ length: 100 }, (_, i) => `file-${i}.ts`);

      // Measure cache misses (no warmup)
      const iterations = 100;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        fileExistenceCache.clear(); // Clear cache between iterations
        testFiles.forEach((file) =>
          cachedTreeExists(tree, file, fileExistenceCache),
        );
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations / testFiles.length;

      console.log(`Cache miss average: ${avgTime.toFixed(4)}ms per lookup`);
      expect(avgTime).toBeLessThan(5);
    });
  });

  describe('getProjectSourceFiles performance', () => {
    it('should efficiently retrieve cached source files (< 1ms)', () => {
      // Setup: Create a project with source files
      const projectRoot = 'libs/test-lib';
      const sourceFiles = Array.from(
        { length: 50 },
        (_, i) => `${projectRoot}/src/lib/file-${i}.ts`,
      );
      sourceFiles.forEach((file) => tree.write(file, 'content'));

      // Warmup - populate cache
      getProjectSourceFiles(
        tree,
        projectRoot,
        projectSourceFilesCache,
        fileExistenceCache,
      );

      // Measure
      const iterations = 1000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        getProjectSourceFiles(
          tree,
          projectRoot,
          projectSourceFilesCache,
          fileExistenceCache,
        );
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`Source file retrieval average: ${avgTime.toFixed(4)}ms`);
      expect(avgTime).toBeLessThan(1);
    });
  });

  describe('cache update performance', () => {
    it('should quickly update project source files cache (< 1ms)', () => {
      const projectRoot = 'libs/test-lib';

      // Measure cache update
      const iterations = 1000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        const oldPath = `${projectRoot}/old-${i}.ts`;
        const newPath = `${projectRoot}/new-${i}.ts`;
        updateProjectSourceFilesCache(
          projectRoot,
          oldPath,
          newPath,
          projectSourceFilesCache,
        );
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`Cache update average: ${avgTime.toFixed(4)}ms`);
      expect(avgTime).toBeLessThan(1);
    });
  });
});
