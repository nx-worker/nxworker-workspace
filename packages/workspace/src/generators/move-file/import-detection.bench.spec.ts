import { escapeRegex } from './security-utils/escape-regex';
import { findImports, hasImportToPath, updateImports } from './ast-utils/import-ast';
import { benchmark, compareBenchmarks } from './benchmark-utils';

describe('Import Detection Performance Benchmarks', () => {
  const sampleCode = `
    import { foo, bar, baz } from '@scope/module1';
    import type { Type1, Type2 } from '@scope/module2';
    import * as utils from './utils/helpers';
    import defaultExport from '../parent/component';
    import { lazy } from './lazy-loader';
    
    const dynamicModule = import('./dynamic-module');
    const lazyComponent = () => import('./components/LazyComponent');
    
    export { foo, bar } from '@scope/module1';
    export * from './exports';
    
    const oldStyle = require('./old-module');
    const { feature } = require('../features/feature');
  `;

  describe('Detection Benchmarks', () => {
    it('should benchmark regex-based detection', () => {
      const targetPath = '@scope/module1';
      const escapedPath = escapeRegex(targetPath);
      
      const regexFn = () => {
        const patterns = [
          new RegExp(`from\\s+['"]${escapedPath}['"]`),
          new RegExp(`import\\s*\\(\\s*['"]${escapedPath}['"]\\s*\\)`),
          new RegExp(`require\\(\\s*['"]${escapedPath}['"]\\s*\\)`),
        ];
        return patterns.some((pattern) => pattern.test(sampleCode));
      };

      const result = benchmark('Regex Detection', regexFn, 1000);
      
      console.log(`\nRegex Detection Benchmark:`);
      console.log(`  Average time: ${result.averageTimeMs.toFixed(3)}ms`);
      console.log(`  Total time: ${result.executionTimeMs.toFixed(2)}ms (${result.iterations} iterations)`);
      
      expect(result.averageTimeMs).toBeGreaterThan(0);
    });

    it('should benchmark AST-based detection', () => {
      const targetPath = '@scope/module1';
      
      const astFn = () => {
        return hasImportToPath(sampleCode, 'test.ts', targetPath);
      };

      const result = benchmark('AST Detection', astFn, 1000);
      
      console.log(`\nAST Detection Benchmark:`);
      console.log(`  Average time: ${result.averageTimeMs.toFixed(3)}ms`);
      console.log(`  Total time: ${result.executionTimeMs.toFixed(2)}ms (${result.iterations} iterations)`);
      
      expect(result.averageTimeMs).toBeGreaterThan(0);
    });

    it('should compare detection methods', () => {
      const targetPath = '@scope/module1';
      const escapedPath = escapeRegex(targetPath);
      
      const regexFn = () => {
        const patterns = [
          new RegExp(`from\\s+['"]${escapedPath}['"]`),
          new RegExp(`import\\s*\\(\\s*['"]${escapedPath}['"]\\s*\\)`),
          new RegExp(`require\\(\\s*['"]${escapedPath}['"]\\s*\\)`),
        ];
        return patterns.some((pattern) => pattern.test(sampleCode));
      };

      const astFn = () => {
        return hasImportToPath(sampleCode, 'test.ts', targetPath);
      };

      const regexResult = benchmark('Regex Detection', regexFn, 1000);
      const astResult = benchmark('AST Detection', astFn, 1000);
      
      const comparison = compareBenchmarks(regexResult, astResult);
      console.log(comparison);
      
      // Both should produce the same result
      expect(regexFn()).toBe(astFn());
    });
  });

  describe('Update Benchmarks', () => {
    it('should benchmark regex-based update', () => {
      const sourceImportPath = '@scope/module1';
      const targetImportPath = '@scope/new-module1';
      
      const regexFn = () => {
        const escapedSourcePath = escapeRegex(sourceImportPath);
        const staticPattern = new RegExp(
          `(from\\s+['"])(?:${escapedSourcePath})(['"])`,
          'g',
        );
        const dynamicPattern = new RegExp(
          `(import\\s*\\(\\s*['"])(?:${escapedSourcePath})(['"]\\s*\\))`,
          'g',
        );
        
        let updatedContent = sampleCode;
        updatedContent = updatedContent.replace(
          staticPattern,
          (_match, prefix: string, suffix: string) => {
            return `${prefix}${targetImportPath}${suffix}`;
          },
        );
        updatedContent = updatedContent.replace(
          dynamicPattern,
          (_match, prefix: string, suffix: string) => {
            return `${prefix}${targetImportPath}${suffix}`;
          },
        );
        return updatedContent;
      };

      const result = benchmark('Regex Update', regexFn, 1000);
      
      console.log(`\nRegex Update Benchmark:`);
      console.log(`  Average time: ${result.averageTimeMs.toFixed(3)}ms`);
      console.log(`  Total time: ${result.executionTimeMs.toFixed(2)}ms (${result.iterations} iterations)`);
      
      expect(result.averageTimeMs).toBeGreaterThan(0);
    });

    it('should benchmark AST-based update', () => {
      const sourceImportPath = '@scope/module1';
      const targetImportPath = '@scope/new-module1';
      
      const astFn = () => {
        const replacements = new Map([[sourceImportPath, targetImportPath]]);
        return updateImports(sampleCode, 'test.ts', replacements);
      };

      const result = benchmark('AST Update', astFn, 1000);
      
      console.log(`\nAST Update Benchmark:`);
      console.log(`  Average time: ${result.averageTimeMs.toFixed(3)}ms`);
      console.log(`  Total time: ${result.executionTimeMs.toFixed(2)}ms (${result.iterations} iterations)`);
      
      expect(result.averageTimeMs).toBeGreaterThan(0);
    });

    it('should compare update methods', () => {
      const sourceImportPath = '@scope/module1';
      const targetImportPath = '@scope/new-module1';
      
      const regexFn = () => {
        const escapedSourcePath = escapeRegex(sourceImportPath);
        const staticPattern = new RegExp(
          `(from\\s+['"])(?:${escapedSourcePath})(['"])`,
          'g',
        );
        const dynamicPattern = new RegExp(
          `(import\\s*\\(\\s*['"])(?:${escapedSourcePath})(['"]\\s*\\))`,
          'g',
        );
        
        let updatedContent = sampleCode;
        updatedContent = updatedContent.replace(
          staticPattern,
          (_match, prefix: string, suffix: string) => {
            return `${prefix}${targetImportPath}${suffix}`;
          },
        );
        updatedContent = updatedContent.replace(
          dynamicPattern,
          (_match, prefix: string, suffix: string) => {
            return `${prefix}${targetImportPath}${suffix}`;
          },
        );
        return updatedContent;
      };

      const astFn = () => {
        const replacements = new Map([[sourceImportPath, targetImportPath]]);
        return updateImports(sampleCode, 'test.ts', replacements);
      };

      const regexResult = benchmark('Regex Update', regexFn, 1000);
      const astResult = benchmark('AST Update', astFn, 1000);
      
      const comparison = compareBenchmarks(regexResult, astResult);
      console.log(comparison);
      
      // Verify both produce similar results (AST may differ in whitespace/formatting)
      const regexOutput = regexFn();
      const astOutput = astFn();
      expect(regexOutput).toContain(targetImportPath);
      expect(astOutput).toContain(targetImportPath);
    });
  });

  describe('Relative Import Benchmarks', () => {
    const relativeCode = `
      import { a } from './relative-file';
      import { b } from '../parent-file';
      import { c } from '../../grandparent-file';
      const d = import('./dynamic-relative');
    `;

    it('should benchmark regex-based relative import detection', () => {
      const sourceFileName = 'relative-file';
      const escapedFileName = escapeRegex(sourceFileName);
      
      const regexFn = () => {
        const staticPattern = new RegExp(
          `(from\\s+['"])(\\.{1,2}/[^'"]*${escapedFileName}[^'"]*)(['"])`,
          'g',
        );
        return staticPattern.test(relativeCode);
      };

      const result = benchmark('Regex Relative Detection', regexFn, 1000);
      
      console.log(`\nRegex Relative Detection Benchmark:`);
      console.log(`  Average time: ${result.averageTimeMs.toFixed(3)}ms`);
      console.log(`  Total time: ${result.executionTimeMs.toFixed(2)}ms (${result.iterations} iterations)`);
      
      expect(result.averageTimeMs).toBeGreaterThan(0);
    });

    it('should benchmark AST-based relative import detection', () => {
      const astFn = () => {
        const imports = findImports(relativeCode, 'test.ts');
        return imports.some(imp => imp.moduleSpecifier.includes('relative-file'));
      };

      const result = benchmark('AST Relative Detection', astFn, 1000);
      
      console.log(`\nAST Relative Detection Benchmark:`);
      console.log(`  Average time: ${result.averageTimeMs.toFixed(3)}ms`);
      console.log(`  Total time: ${result.executionTimeMs.toFixed(2)}ms (${result.iterations} iterations)`);
      
      expect(result.averageTimeMs).toBeGreaterThan(0);
    });
  });
});
