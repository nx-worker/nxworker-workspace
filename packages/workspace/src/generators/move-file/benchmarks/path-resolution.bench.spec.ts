import { performance } from 'node:perf_hooks';
import { buildFileNames } from '../path-utils/build-file-names';
import { buildPatterns } from '../path-utils/build-patterns';
import { getRelativeImportSpecifier } from '../path-utils/get-relative-import-specifier';
import { removeSourceFileExtension } from '../path-utils/remove-source-file-extension';
import { toAbsoluteWorkspacePath } from '../path-utils/to-absolute-workspace-path';

describe('path-resolution benchmarks', () => {
  describe('buildFileNames performance', () => {
    it('should quickly generate file name variants (< 1ms)', () => {
      const baseNames = ['index', 'main'];

      // Warmup
      buildFileNames(baseNames);

      // Measure
      const iterations = 10000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        buildFileNames(baseNames);
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`buildFileNames average: ${avgTime.toFixed(4)}ms`);
      expect(avgTime).toBeLessThan(1);
    });
  });

  describe('buildPatterns performance', () => {
    it('should efficiently build patterns for multiple files (< 10ms for 100 files)', () => {
      const prefixes = Array.from({ length: 100 }, (_, i) => `libs/lib-${i}/`);
      const fileNames = ['index.ts', 'main.ts'];

      // Warmup
      buildPatterns(prefixes, fileNames);

      // Measure
      const iterations = 100;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        buildPatterns(prefixes, fileNames);
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`buildPatterns (100 files) average: ${avgTime.toFixed(4)}ms`);
      expect(avgTime).toBeLessThan(10);
    });
  });

  describe('getRelativeImportSpecifier performance', () => {
    it('should calculate import paths quickly (< 0.5ms)', () => {
      const fromPath = 'libs/lib-a/src/lib/component-a.ts';
      const toPath = 'libs/lib-b/src/lib/service-b.ts';

      // Warmup
      getRelativeImportSpecifier(fromPath, toPath);

      // Measure
      const iterations = 10000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        getRelativeImportSpecifier(fromPath, toPath);
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(
        `getRelativeImportSpecifier average: ${avgTime.toFixed(4)}ms`,
      );
      expect(avgTime).toBeLessThan(0.5);
    });
  });

  describe('path normalization performance', () => {
    it('should normalize paths efficiently (< 0.1ms)', () => {
      const relativePath = './libs/my-lib/src/lib/file.ts';

      // Warmup
      toAbsoluteWorkspacePath(relativePath);

      // Measure
      const iterations = 10000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        toAbsoluteWorkspacePath(relativePath);
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`toAbsoluteWorkspacePath average: ${avgTime.toFixed(4)}ms`);
      expect(avgTime).toBeLessThan(0.1);
    });
  });

  describe('extension removal performance', () => {
    it('should strip extensions quickly (< 0.05ms)', () => {
      const filePath = 'libs/my-lib/src/lib/my-file.ts';

      // Warmup
      removeSourceFileExtension(filePath);

      // Measure
      const iterations = 10000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        removeSourceFileExtension(filePath);
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`removeSourceFileExtension average: ${avgTime.toFixed(4)}ms`);
      expect(avgTime).toBeLessThan(0.05);
    });
  });
});
