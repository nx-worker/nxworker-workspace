import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import {
  getIndexExports,
  clearIndexExportsCache,
  invalidateIndexExportsCache,
} from './index-exports-cache';
import { astCache } from '../ast-cache';

describe('index-exports-cache', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    clearIndexExportsCache();
    astCache.clear();
  });

  afterEach(() => {
    clearIndexExportsCache();
    astCache.clear();
  });

  describe('getIndexExports', () => {
    describe('re-exports', () => {
      it('should parse export * from re-exports', () => {
        tree.write(
          'libs/mylib/src/index.ts',
          `export * from './lib/utils';\nexport * from './lib/helpers';`,
        );

        const result = getIndexExports(tree, 'libs/mylib/src/index.ts');

        expect(result.reexports).toEqual(
          new Set(['./lib/utils', './lib/helpers']),
        );
        expect(result.exports.size).toBe(0);
        expect(result.defaultExport).toBeUndefined();
      });

      it('should parse export { ... } from re-exports', () => {
        tree.write(
          'libs/mylib/src/index.ts',
          `export { foo, bar } from './lib/utils';`,
        );

        const result = getIndexExports(tree, 'libs/mylib/src/index.ts');

        expect(result.reexports).toEqual(new Set(['./lib/utils']));
        expect(result.exports.size).toBe(0);
      });

      it('should parse mixed re-export patterns', () => {
        tree.write(
          'libs/mylib/src/index.ts',
          `export * from './lib/utils';\nexport { foo } from './lib/helpers';`,
        );

        const result = getIndexExports(tree, 'libs/mylib/src/index.ts');

        expect(result.reexports).toEqual(
          new Set(['./lib/utils', './lib/helpers']),
        );
      });
    });

    describe('local named exports', () => {
      it('should parse export const declarations', () => {
        tree.write(
          'libs/mylib/src/index.ts',
          `export const FOO = 'foo';\nexport const BAR = 'bar', BAZ = 'baz';`,
        );

        const result = getIndexExports(tree, 'libs/mylib/src/index.ts');

        expect(result.exports).toEqual(new Set(['FOO', 'BAR', 'BAZ']));
        expect(result.reexports.size).toBe(0);
      });

      it('should parse export let and var declarations', () => {
        tree.write(
          'libs/mylib/src/index.ts',
          `export let counter = 0;\nexport var legacy = true;`,
        );

        const result = getIndexExports(tree, 'libs/mylib/src/index.ts');

        expect(result.exports).toEqual(new Set(['counter', 'legacy']));
      });

      it('should parse export function declarations', () => {
        tree.write(
          'libs/mylib/src/index.ts',
          `export function myFunction() {}\nexport function anotherFn(x: number) { return x * 2; }`,
        );

        const result = getIndexExports(tree, 'libs/mylib/src/index.ts');

        expect(result.exports).toEqual(new Set(['myFunction', 'anotherFn']));
      });

      it('should parse export class declarations', () => {
        tree.write(
          'libs/mylib/src/index.ts',
          `export class MyClass {}\nexport class AnotherClass { constructor() {} }`,
        );

        const result = getIndexExports(tree, 'libs/mylib/src/index.ts');

        expect(result.exports).toEqual(new Set(['MyClass', 'AnotherClass']));
      });

      it('should parse export interface declarations', () => {
        tree.write(
          'libs/mylib/src/index.ts',
          `export interface IUser {}\nexport interface IProduct { id: number; }`,
        );

        const result = getIndexExports(tree, 'libs/mylib/src/index.ts');

        expect(result.exports).toEqual(new Set(['IUser', 'IProduct']));
      });

      it('should parse export type declarations', () => {
        tree.write(
          'libs/mylib/src/index.ts',
          `export type UserId = string;\nexport type ProductId = number;`,
        );

        const result = getIndexExports(tree, 'libs/mylib/src/index.ts');

        expect(result.exports).toEqual(new Set(['UserId', 'ProductId']));
      });

      it('should parse export enum declarations', () => {
        tree.write(
          'libs/mylib/src/index.ts',
          `export enum Color { Red, Green, Blue }\nexport enum Size { Small, Medium, Large }`,
        );

        const result = getIndexExports(tree, 'libs/mylib/src/index.ts');

        expect(result.exports).toEqual(new Set(['Color', 'Size']));
      });

      it('should parse export list without from', () => {
        tree.write(
          'libs/mylib/src/index.ts',
          `const foo = 1;\nconst bar = 2;\nexport { foo, bar };`,
        );

        const result = getIndexExports(tree, 'libs/mylib/src/index.ts');

        expect(result.exports).toEqual(new Set(['foo', 'bar']));
        expect(result.reexports.size).toBe(0);
      });

      it('should parse export list with aliases', () => {
        tree.write(
          'libs/mylib/src/index.ts',
          `const internal = 1;\nexport { internal as publicName };`,
        );

        const result = getIndexExports(tree, 'libs/mylib/src/index.ts');

        // Should use the exported name (alias), not the local name
        expect(result.exports).toEqual(new Set(['publicName']));
      });

      it('should parse mixed local exports', () => {
        tree.write(
          'libs/mylib/src/index.ts',
          `export const FOO = 'foo';
export function myFn() {}
export class MyClass {}
export interface IUser {}
export type UserId = string;
export enum Status { Active }`,
        );

        const result = getIndexExports(tree, 'libs/mylib/src/index.ts');

        expect(result.exports).toEqual(
          new Set(['FOO', 'myFn', 'MyClass', 'IUser', 'UserId', 'Status']),
        );
      });
    });

    describe('default exports', () => {
      it('should parse default export with identifier', () => {
        tree.write(
          'libs/mylib/src/index.ts',
          `const MyComponent = {};\nexport default MyComponent;`,
        );

        const result = getIndexExports(tree, 'libs/mylib/src/index.ts');

        expect(result.defaultExport).toBe('MyComponent');
      });

      it('should parse default export with named function', () => {
        tree.write(
          'libs/mylib/src/index.ts',
          `export default function myFunction() {}`,
        );

        const result = getIndexExports(tree, 'libs/mylib/src/index.ts');

        expect(result.defaultExport).toBe('myFunction');
      });

      it('should parse default export with anonymous function', () => {
        tree.write(
          'libs/mylib/src/index.ts',
          `export default function() { return 42; }`,
        );

        const result = getIndexExports(tree, 'libs/mylib/src/index.ts');

        expect(result.defaultExport).toBe('<anonymous>');
      });

      it('should parse default export with named class', () => {
        tree.write(
          'libs/mylib/src/index.ts',
          `export default class MyClass {}`,
        );

        const result = getIndexExports(tree, 'libs/mylib/src/index.ts');

        expect(result.defaultExport).toBe('MyClass');
      });

      it('should parse default export with anonymous class', () => {
        tree.write(
          'libs/mylib/src/index.ts',
          `export default class { constructor() {} }`,
        );

        const result = getIndexExports(tree, 'libs/mylib/src/index.ts');

        expect(result.defaultExport).toBe('<anonymous>');
      });

      it('should parse default export with expression', () => {
        tree.write('libs/mylib/src/index.ts', `export default { foo: 'bar' };`);

        const result = getIndexExports(tree, 'libs/mylib/src/index.ts');

        expect(result.defaultExport).toBe('<default>');
      });
    });

    describe('mixed exports', () => {
      it('should parse combination of all export types', () => {
        tree.write(
          'libs/mylib/src/index.ts',
          `export * from './lib/utils';
export { foo } from './lib/helpers';
export const LOCAL_CONST = 'value';
export function localFn() {}
export class LocalClass {}
const internal = 1;
export { internal as exposed };
export default LocalClass;`,
        );

        const result = getIndexExports(tree, 'libs/mylib/src/index.ts');

        expect(result.reexports).toEqual(
          new Set(['./lib/utils', './lib/helpers']),
        );
        expect(result.exports).toEqual(
          new Set(['LOCAL_CONST', 'localFn', 'LocalClass', 'exposed']),
        );
        expect(result.defaultExport).toBe('LocalClass');
      });
    });

    describe('edge cases', () => {
      it('should handle empty file', () => {
        tree.write('libs/mylib/src/index.ts', '');

        const result = getIndexExports(tree, 'libs/mylib/src/index.ts');

        expect(result.exports.size).toBe(0);
        expect(result.reexports.size).toBe(0);
        expect(result.defaultExport).toBeUndefined();
      });

      it('should handle file with no exports', () => {
        tree.write(
          'libs/mylib/src/index.ts',
          `const foo = 1;\nfunction bar() {}\nclass Baz {}`,
        );

        const result = getIndexExports(tree, 'libs/mylib/src/index.ts');

        expect(result.exports.size).toBe(0);
        expect(result.reexports.size).toBe(0);
        expect(result.defaultExport).toBeUndefined();
      });

      it('should handle file with only comments', () => {
        tree.write(
          'libs/mylib/src/index.ts',
          `// This is a comment\n/* Block comment */`,
        );

        const result = getIndexExports(tree, 'libs/mylib/src/index.ts');

        expect(result.exports.size).toBe(0);
        expect(result.reexports.size).toBe(0);
      });

      it('should handle non-existent file', () => {
        const result = getIndexExports(tree, 'libs/mylib/src/missing.ts');

        expect(result.exports.size).toBe(0);
        expect(result.reexports.size).toBe(0);
        expect(result.defaultExport).toBeUndefined();
      });
    });

    describe('caching', () => {
      it('should cache results', () => {
        tree.write(
          'libs/mylib/src/index.ts',
          `export const FOO = 'foo';\nexport * from './lib/utils';`,
        );

        const result1 = getIndexExports(tree, 'libs/mylib/src/index.ts');
        const result2 = getIndexExports(tree, 'libs/mylib/src/index.ts');

        // Should return the same cached object
        expect(result1).toBe(result2);
      });

      it('should clear cache when clearIndexExportsCache is called', () => {
        tree.write('libs/mylib/src/index.ts', `export const FOO = 'foo';`);

        const result1 = getIndexExports(tree, 'libs/mylib/src/index.ts');

        // Modify file and clear cache
        tree.write('libs/mylib/src/index.ts', `export const BAR = 'bar';`);
        clearIndexExportsCache();
        astCache.clear(); // Also clear AST cache to force re-parse

        const result2 = getIndexExports(tree, 'libs/mylib/src/index.ts');

        // Should be different objects with different content
        expect(result1).not.toBe(result2);
        expect(result1.exports).toEqual(new Set(['FOO']));
        expect(result2.exports).toEqual(new Set(['BAR']));
      });

      it('should invalidate specific file when invalidateIndexExportsCache is called', () => {
        tree.write('libs/mylib/src/index.ts', `export const FOO = 'foo';`);
        tree.write('libs/other/src/index.ts', `export const BAR = 'bar';`);

        const result1a = getIndexExports(tree, 'libs/mylib/src/index.ts');
        const result2a = getIndexExports(tree, 'libs/other/src/index.ts');

        // Modify one file and invalidate only that cache
        tree.write('libs/mylib/src/index.ts', `export const BAZ = 'baz';`);
        invalidateIndexExportsCache('libs/mylib/src/index.ts');
        astCache.invalidate('libs/mylib/src/index.ts');

        const result1b = getIndexExports(tree, 'libs/mylib/src/index.ts');
        const result2b = getIndexExports(tree, 'libs/other/src/index.ts');

        // First file should be re-parsed
        expect(result1a).not.toBe(result1b);
        expect(result1b.exports).toEqual(new Set(['BAZ']));

        // Second file should still use cache
        expect(result2a).toBe(result2b);
        expect(result2b.exports).toEqual(new Set(['BAR']));
      });
    });

    describe('TypeScript specific', () => {
      it('should handle TypeScript-only export types', () => {
        tree.write(
          'libs/mylib/src/index.ts',
          `export interface Config { port: number; }
export type Result<T> = { data: T };
export enum LogLevel { Info, Warn, Error }`,
        );

        const result = getIndexExports(tree, 'libs/mylib/src/index.ts');

        expect(result.exports).toEqual(
          new Set(['Config', 'Result', 'LogLevel']),
        );
      });

      it('should handle export type { ... } from (type-only re-export)', () => {
        tree.write(
          'libs/mylib/src/index.ts',
          `export type { User } from './types';`,
        );

        const result = getIndexExports(tree, 'libs/mylib/src/index.ts');

        // Type-only re-exports should still be captured as re-exports
        expect(result.reexports).toEqual(new Set(['./types']));
      });
    });
  });
});
