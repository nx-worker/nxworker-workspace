import { benchmarkSuite } from '../../../../../../tools/tinybench-utils';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import type { ProjectConfiguration, Tree } from '@nx/devkit';
import { updateMovedFileImportsIfNeeded } from '../import-updates/update-moved-file-imports-if-needed';
import { cachedTreeExists } from '../cache/cached-tree-exists';
import { MoveContext } from '../types/move-context';

benchmarkSuite('Import Updates', () => {
  // Shared scope for all benchmarks - replaces module-level variables
  let fileExistenceCache: Map<string, boolean>;
  let sourceFile: string;
  let targetFile: string;
  let projects: Map<string, ProjectConfiguration>;
  let tree: Tree;

  return {
    benchmarks: {
      'Import update': () => {
        updateMovedFileImportsIfNeeded(
          tree,
          {
            isSameProject: false,
            normalizedSource: sourceFile,
            normalizedTarget: targetFile,
            sourceProject: projects.get('lib-a'),
            sourceImportPath: '@my/lib-a',
          } satisfies Partial<MoveContext> as MoveContext,
          (tree, filePath) =>
            cachedTreeExists(tree, filePath, fileExistenceCache),
        );
      },
    },
    setupSuite() {
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
      fileExistenceCache = new Map<string, boolean>();
    },
    setup() {
      const fileContent = `
        import { service1 } from './services/service1';
        import { service2 } from './services/service2';
        import { util1 } from './utils/util1';

        export function myFunction() {
          return service1() + service2() + util1();
        }
      `;
      tree.write(sourceFile, fileContent);
    },
    teardown() {
      if (tree.exists(sourceFile)) {
        tree.delete(sourceFile);
      }

      if (tree.exists(targetFile)) {
        tree.delete(targetFile);
      }

      fileExistenceCache.clear();
    },
  };
});
