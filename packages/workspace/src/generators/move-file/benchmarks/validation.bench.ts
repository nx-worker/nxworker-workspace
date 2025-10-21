import { benchmarkSuite } from 'jest-bench';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import type { ProjectConfiguration } from '@nx/devkit';
import { checkForRelativeImportsInProject } from '../validation/check-for-relative-imports-in-project';

// Setup for 'no imports' benchmark
const setupNoImports = () => {
  const tree = createTreeWithEmptyWorkspace();
  const project: ProjectConfiguration = {
    name: 'lib1',
    root: 'packages/lib1',
    sourceRoot: 'packages/lib1/src',
    projectType: 'library',
  };

  const targetFile = 'packages/lib1/src/lib/utils/helper.ts';
  const sourceFiles = Array.from({ length: 20 }, (_, i) =>
    i === 0 ? targetFile : `packages/lib1/src/lib/file-${i}.ts`,
  );

  // Create files without imports
  sourceFiles.forEach((file) => {
    tree.write(file, 'export function test() { return "test"; }');
  });

  const getProjectSourceFiles = jest.fn().mockReturnValue(sourceFiles);

  return { tree, project, targetFile, getProjectSourceFiles };
};

// Setup for 'with imports' benchmark
const setupWithImports = () => {
  const tree = createTreeWithEmptyWorkspace();
  const project: ProjectConfiguration = {
    name: 'lib1',
    root: 'packages/lib1',
    sourceRoot: 'packages/lib1/src',
    projectType: 'library',
  };

  const targetFile = 'packages/lib1/src/lib/utils/helper.ts';
  const importerFile = 'packages/lib1/src/lib/main.ts';
  const otherFiles = Array.from({ length: 18 }, (_, i) =>
    i === 0 ? targetFile : `packages/lib1/src/lib/file-${i}.ts`,
  );
  const sourceFiles = [targetFile, importerFile, ...otherFiles];

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

  const getProjectSourceFiles = jest.fn().mockReturnValue(sourceFiles);

  return { tree, project, targetFile, getProjectSourceFiles };
};

// Setup for 'nested paths' benchmark
const setupNestedPaths = () => {
  const tree = createTreeWithEmptyWorkspace();
  const project: ProjectConfiguration = {
    name: 'lib1',
    root: 'packages/lib1',
    sourceRoot: 'packages/lib1/src',
    projectType: 'library',
  };

  const targetFile = 'packages/lib1/src/lib/utils/helper.ts';
  const importerFile = 'packages/lib1/src/lib/features/auth/login.ts';
  const sourceFiles = [targetFile, importerFile];

  // Create target file
  tree.write(targetFile, 'export function helper() { return "hello"; }');

  // Create importer file with nested relative import
  tree.write(
    importerFile,
    "import { helper } from '../../utils/helper';\nexport const login = () => helper();",
  );

  const getProjectSourceFiles = jest.fn().mockReturnValue(sourceFiles);

  return { tree, project, targetFile, getProjectSourceFiles };
};

// Setup for 'large project' benchmark
const setupLargeProject = () => {
  const tree = createTreeWithEmptyWorkspace();
  const project: ProjectConfiguration = {
    name: 'lib1',
    root: 'packages/lib1',
    sourceRoot: 'packages/lib1/src',
    projectType: 'library',
  };

  const targetFile = 'packages/lib1/src/lib/utils/helper.ts';
  // Simulate a larger project with 100 files
  const sourceFiles = Array.from({ length: 100 }, (_, i) =>
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

  const getProjectSourceFiles = jest.fn().mockReturnValue(sourceFiles);

  return { tree, project, targetFile, getProjectSourceFiles };
};

// Pre-create test data outside the benchmark suite
const noImportsData = setupNoImports();
const withImportsData = setupWithImports();
const nestedPathsData = setupNestedPaths();
const largeProjectData = setupLargeProject();

benchmarkSuite('Validation Operations', {
  ['Check for relative imports - no imports']() {
    checkForRelativeImportsInProject(
      noImportsData.tree,
      noImportsData.project,
      noImportsData.targetFile,
      noImportsData.getProjectSourceFiles,
    );
  },

  ['Check for relative imports - with imports']() {
    checkForRelativeImportsInProject(
      withImportsData.tree,
      withImportsData.project,
      withImportsData.targetFile,
      withImportsData.getProjectSourceFiles,
    );
  },

  ['Check for relative imports - nested paths']() {
    checkForRelativeImportsInProject(
      nestedPathsData.tree,
      nestedPathsData.project,
      nestedPathsData.targetFile,
      nestedPathsData.getProjectSourceFiles,
    );
  },

  ['Check for relative imports - large project']() {
    checkForRelativeImportsInProject(
      largeProjectData.tree,
      largeProjectData.project,
      largeProjectData.targetFile,
      largeProjectData.getProjectSourceFiles,
    );
  },
});
