import {
  beforeAll,
  beforeAllIterations,
  describe,
  it,
  beforeCycle,
  afterCycle,
} from '../../../../../../tools/tinybench-utils';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import type { Tree } from '@nx/devkit';
import {
  getIndexExports,
  clearIndexExportsCache,
} from '../export-management/index-exports-cache';

describe('Index Exports Cache', () => {
  let tree: Tree;
  let entryPoint: string;

  // Move expensive tree creation to suite-level beforeAll
  beforeAll(() => {
    tree = createTreeWithEmptyWorkspace();
    entryPoint = 'libs/my-lib/src/index.ts';
  });

  // Clear cache before each benchmark cycle
  beforeCycle(() => {
    clearIndexExportsCache();
  });

  afterCycle(() => {
    clearIndexExportsCache();
  });

  describe('Parse re-exports only', () => {
    beforeAllIterations(() => {
      tree.write(
        entryPoint,
        `export * from './lib/file1';
export * from './lib/file2';
export * from './lib/file3';
export { foo, bar } from './lib/file4';`,
      );
    });

    it('should parse re-exports', () => {
      getIndexExports(tree, entryPoint);
    });
  });

  describe('Parse local named exports only', () => {
    beforeAllIterations(() => {
      tree.write(
        entryPoint,
        `export const FOO = 'foo';
export const BAR = 'bar';
export function myFunction() {}
export class MyClass {}
export interface IUser {}
export type UserId = string;`,
      );
    });

    it('should parse local named exports', () => {
      getIndexExports(tree, entryPoint);
    });
  });

  describe('Parse mixed exports', () => {
    beforeAllIterations(() => {
      tree.write(
        entryPoint,
        `export * from './lib/utils';
export { foo } from './lib/helpers';
export const LOCAL_CONST = 'value';
export function localFn() {}
export class LocalClass {}
const internal = 1;
export { internal as exposed };
export default LocalClass;`,
      );
    });

    it('should parse mixed exports', () => {
      getIndexExports(tree, entryPoint);
    });
  });

  describe('Cache hit performance', () => {
    beforeAllIterations(() => {
      tree.write(
        entryPoint,
        `export * from './lib/file1';
export const FOO = 'foo';
export function myFn() {}`,
      );
      // Prime the cache
      getIndexExports(tree, entryPoint);
    });

    it('should retrieve from cache', () => {
      getIndexExports(tree, entryPoint);
    });
  });

  describe('Large file with many exports', () => {
    beforeAllIterations(() => {
      // Generate a large index file with 50 mixed exports
      const lines: string[] = [];
      for (let i = 0; i < 25; i++) {
        lines.push(`export * from './lib/module${i}';`);
        lines.push(`export const CONST_${i} = ${i};`);
      }
      tree.write(entryPoint, lines.join('\n'));
    });

    it('should parse large file with many exports', () => {
      getIndexExports(tree, entryPoint);
    });
  });

  describe('Empty file', () => {
    beforeAllIterations(() => {
      tree.write(entryPoint, '');
    });

    it('should handle empty file', () => {
      getIndexExports(tree, entryPoint);
    });
  });
});
