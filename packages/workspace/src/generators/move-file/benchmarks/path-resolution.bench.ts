import {
  benchmark,
  benchmarkSuite,
} from '../../../../../../tools/tinybench-utils';
import { buildFileNames } from '../path-utils/build-file-names';
import { buildPatterns } from '../path-utils/build-patterns';
import { getRelativeImportSpecifier } from '../path-utils/get-relative-import-specifier';
import { removeSourceFileExtension } from '../path-utils/remove-source-file-extension';
import { toAbsoluteWorkspacePath } from '../path-utils/to-absolute-workspace-path';

benchmarkSuite('Path Resolution', {
  buildFileNames: () => {
    const baseNames = ['index', 'main'];
    buildFileNames(baseNames);
  },

  'buildPatterns (100 files)': benchmark(() => {
    // Benchmark-level factory for local state
    let buildPatternsPrefixes: readonly string[];

    return {
      fn: () => {
        const fileNames = ['index.ts', 'main.ts'];
        buildPatterns(buildPatternsPrefixes, fileNames);
      },
      fnOptions: {
        beforeAll() {
          buildPatternsPrefixes = Array.from(
            { length: 100 },
            (_, i) => `libs/lib-${i}/`,
          );
        },
      },
    };
  }),

  getRelativeImportSpecifier: () => {
    const fromPath = 'libs/lib-a/src/lib/component-a.ts';
    const toPath = 'libs/lib-b/src/lib/service-b.ts';
    getRelativeImportSpecifier(fromPath, toPath);
  },

  toAbsoluteWorkspacePath: () => {
    const relativePath = './libs/my-lib/src/lib/file.ts';
    toAbsoluteWorkspacePath(relativePath);
  },

  removeSourceFileExtension: () => {
    const filePath = 'libs/my-lib/src/lib/my-file.ts';
    removeSourceFileExtension(filePath);
  },
});
