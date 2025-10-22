import { benchmarkSuite } from '../../../../../../tools/tinybench-utils';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import type { ProjectConfiguration, Tree } from '@nx/devkit';
import { checkForRelativeImportsInProject } from '../validation/check-for-relative-imports-in-project';

let project: ProjectConfiguration;
let sourceFiles: string[];
let targetFile: string;
let tree: Tree;

benchmarkSuite(
  'Validation Operations',
  {
    'Check for relative imports - no imports': {
      fn: () => {
        checkForRelativeImportsInProject(
          tree,
          project,
          targetFile,
          () => sourceFiles,
        );
      },
      fnOptions: {
        beforeAll() {
          sourceFiles = Array.from({ length: 20 }, (_, i) =>
            i === 0 ? targetFile : `packages/lib1/src/lib/file-${i}.ts`,
          );
          // Create files without imports
          sourceFiles.forEach((file) => {
            tree.write(file, 'export function test() { return "test"; }');
          });
        },
      },
    },

    'Check for relative imports - with imports': {
      fn: () => {
        checkForRelativeImportsInProject(
          tree,
          project,
          targetFile,
          () => sourceFiles,
        );
      },
      fnOptions: {
        beforeAll() {
          const importerFile = 'packages/lib1/src/lib/main.ts';
          const otherFiles = Array.from({ length: 18 }, (_, i) =>
            i === 0 ? targetFile : `packages/lib1/src/lib/file-${i}.ts`,
          );
          sourceFiles = [targetFile, importerFile, ...otherFiles];

          // Create target file
          tree.write(
            targetFile,
            'export function helper() { return "hello"; }',
          );

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
        },
      },
    },

    'Check for relative imports - nested paths': {
      fn: () => {
        checkForRelativeImportsInProject(
          tree,
          project,
          targetFile,
          () => sourceFiles,
        );
      },
      fnOptions: {
        beforeAll() {
          const importerFile = 'packages/lib1/src/lib/features/auth/login.ts';
          sourceFiles = [targetFile, importerFile];

          // Create target file
          tree.write(
            targetFile,
            'export function helper() { return "hello"; }',
          );

          // Create importer file with nested relative import
          tree.write(
            importerFile,
            "import { helper } from '../../utils/helper';\nexport const login = () => helper();",
          );
        },
      },
    },

    'Check for relative imports - large project': {
      fn: () => {
        checkForRelativeImportsInProject(
          tree,
          project,
          targetFile,
          () => sourceFiles,
        );
      },
      fnOptions: {
        beforeAll() {
          // Simulate a larger project with 100 files
          sourceFiles = Array.from({ length: 100 }, (_, i) =>
            i === 0 ? targetFile : `packages/lib1/src/lib/file-${i}.ts`,
          );

          // Create target file
          tree.write(
            targetFile,
            'export function helper() { return "hello"; }',
          );

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
        },
      },
    },
  },
  {
    setupSuite() {
      project = {
        name: 'lib1',
        root: 'packages/lib1',
        sourceRoot: 'packages/lib1/src',
        projectType: 'library',
      };
      targetFile = 'packages/lib1/src/lib/utils/helper.ts';
    },
    setup() {
      sourceFiles = [];
      tree = createTreeWithEmptyWorkspace();
    },
  },
);
