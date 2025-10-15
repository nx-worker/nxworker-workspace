import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { performance } from 'node:perf_hooks';
import type { ProjectConfiguration } from '@nx/devkit';
import { updateMovedFileImportsIfNeeded } from '../import-updates/update-moved-file-imports-if-needed';

describe('import-updates benchmarks', () => {
  let tree: Tree;
  let projects: Map<string, ProjectConfiguration>;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    projects = new Map();

    // Setup test projects
    projects.set('lib-a', {
      name: 'lib-a',
      root: 'libs/lib-a',
      sourceRoot: 'libs/lib-a/src',
      projectType: 'library',
    });
    projects.set('lib-b', {
      name: 'lib-b',
      root: 'libs/lib-b',
      sourceRoot: 'libs/lib-b/src',
      projectType: 'library',
    });
  });

  describe('import path update performance', () => {
    it('should update imports in moved file efficiently (< 10ms)', () => {
      // Create a file with multiple imports
      const sourceFile = 'libs/lib-a/src/lib/source.ts';
      const content = `
        import { service1 } from './services/service1';
        import { service2 } from './services/service2';
        import { util1 } from './utils/util1';
        import { util2 } from './utils/util2';
        import { helper1 } from './helpers/helper1';
        
        export function myFunction() {
          return service1() + service2() + util1() + util2() + helper1();
        }
      `;
      tree.write(sourceFile, content);

      const targetFile = 'libs/lib-b/src/lib/target.ts';

      // Warmup
      updateMovedFileImportsIfNeeded(
        tree,
        sourceFile,
        targetFile,
        'lib-a',
        'lib-b',
        projects,
      );

      // Measure
      const iterations = 100;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        tree.write(sourceFile, content); // Reset
        updateMovedFileImportsIfNeeded(
          tree,
          sourceFile,
          targetFile,
          'lib-a',
          'lib-b',
          projects,
        );
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`Import update average: ${avgTime.toFixed(4)}ms`);
      expect(avgTime).toBeLessThan(10);
    });

    it('should scale linearly for multiple files (< 50ms for 10 files)', () => {
      // Create multiple files with imports
      const fileCount = 10;
      const sourceFiles = Array.from({ length: fileCount }, (_, i) => {
        const path = `libs/lib-a/src/lib/file-${i}.ts`;
        const content = `
          import { dep1 } from './dep1';
          import { dep2 } from './dep2';
          export const value${i} = dep1() + dep2();
        `;
        tree.write(path, content);
        return path;
      });

      // Warmup
      sourceFiles.forEach((sourceFile, i) => {
        const targetFile = `libs/lib-b/src/lib/file-${i}.ts`;
        updateMovedFileImportsIfNeeded(
          tree,
          sourceFile,
          targetFile,
          'lib-a',
          'lib-b',
          projects,
        );
      });

      // Measure batch update
      const iterations = 10;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        sourceFiles.forEach((sourceFile, idx) => {
          const targetFile = `libs/lib-b/src/lib/file-${idx}.ts`;
          updateMovedFileImportsIfNeeded(
            tree,
            sourceFile,
            targetFile,
            'lib-a',
            'lib-b',
            projects,
          );
        });
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(
        `Batch import update (${fileCount} files) average: ${avgTime.toFixed(4)}ms`,
      );
      expect(avgTime).toBeLessThan(50);
    });
  });

  describe('AST transformation performance', () => {
    it('should parse and transform AST efficiently (< 15ms)', () => {
      const filePath = 'libs/lib-a/src/lib/complex-file.ts';
      const content = `
        import { dep1, dep2, dep3 } from './dependencies';
        import type { Type1, Type2 } from './types';
        import * as utils from './utils';
        
        export class MyClass {
          private field1: Type1;
          private field2: Type2;
          
          constructor() {
            this.field1 = dep1();
            this.field2 = dep2();
          }
          
          method1() {
            return utils.helper(this.field1);
          }
          
          method2() {
            return dep3(this.field2);
          }
        }
      `;
      tree.write(filePath, content);

      const targetFile = 'libs/lib-b/src/lib/complex-file.ts';

      // Measure
      const iterations = 100;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        tree.write(filePath, content); // Reset
        updateMovedFileImportsIfNeeded(
          tree,
          filePath,
          targetFile,
          'lib-a',
          'lib-b',
          projects,
        );
      }
      const end = performance.now();
      const avgTime = (end - start) / iterations;

      console.log(`AST transformation average: ${avgTime.toFixed(4)}ms`);
      expect(avgTime).toBeLessThan(15);
    });
  });
});
