import {
  benchmark,
  benchmarkSuite,
} from '../../../../../../tools/tinybench-utils';
import { buildFileNames } from '../path-utils/build-file-names';
import { buildPatterns } from '../path-utils/build-patterns';
import { getRelativeImportSpecifier } from '../path-utils/get-relative-import-specifier';
import { removeSourceFileExtension } from '../path-utils/remove-source-file-extension';
import { toAbsoluteWorkspacePath } from '../path-utils/to-absolute-workspace-path';

benchmarkSuite('Path Resolution', () => {
  benchmark('buildFileNames', ({ bench }) => {
    bench(() => {
      const baseNames = ['index', 'main'];
      buildFileNames(baseNames);
    });
  });

  benchmark('buildPatterns (100 files)', ({ bench, beforeAll }) => {
    let buildPatternsPrefixes: readonly string[];

    beforeAll(() => {
      buildPatternsPrefixes = Array.from(
        { length: 100 },
        (_, i) => `libs/lib-${i}/`,
      );
    });

    bench(() => {
      const fileNames = ['index.ts', 'main.ts'];
      buildPatterns(buildPatternsPrefixes, fileNames);
    });
  });

  benchmark('getRelativeImportSpecifier', ({ bench }) => {
    bench(() => {
      const fromPath = 'libs/lib-a/src/lib/component-a.ts';
      const toPath = 'libs/lib-b/src/lib/service-b.ts';
      getRelativeImportSpecifier(fromPath, toPath);
    });
  });

  benchmark('toAbsoluteWorkspacePath', ({ bench }) => {
    bench(() => {
      const relativePath = './libs/my-lib/src/lib/file.ts';
      toAbsoluteWorkspacePath(relativePath);
    });
  });

  benchmark('removeSourceFileExtension', ({ bench }) => {
    bench(() => {
      const filePath = 'libs/my-lib/src/lib/my-file.ts';
      removeSourceFileExtension(filePath);
    });
  });
});
