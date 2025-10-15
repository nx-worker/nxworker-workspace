import { Tree, ProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { handleSameProjectMove } from './handle-same-project-move';
import { updateImportPathsInProject } from '../import-updates/update-import-paths-in-project';
import type { MoveContext } from '../types/move-context';

jest.mock('../import-updates/update-import-paths-in-project');

describe('handleSameProjectMove', () => {
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

    const ctx: MoveContext = {
      normalizedSource: 'packages/lib1/src/lib/test.ts',
      normalizedTarget: 'packages/lib1/src/utils/test.ts',
      sourceProject,
      sourceProjectName: 'lib1',
      targetProject: sourceProject,
      targetProjectName: 'lib1',
      fileContent: 'export const test = 1;',
      sourceRoot: 'packages/lib1/src',
      relativeFilePathInSource: 'lib/test.ts',
      isExported: false,
      sourceImportPath: null,
      targetImportPath: null,
      hasImportsInTarget: false,
      isSameProject: true,
    };

    handleSameProjectMove(tree, ctx, mockGetProjectSourceFiles);

    expect(updateImportPathsInProject).toHaveBeenCalledWith(
      tree,
      sourceProject,
      ctx.normalizedSource,
      ctx.normalizedTarget,
      mockGetProjectSourceFiles,
    );
  });

  it('should handle same-project move with different directory structure', () => {
    const sourceProject: ProjectConfiguration = {
      root: 'libs/my-lib',
      sourceRoot: 'libs/my-lib/src',
      projectType: 'library',
    };

    const ctx: MoveContext = {
      normalizedSource: 'libs/my-lib/src/lib/old-location/file.ts',
      normalizedTarget: 'libs/my-lib/src/lib/new-location/file.ts',
      sourceProject,
      sourceProjectName: 'my-lib',
      targetProject: sourceProject,
      targetProjectName: 'my-lib',
      fileContent: 'export const test = 1;',
      sourceRoot: 'libs/my-lib/src',
      relativeFilePathInSource: 'lib/old-location/file.ts',
      isExported: false,
      sourceImportPath: null,
      targetImportPath: null,
      hasImportsInTarget: false,
      isSameProject: true,
    };

    handleSameProjectMove(tree, ctx, mockGetProjectSourceFiles);

    expect(updateImportPathsInProject).toHaveBeenCalledWith(
      tree,
      sourceProject,
      ctx.normalizedSource,
      ctx.normalizedTarget,
      mockGetProjectSourceFiles,
    );
  });
});
