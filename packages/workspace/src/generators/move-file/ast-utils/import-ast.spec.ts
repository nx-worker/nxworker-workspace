import { findImports, hasImportToPath, updateImports, updateImportsMatching } from './import-ast';

describe('AST Import Utilities', () => {
  describe('findImports', () => {
    it('should find ES6 import statements', () => {
      const code = `
        import { foo } from 'module1';
        import bar from 'module2';
        import * as baz from 'module3';
      `;
      const imports = findImports(code, 'test.ts');
      
      expect(imports).toHaveLength(3);
      expect(imports[0].moduleSpecifier).toBe('module1');
      expect(imports[0].type).toBe('import');
      expect(imports[1].moduleSpecifier).toBe('module2');
      expect(imports[2].moduleSpecifier).toBe('module3');
    });

    it('should find dynamic import statements', () => {
      const code = `
        const module = await import('dynamic-module');
        import('another-module').then(m => m.default);
      `;
      const imports = findImports(code, 'test.ts');
      
      expect(imports).toHaveLength(2);
      expect(imports[0].moduleSpecifier).toBe('dynamic-module');
      expect(imports[0].type).toBe('dynamic-import');
      expect(imports[1].moduleSpecifier).toBe('another-module');
    });

    it('should find require statements', () => {
      const code = `
        const module = require('required-module');
        const { foo } = require('another-required');
      `;
      const imports = findImports(code, 'test.js');
      
      expect(imports).toHaveLength(2);
      expect(imports[0].moduleSpecifier).toBe('required-module');
      expect(imports[0].type).toBe('require');
      expect(imports[1].moduleSpecifier).toBe('another-required');
    });

    it('should find export from statements', () => {
      const code = `
        export { foo } from 'export-module';
        export * from 'another-export';
      `;
      const imports = findImports(code, 'test.ts');
      
      expect(imports).toHaveLength(2);
      expect(imports[0].moduleSpecifier).toBe('export-module');
      expect(imports[0].type).toBe('export');
      expect(imports[1].moduleSpecifier).toBe('another-export');
    });

    it('should find relative imports', () => {
      const code = `
        import { foo } from './relative';
        import bar from '../parent';
        import baz from '../../grandparent';
      `;
      const imports = findImports(code, 'test.ts');
      
      expect(imports).toHaveLength(3);
      expect(imports[0].moduleSpecifier).toBe('./relative');
      expect(imports[1].moduleSpecifier).toBe('../parent');
      expect(imports[2].moduleSpecifier).toBe('../../grandparent');
    });

    it('should handle mixed import types', () => {
      const code = `
        import { a } from 'module1';
        const b = require('module2');
        import('module3').then(m => m.default);
        export { c } from 'module4';
      `;
      const imports = findImports(code, 'test.ts');
      
      expect(imports).toHaveLength(4);
      expect(imports.map(i => i.moduleSpecifier)).toEqual([
        'module1',
        'module2',
        'module3',
        'module4',
      ]);
    });

    it('should handle files with no imports', () => {
      const code = `
        const foo = 'bar';
        function test() {
          return 42;
        }
      `;
      const imports = findImports(code, 'test.ts');
      
      expect(imports).toHaveLength(0);
    });
  });

  describe('hasImportToPath', () => {
    it('should return true when import exists', () => {
      const code = `
        import { foo } from 'target-module';
        import bar from 'other-module';
      `;
      
      expect(hasImportToPath(code, 'test.ts', 'target-module')).toBe(true);
    });

    it('should return false when import does not exist', () => {
      const code = `
        import { foo } from 'other-module';
        import bar from 'another-module';
      `;
      
      expect(hasImportToPath(code, 'test.ts', 'target-module')).toBe(false);
    });

    it('should work with relative paths', () => {
      const code = `
        import { foo } from './relative';
        import bar from '../parent';
      `;
      
      expect(hasImportToPath(code, 'test.ts', './relative')).toBe(true);
      expect(hasImportToPath(code, 'test.ts', '../parent')).toBe(true);
      expect(hasImportToPath(code, 'test.ts', './other')).toBe(false);
    });
  });

  describe('updateImports', () => {
    it('should update import statements', () => {
      const code = `import { foo } from 'old-module';`;
      const replacements = new Map([['old-module', 'new-module']]);
      
      const result = updateImports(code, 'test.ts', replacements);
      
      expect(result).toBe(`import { foo } from 'new-module';`);
    });

    it('should update multiple imports', () => {
      const code = `
        import { foo } from 'module1';
        import bar from 'module2';
        import baz from 'module3';
      `;
      const replacements = new Map([
        ['module1', 'new-module1'],
        ['module3', 'new-module3'],
      ]);
      
      const result = updateImports(code, 'test.ts', replacements);
      
      expect(result).toContain("from 'new-module1'");
      expect(result).toContain("from 'module2'"); // unchanged
      expect(result).toContain("from 'new-module3'");
    });

    it('should update dynamic imports', () => {
      const code = `const module = import('old-module');`;
      const replacements = new Map([['old-module', 'new-module']]);
      
      const result = updateImports(code, 'test.ts', replacements);
      
      expect(result).toBe(`const module = import('new-module');`);
    });

    it('should update require statements', () => {
      const code = `const module = require('old-module');`;
      const replacements = new Map([['old-module', 'new-module']]);
      
      const result = updateImports(code, 'test.js', replacements);
      
      expect(result).toBe(`const module = require('new-module');`);
    });

    it('should preserve quote style', () => {
      const codeDouble = `import { foo } from "old-module";`;
      const codeSingle = `import { foo } from 'old-module';`;
      const replacements = new Map([['old-module', 'new-module']]);
      
      const resultDouble = updateImports(codeDouble, 'test.ts', replacements);
      const resultSingle = updateImports(codeSingle, 'test.ts', replacements);
      
      expect(resultDouble).toBe(`import { foo } from "new-module";`);
      expect(resultSingle).toBe(`import { foo } from 'new-module';`);
    });

    it('should return null when no changes needed', () => {
      const code = `import { foo } from 'module';`;
      const replacements = new Map([['other-module', 'new-module']]);
      
      const result = updateImports(code, 'test.ts', replacements);
      
      expect(result).toBeNull();
    });

    it('should handle export from statements', () => {
      const code = `export { foo } from 'old-module';`;
      const replacements = new Map([['old-module', 'new-module']]);
      
      const result = updateImports(code, 'test.ts', replacements);
      
      expect(result).toBe(`export { foo } from 'new-module';`);
    });
  });

  describe('updateImportsMatching', () => {
    it('should update imports based on matcher function', () => {
      const code = `
        import { foo } from './relative';
        import bar from '../parent';
        import baz from 'absolute';
      `;
      
      const matcher = (spec: string) => {
        if (spec.startsWith('./')) {
          return spec.replace('./', '../new/');
        }
        return null;
      };
      
      const result = updateImportsMatching(code, 'test.ts', matcher);
      
      expect(result).toContain("from '../new/relative'");
      expect(result).toContain("from '../parent'"); // unchanged
      expect(result).toContain("from 'absolute'"); // unchanged
    });

    it('should return null when no matches', () => {
      const code = `import { foo } from 'module';`;
      
      const matcher = () => null;
      
      const result = updateImportsMatching(code, 'test.ts', matcher);
      
      expect(result).toBeNull();
    });
  });
});
