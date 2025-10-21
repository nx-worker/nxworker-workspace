import { Tree, ProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { checkForRelativeImportsInProject } from './check-for-relative-imports-in-project';
import { clearCache } from '../jscodeshift-utils';

describe('checkForRelativeImportsInProject', () => {
  let tree: Tree;
  let project: ProjectConfiguration;

  beforeEach(() => {
    clearCache(); // Clear AST cache between tests
    tree = createTreeWithEmptyWorkspace();
    project = {
      root: 'packages/lib1',
      sourceRoot: 'packages/lib1/src',
      name: 'lib1',
    };
  });

  it('should return true when a file has a relative import to the target file', () => {
    const targetFile = 'packages/lib1/src/lib/utils/helper.ts';
    const importerFile = 'packages/lib1/src/lib/main.ts';

    tree.write(targetFile, 'export function helper() {}');
    tree.write(importerFile, "import { helper } from './utils/helper';");

    const getProjectSourceFiles = jest
      .fn()
      .mockReturnValue([targetFile, importerFile]);

    const result = checkForRelativeImportsInProject(
      tree,
      project,
      targetFile,
      getProjectSourceFiles,
    );

    expect(result).toBe(true);
  });

  it('should return false when no files import the target file', () => {
    const targetFile = 'packages/lib1/src/lib/utils/helper.ts';
    const otherFile = 'packages/lib1/src/lib/main.ts';

    tree.write(targetFile, 'export function helper() {}');
    tree.write(otherFile, 'export function main() {}');

    const getProjectSourceFiles = jest
      .fn()
      .mockReturnValue([targetFile, otherFile]);

    const result = checkForRelativeImportsInProject(
      tree,
      project,
      targetFile,
      getProjectSourceFiles,
    );

    expect(result).toBe(false);
  });

  it('should return true for nested relative imports', () => {
    const targetFile = 'packages/lib1/src/lib/utils/helper.ts';
    const importerFile = 'packages/lib1/src/lib/features/auth/login.ts';

    tree.write(targetFile, 'export function helper() {}');
    tree.write(importerFile, "import { helper } from '../../utils/helper';");

    const getProjectSourceFiles = jest
      .fn()
      .mockReturnValue([targetFile, importerFile]);

    const result = checkForRelativeImportsInProject(
      tree,
      project,
      targetFile,
      getProjectSourceFiles,
    );

    expect(result).toBe(true);
  });

  it('should ignore imports to other files', () => {
    const targetFile = 'packages/lib1/src/lib/utils/helper.ts';
    const importerFile = 'packages/lib1/src/lib/main.ts';

    tree.write(targetFile, 'export function helper() {}');
    tree.write(importerFile, "import { other } from './utils/other';");

    const getProjectSourceFiles = jest
      .fn()
      .mockReturnValue([targetFile, importerFile]);

    const result = checkForRelativeImportsInProject(
      tree,
      project,
      targetFile,
      getProjectSourceFiles,
    );

    expect(result).toBe(false);
  });

  it('should handle files without extensions in import statements', () => {
    const targetFile = 'packages/lib1/src/lib/utils/helper.ts';
    const importerFile = 'packages/lib1/src/lib/main.ts';

    tree.write(targetFile, 'export function helper() {}');
    tree.write(importerFile, "import { helper } from './utils/helper';");

    const getProjectSourceFiles = jest
      .fn()
      .mockReturnValue([targetFile, importerFile]);

    const result = checkForRelativeImportsInProject(
      tree,
      project,
      targetFile,
      getProjectSourceFiles,
    );

    expect(result).toBe(true);
  });

  it('should detect export statements with relative imports', () => {
    const targetFile = 'packages/lib1/src/lib/utils/helper.ts';
    const indexFile = 'packages/lib1/src/index.ts';

    tree.write(targetFile, 'export function helper() {}');
    tree.write(indexFile, "export * from './lib/utils/helper';");

    const getProjectSourceFiles = jest
      .fn()
      .mockReturnValue([targetFile, indexFile]);

    const result = checkForRelativeImportsInProject(
      tree,
      project,
      targetFile,
      getProjectSourceFiles,
    );

    expect(result).toBe(true);
  });

  it('should detect dynamic imports', () => {
    const targetFile = 'packages/lib1/src/lib/utils/helper.ts';
    const importerFile = 'packages/lib1/src/lib/main.ts';

    tree.write(targetFile, 'export function helper() {}');
    tree.write(
      importerFile,
      "export const load = () => import('./utils/helper');",
    );

    const getProjectSourceFiles = jest
      .fn()
      .mockReturnValue([targetFile, importerFile]);

    const result = checkForRelativeImportsInProject(
      tree,
      project,
      targetFile,
      getProjectSourceFiles,
    );

    expect(result).toBe(true);
  });

  it('should skip the target file itself', () => {
    const targetFile = 'packages/lib1/src/lib/utils/helper.ts';

    // Target file imports itself (edge case)
    tree.write(targetFile, "import { helper } from './helper';");

    const getProjectSourceFiles = jest.fn().mockReturnValue([targetFile]);

    const result = checkForRelativeImportsInProject(
      tree,
      project,
      targetFile,
      getProjectSourceFiles,
    );

    expect(result).toBe(false);
  });

  it('should return false for non-relative imports', () => {
    const targetFile = 'packages/lib1/src/lib/utils/helper.ts';
    const importerFile = 'packages/lib1/src/lib/main.ts';

    tree.write(targetFile, 'export function helper() {}');
    tree.write(importerFile, "import { helper } from '@test/other-lib';");

    const getProjectSourceFiles = jest
      .fn()
      .mockReturnValue([targetFile, importerFile]);

    const result = checkForRelativeImportsInProject(
      tree,
      project,
      targetFile,
      getProjectSourceFiles,
    );

    expect(result).toBe(false);
  });

  it('should handle files with multiple imports', () => {
    const targetFile = 'packages/lib1/src/lib/utils/helper.ts';
    const importerFile = 'packages/lib1/src/lib/main.ts';

    tree.write(targetFile, 'export function helper() {}');
    tree.write(
      importerFile,
      "import { other } from './other';\nimport { helper } from './utils/helper';\nimport { third } from './third';",
    );

    const getProjectSourceFiles = jest
      .fn()
      .mockReturnValue([targetFile, importerFile]);

    const result = checkForRelativeImportsInProject(
      tree,
      project,
      targetFile,
      getProjectSourceFiles,
    );

    expect(result).toBe(true);
  });
});
