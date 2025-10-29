import {
  beforeAll,
  beforeAllIterations,
  describe,
  it,
  setupTask,
  teardownTask,
} from '../../../../../../tools/tinybench-utils';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import type { ProjectConfiguration, Tree } from '@nx/devkit';
import { checkForRelativeImportsInProject } from '../validation/check-for-relative-imports-in-project';
import { checkForUnexportedRelativeDependencies } from '../validation/check-for-unexported-relative-dependencies';
import { cachedTreeExists as cachedTreeExistsImpl } from '../cache/cached-tree-exists';
import { clearCache } from '../jscodeshift-utils';
import { TreeReadCache } from '../tree-cache';

describe('Validation Operations', () => {
  let cachedTreeExists: (tree: Tree, filePath: string) => boolean;
  let fileExistenceCache: Map<string, boolean>;
  let project: ProjectConfiguration;
  let sourceFiles: string[];
  let targetFile: string;
  let tree: Tree;
  let treeReadCache: TreeReadCache;

  // ✅ OPTIMIZED: Move expensive tree creation and immutable configs to suite-level beforeAll
  // Runs once per suite instead of 1-2 times per benchmark
  beforeAll(() => {
    tree = createTreeWithEmptyWorkspace();
    project = {
      name: 'lib1',
      root: 'packages/lib1',
      sourceRoot: 'packages/lib1/src',
      projectType: 'library',
    };
    targetFile = 'packages/lib1/src/lib/utils/helper.ts';
  });

  setupTask(() => {
    // Reset caches and helper function for each task cycle (warmup and run)
    fileExistenceCache = new Map<string, boolean>();
    cachedTreeExists = (tree, filePath) =>
      cachedTreeExistsImpl(tree, filePath, fileExistenceCache);
    treeReadCache = new TreeReadCache();
    clearCache();
    sourceFiles = [];
  });

  teardownTask(() => {
    fileExistenceCache.clear();
    treeReadCache.clear();
  });

  describe('Check for relative imports - no imports', () => {
    beforeAllIterations(() => {
      sourceFiles = Array.from({ length: 20 }, (_, i) =>
        i === 0 ? targetFile : `packages/lib1/src/lib/file-${i}.ts`,
      );
      // Create files without imports
      sourceFiles.forEach((file) => {
        tree.write(file, 'export function test() { return "test"; }');
      });
    });

    it('should check for relative imports', () => {
      checkForRelativeImportsInProject(
        tree,
        project,
        targetFile,
        () => sourceFiles,
      );
    });
  });

  describe('Check for relative imports - with imports', () => {
    beforeAllIterations(() => {
      const importerFile = 'packages/lib1/src/lib/main.ts';
      const otherFiles = Array.from({ length: 18 }, (_, i) =>
        i === 0 ? targetFile : `packages/lib1/src/lib/file-${i}.ts`,
      );
      sourceFiles = [targetFile, importerFile, ...otherFiles];

      // Create target file
      tree.write(targetFile, 'export function helper() { return "hello"; }');

      // Create importer file
      tree.write(
        importerFile,
        "import { helper } from './utils/helper';\nexport const result = helper();",
      );

      // Create other files without imports
      otherFiles.forEach((file) => {
        if (file !== targetFile) {
          tree.write(file, 'export function test() { return "test"; }');
        }
      });
    });

    it('should check for relative imports', () => {
      checkForRelativeImportsInProject(
        tree,
        project,
        targetFile,
        () => sourceFiles,
      );
    });
  });

  describe('Check for relative imports - nested paths', () => {
    beforeAllIterations(() => {
      const importerFile = 'packages/lib1/src/lib/features/auth/login.ts';
      sourceFiles = [targetFile, importerFile];

      // Create target file
      tree.write(targetFile, 'export function helper() { return "hello"; }');

      // Create importer file with nested relative import
      tree.write(
        importerFile,
        "import { helper } from '../../utils/helper';\nexport const login = () => helper();",
      );
    });

    it('should check for relative imports', () => {
      checkForRelativeImportsInProject(
        tree,
        project,
        targetFile,
        () => sourceFiles,
      );
    });
  });

  describe('Check for relative imports - large project', () => {
    beforeAllIterations(() => {
      // Simulate a larger project with 100 files
      sourceFiles = Array.from({ length: 100 }, (_, i) =>
        i === 0 ? targetFile : `packages/lib1/src/lib/file-${i}.ts`,
      );

      // Create target file
      tree.write(targetFile, 'export function helper() { return "hello"; }');

      // Create files, with one file importing the target
      sourceFiles.forEach((file, i) => {
        if (file === targetFile) {
          return;
        }
        if (i === 50) {
          // One file in the middle imports the target
          tree.write(
            file,
            "import { helper } from './utils/helper';\nexport const use = helper();",
          );
        } else {
          tree.write(file, 'export function test() { return "test"; }');
        }
      });
    });

    it('should check for relative imports', () => {
      checkForRelativeImportsInProject(
        tree,
        project,
        targetFile,
        () => sourceFiles,
      );
    });
  });

  describe('Check for unexported dependencies - no imports', () => {
    beforeAllIterations(() => {
      tree.write('packages/lib1/src/index.ts', '');
      tree.write(targetFile, 'export function helper() { return "hello"; }');
    });

    it('should check for unexported dependencies', () => {
      checkForUnexportedRelativeDependencies(
        tree,
        targetFile,
        project,
        cachedTreeExists,
      );
    });
  });

  describe('Check for unexported dependencies - multiple imports', () => {
    beforeAllIterations(() => {
      tree.write('packages/lib1/src/index.ts', '');

      // Create multiple dependency files
      for (let i = 1; i <= 10; i++) {
        tree.write(
          `packages/lib1/src/lib/util${i}.ts`,
          `export function util${i}() { return "util${i}"; }`,
        );
      }

      // Create file with multiple imports
      const imports = Array.from(
        { length: 10 },
        (_, i) => `import { util${i + 1} } from './util${i + 1}';`,
      ).join('\n');
      tree.write(
        'packages/lib1/src/lib/file.ts',
        `${imports}\nexport function file() { return "test"; }`,
      );
    });

    it('should check for unexported dependencies', () => {
      checkForUnexportedRelativeDependencies(
        tree,
        'packages/lib1/src/lib/file.ts',
        project,
        cachedTreeExists,
      );
    });
  });

  describe('Check for unexported dependencies - large file', () => {
    beforeAllIterations(() => {
      tree.write('packages/lib1/src/index.ts', '');

      // Create a large number of dependency files
      for (let i = 1; i <= 20; i++) {
        tree.write(
          `packages/lib1/src/lib/util${i}.ts`,
          `export function util${i}() { return "util${i}"; }`,
        );
      }

      // Create a large file with many imports
      const imports = Array.from(
        { length: 20 },
        (_, i) => `import { util${i + 1} } from './util${i + 1}';`,
      ).join('\n');
      const functions = Array.from(
        { length: 20 },
        (_, i) => `function func${i}() { return util${i + 1}(); }`,
      ).join('\n');
      tree.write(
        'packages/lib1/src/lib/large-file.ts',
        `${imports}\n${functions}\nexport function main() { return "test"; }`,
      );
    });

    it('should check for unexported dependencies', () => {
      checkForUnexportedRelativeDependencies(
        tree,
        'packages/lib1/src/lib/large-file.ts',
        project,
        cachedTreeExists,
      );
    });
  });
});
