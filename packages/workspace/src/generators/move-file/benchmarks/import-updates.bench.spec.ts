import Benchmark from 'benchmark';
import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import type { ProjectConfiguration } from '@nx/devkit';
import { updateMovedFileImportsIfNeeded } from '../import-updates/update-moved-file-imports-if-needed';

describe('import-updates benchmarks', () => {
  it('should run import update benchmarks', (done) => {
    const suite = new Benchmark.Suite('Import Updates');

    // Setup shared state
    let tree: Tree;
    let projects: Map<string, ProjectConfiguration>;
    let sourceFile: string;
    let targetFile: string;
    const fileContent = `
      import { service1 } from './services/service1';
      import { service2 } from './services/service2';
      import { util1 } from './utils/util1';
      
      export function myFunction() {
        return service1() + service2() + util1();
      }
    `;

    suite
      .add('Import update', {
        setup: function () {
          tree = createTreeWithEmptyWorkspace();
          projects = new Map();
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
          sourceFile = 'libs/lib-a/src/lib/source.ts';
          targetFile = 'libs/lib-b/src/lib/target.ts';
          tree.write(sourceFile, fileContent);
        },
        fn: function () {
          updateMovedFileImportsIfNeeded(
            tree,
            sourceFile,
            targetFile,
            'lib-a',
            'lib-b',
            projects,
          );
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
