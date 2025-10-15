import Benchmark from 'benchmark';
import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import type { ProjectConfiguration } from '@nx/devkit';
import { isFileExported } from '../export-management/is-file-exported';
import { ensureFileExported } from '../export-management/ensure-file-exported';
import { removeFileExport } from '../export-management/remove-file-export';
import { treeReadCache } from '../tree-cache';

describe('export-management benchmarks', () => {
  it('should run export management benchmarks', (done) => {
    const suite = new Benchmark.Suite('Export Management');

    // Setup shared state
    let tree: Tree;
    let project: ProjectConfiguration;
    let cachedTreeExists: (tree: Tree, filePath: string) => boolean;
    let entryPoint: string;
    const initialContent = `
      export * from './lib/file1';
      export * from './lib/file2';
    `;

    suite
      .add('Export detection', {
        setup: function () {
          tree = createTreeWithEmptyWorkspace();
          project = {
            root: 'libs/my-lib',
            sourceRoot: 'libs/my-lib/src',
            name: 'my-lib',
          } as ProjectConfiguration;
          cachedTreeExists = (t, path) => t.exists(path);
          treeReadCache.clear();
          entryPoint = 'libs/my-lib/src/index.ts';
          tree.write(
            entryPoint,
            `
            export * from './lib/file1';
            export * from './lib/file2';
            export * from './lib/file3';
          `,
          );
        },
        fn: function () {
          isFileExported(tree, project, 'lib/file2.ts', cachedTreeExists);
        },
      })
      .add('Export addition', {
        setup: function () {
          tree = createTreeWithEmptyWorkspace();
          project = {
            root: 'libs/my-lib',
            sourceRoot: 'libs/my-lib/src',
            name: 'my-lib',
          } as ProjectConfiguration;
          cachedTreeExists = (t, path) => t.exists(path);
          treeReadCache.clear();
          entryPoint = 'libs/my-lib/src/index.ts';
          tree.write(entryPoint, initialContent);
        },
        fn: function () {
          ensureFileExported(
            tree,
            project,
            'lib/new-file.ts',
            cachedTreeExists,
          );
        },
      })
      .add('Export removal', {
        setup: function () {
          tree = createTreeWithEmptyWorkspace();
          project = {
            root: 'libs/my-lib',
            sourceRoot: 'libs/my-lib/src',
            name: 'my-lib',
          } as ProjectConfiguration;
          cachedTreeExists = (t, path) => t.exists(path);
          treeReadCache.clear();
          entryPoint = 'libs/my-lib/src/index.ts';
          tree.write(
            entryPoint,
            `
            export * from './lib/file1';
            export * from './lib/to-remove';
            export * from './lib/file2';
          `,
          );
        },
        fn: function () {
          removeFileExport(tree, project, 'lib/to-remove.ts', cachedTreeExists);
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
