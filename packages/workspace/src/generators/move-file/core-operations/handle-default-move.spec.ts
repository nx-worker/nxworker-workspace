import { Tree, ProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { handleDefaultMove } from './handle-default-move';
import { updateImportPathsInProject } from '../import-updates/update-import-paths-in-project';
import type { MoveContext } from '../types/move-context';

jest.mock('../import-updates/update-import-paths-in-project');

describe('handleDefaultMove', () => {
  let tree: Tree;
  let mockGetProjectSourceFiles: jest.Mock;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    mockGetProjectSourceFiles = jest.fn();
    jest.clearAllMocks();
  });

  it('should call updateImportPathsInProject with correct parameters', () => {
    const sourceProject: ProjectConfiguration = {
      root: 'packages/lib1',
      sourceRoot: 'packages/lib1/src',
      projectType: 'library',
    };

    const targetProject: ProjectConfiguration = {
      root: 'packages/lib2',
      sourceRoot: 'packages/lib2/src',
      projectType: 'library',
    };

    const ctx: MoveContext = {
      normalizedSource: 'packages/lib1/src/lib/test.ts',
      normalizedTarget: 'packages/lib2/src/lib/test.ts',
      sourceProject,
      sourceProjectName: 'lib1',
      targetProject,
      targetProjectName: 'lib2',
      fileContent: 'export const test = 1;',
      sourceRoot: 'packages/lib1/src',
      relativeFilePathInSource: 'lib/test.ts',
      isExported: false,
      sourceImportPath: null,
      targetImportPath: null,
      hasImportsInTarget: false,
      isSameProject: false,
    };

    handleDefaultMove(tree, ctx, mockGetProjectSourceFiles);

    expect(updateImportPathsInProject).toHaveBeenCalledWith(
      tree,
      sourceProject,
      ctx.normalizedSource,
      ctx.normalizedTarget,
      mockGetProjectSourceFiles,
    );
  });

  it('should handle cross-project move without aliases', () => {
    const sourceProject: ProjectConfiguration = {
      root: 'libs/feature-a',
      sourceRoot: 'libs/feature-a/src',
      projectType: 'library',
    };

    const targetProject: ProjectConfiguration = {
      root: 'libs/feature-b',
      sourceRoot: 'libs/feature-b/src',
      projectType: 'library',
    };

    const ctx: MoveContext = {
      normalizedSource: 'libs/feature-a/src/lib/utils.ts',
      normalizedTarget: 'libs/feature-b/src/lib/utils.ts',
      sourceProject,
      sourceProjectName: 'feature-a',
      targetProject,
      targetProjectName: 'feature-b',
      fileContent: 'export function helper() {}',
      sourceRoot: 'libs/feature-a/src',
      relativeFilePathInSource: 'lib/utils.ts',
      isExported: false,
      sourceImportPath: null,
      targetImportPath: null,
      hasImportsInTarget: false,
      isSameProject: false,
    };

    handleDefaultMove(tree, ctx, mockGetProjectSourceFiles);

    expect(updateImportPathsInProject).toHaveBeenCalledWith(
      tree,
      sourceProject,
      ctx.normalizedSource,
      ctx.normalizedTarget,
      mockGetProjectSourceFiles,
    );
  });
});
