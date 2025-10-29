import {
  beforeAll,
  describe,
  it,
} from '../../../../../../tools/tinybench-utils';
import { buildFileNames } from '../path-utils/build-file-names';
import { buildPatterns } from '../path-utils/build-patterns';
import { getRelativeImportSpecifier } from '../path-utils/get-relative-import-specifier';
import { removeSourceFileExtension } from '../path-utils/remove-source-file-extension';
import { toAbsoluteWorkspacePath } from '../path-utils/to-absolute-workspace-path';

describe('Path Resolution', () => {
  describe('buildFileNames', () => {
    it('should build file names correctly', () => {
      const baseNames = ['index', 'main'];
      buildFileNames(baseNames);
    });
  });

  describe('buildPatterns (100 files)', () => {
    let buildPatternsPrefixes: readonly string[];

    // ✅ OPTIMIZED: Move array creation to suite-level beforeAll
    // Runs once per suite instead of 1-2 times per benchmark
    beforeAll(() => {
      buildPatternsPrefixes = Array.from(
        { length: 100 },
        (_, i) => `libs/lib-${i}/`,
      );
    });

    it('should build patterns correctly', () => {
      const fileNames = ['index.ts', 'main.ts'];
      buildPatterns(buildPatternsPrefixes, fileNames);
    });
  });

  describe('getRelativeImportSpecifier', () => {
    it('should get relative import specifier correctly', () => {
      const fromPath = 'libs/lib-a/src/lib/component-a.ts';
      const toPath = 'libs/lib-b/src/lib/service-b.ts';
      getRelativeImportSpecifier(fromPath, toPath);
    });
  });

  describe('toAbsoluteWorkspacePath', () => {
    it('should convert relative path to absolute workspace path', () => {
      const relativePath = './libs/my-lib/src/lib/file.ts';
      toAbsoluteWorkspacePath(relativePath);
    });
  });

  describe('removeSourceFileExtension', () => {
    it('should remove source file extension correctly', () => {
      const filePath = 'libs/my-lib/src/lib/my-file.ts';
      removeSourceFileExtension(filePath);
    });
  });
});
