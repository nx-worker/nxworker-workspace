import Benchmark from 'benchmark';
import { buildFileNames } from '../path-utils/build-file-names';
import { buildPatterns } from '../path-utils/build-patterns';
import { getRelativeImportSpecifier } from '../path-utils/get-relative-import-specifier';
import { removeSourceFileExtension } from '../path-utils/remove-source-file-extension';
import { toAbsoluteWorkspacePath } from '../path-utils/to-absolute-workspace-path';

describe('path-resolution benchmarks', () => {
  it('should run path resolution benchmarks', (done) => {
    const suite = new Benchmark.Suite('Path Resolution');

    // Setup shared state
    let baseNames: string[];
    let prefixes: string[];
    let fileNames: string[];
    let fromPath: string;
    let toPath: string;
    let relativePath: string;
    let filePath: string;

    suite
      .add('buildFileNames', {
        setup: function () {
          baseNames = ['index', 'main'];
        },
        fn: function () {
          buildFileNames(baseNames);
        },
      })
      .add('buildPatterns (100 files)', {
        setup: function () {
          prefixes = Array.from({ length: 100 }, (_, i) => `libs/lib-${i}/`);
          fileNames = ['index.ts', 'main.ts'];
        },
        fn: function () {
          buildPatterns(prefixes, fileNames);
        },
      })
      .add('getRelativeImportSpecifier', {
        setup: function () {
          fromPath = 'libs/lib-a/src/lib/component-a.ts';
          toPath = 'libs/lib-b/src/lib/service-b.ts';
        },
        fn: function () {
          getRelativeImportSpecifier(fromPath, toPath);
        },
      })
      .add('toAbsoluteWorkspacePath', {
        setup: function () {
          relativePath = './libs/my-lib/src/lib/file.ts';
        },
        fn: function () {
          toAbsoluteWorkspacePath(relativePath);
        },
      })
      .add('removeSourceFileExtension', {
        setup: function () {
          filePath = 'libs/my-lib/src/lib/my-file.ts';
        },
        fn: function () {
          removeSourceFileExtension(filePath);
        },
      })
      .on('cycle', (event: Benchmark.Event) => {
        console.log(String(event.target));
      })
      .on('complete', function (this: Benchmark.Suite) {
        done();
      })
      .run();
  }, 120000); // 2 minute timeout
});
