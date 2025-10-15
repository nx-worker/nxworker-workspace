import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { performance } from 'node:perf_hooks';
import type { ProjectConfiguration } from '@nx/devkit';
import { isFileExported } from '../export-management/is-file-exported';
import { ensureFileExported } from '../export-management/ensure-file-exported';
import { removeFileExport } from '../export-management/remove-file-export';
import { treeReadCache } from '../tree-cache';

describe('export-management benchmarks', () => {
  let tree: Tree;
  let project: ProjectConfiguration;
  let cachedTreeExists: (tree: Tree, filePath: string) => boolean;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    project = {
      root: 'libs/my-lib',
      sourceRoot: 'libs/my-lib/src',
      name: 'my-lib',
    } as ProjectConfiguration;
    cachedTreeExists = (t, path) => t.exists(path);
    treeReadCache.clear();
  });

  describe('export detection performance', () => {
    it('should detect exports quickly (< 5ms)', () => {
      const entryPoint = 'libs/my-lib/src/index.ts';
      const content = `
        export * from './lib/file1';
        export * from './lib/file2';
        export * from './lib/file3';
        export * from './lib/file4';
        export * from './lib/file5';
      `;
      tree.write(entryPoint, content);

      const fileToCheck = 'lib/file3.ts';

      // Warmup
      isFileExported(tree, project, fileToCheck, cachedTreeExists);

      // Measure
      const iterations = 1000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        isFileExported(tree, project, fileToCheck, cachedTreeExists);
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`Export detection average: ${avgTime.toFixed(4)}ms`);
      expect(avgTime).toBeLessThan(5);
    });
  });

  describe('export addition performance', () => {
    it('should add exports efficiently (< 10ms)', () => {
      const entryPoint = 'libs/my-lib/src/index.ts';
      const initialContent = `
        export * from './lib/file1';
        export * from './lib/file2';
      `;

      const fileToExport = 'lib/new-file.ts';

      // Warmup
      tree.write(entryPoint, initialContent);
      ensureFileExported(tree, project, fileToExport, cachedTreeExists);

      // Measure
      const iterations = 100;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        tree.write(entryPoint, initialContent); // Reset
        ensureFileExported(tree, project, `lib/file-${i}.ts`, cachedTreeExists);
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`Export addition average: ${avgTime.toFixed(4)}ms`);
      expect(avgTime).toBeLessThan(10);
    });
  });

  describe('export removal performance', () => {
    it('should remove exports efficiently (< 10ms)', () => {
      const entryPoint = 'libs/my-lib/src/index.ts';
      const fileToRemove = 'lib/file-to-remove.ts';
      const initialContent = `
        export * from './lib/file1';
        export * from './lib/file-to-remove';
        export * from './lib/file2';
      `;

      // Warmup
      tree.write(entryPoint, initialContent);
      removeFileExport(tree, project, fileToRemove, cachedTreeExists);

      // Measure
      const iterations = 100;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        tree.write(entryPoint, initialContent); // Reset
        removeFileExport(tree, project, fileToRemove, cachedTreeExists);
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`Export removal average: ${avgTime.toFixed(4)}ms`);
      expect(avgTime).toBeLessThan(10);
    });
  });

  describe('bulk export operations', () => {
    it('should handle multiple export operations efficiently (< 100ms for 20 operations)', () => {
      const entryPoint = 'libs/my-lib/src/index.ts';
      const initialContent = `export * from './lib/existing';`;

      const filesToExport = Array.from(
        { length: 20 },
        (_, i) => `lib/file-${i}.ts`,
      );

      // Warmup
      tree.write(entryPoint, initialContent);
      filesToExport.forEach((file) =>
        ensureFileExported(tree, project, file, cachedTreeExists),
      );

      // Measure bulk operations
      const iterations = 10;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        tree.write(entryPoint, initialContent); // Reset
        filesToExport.forEach((file) =>
          ensureFileExported(tree, project, file, cachedTreeExists),
        );
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(
        `Bulk export operations (20 files) average: ${avgTime.toFixed(4)}ms`,
      );
      expect(avgTime).toBeLessThan(100);
    });
  });
});
