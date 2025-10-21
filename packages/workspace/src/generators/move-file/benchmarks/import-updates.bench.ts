import { benchmarkSuite } from '../../../../../../tools/tinybench-utils';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import type { ProjectConfiguration } from '@nx/devkit';
import { updateMovedFileImportsIfNeeded } from '../import-updates/update-moved-file-imports-if-needed';

describe('Import Updates', () => {
  it('should run benchmarks', async () => {
    await benchmarkSuite('Import Updates', {
      'Import update': () => {
        const tree = createTreeWithEmptyWorkspace();
        const projects = new Map<string, ProjectConfiguration>();
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
        const sourceFile = 'libs/lib-a/src/lib/source.ts';
        const targetFile = 'libs/lib-b/src/lib/target.ts';
        const fileContent = `
      import { service1 } from './services/service1';
      import { service2 } from './services/service2';
      import { util1 } from './utils/util1';
      
      export function myFunction() {
        return service1() + service2() + util1();
      }
    `;
        tree.write(sourceFile, fileContent);
        updateMovedFileImportsIfNeeded(
          tree,
          sourceFile,
          targetFile,
          'lib-a',
          'lib-b',
          projects,
        );
      },
    });
  });
});
