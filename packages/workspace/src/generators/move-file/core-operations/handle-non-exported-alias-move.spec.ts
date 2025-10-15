import { Tree, ProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { handleNonExportedAliasMove } from './handle-non-exported-alias-move';
import { updateImportPathsToPackageAlias } from '../import-updates/update-import-paths-to-package-alias';
import type { MoveContext } from '../types/move-context';

jest.mock('../import-updates/update-import-paths-to-package-alias');

describe('handleNonExportedAliasMove', () => {
  let tree: Tree;
  let mockGetProjectSourceFiles: jest.Mock;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    mockGetProjectSourceFiles = jest.fn();
    jest.clearAllMocks();
  });

  it('should call updateImportPathsToPackageAlias with correct parameters', () => {
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
      sourceImportPath: '@my/lib1',
      targetImportPath: '@my/lib2',
      hasImportsInTarget: false,
      isSameProject: false,
    };

    handleNonExportedAliasMove(tree, ctx, mockGetProjectSourceFiles);

    expect(updateImportPathsToPackageAlias).toHaveBeenCalledWith(
      tree,
      sourceProject,
      ctx.normalizedSource,
      '@my/lib2',
      [ctx.normalizedTarget],
      mockGetProjectSourceFiles,
    );
  });

  it('should do nothing when targetImportPath is null', () => {
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

    handleNonExportedAliasMove(tree, ctx, mockGetProjectSourceFiles);

    expect(updateImportPathsToPackageAlias).not.toHaveBeenCalled();
  });

  it('should exclude the moved file from updates', () => {
    const sourceProject: ProjectConfiguration = {
      root: 'libs/ui',
      sourceRoot: 'libs/ui/src',
      projectType: 'library',
    };

    const targetProject: ProjectConfiguration = {
      root: 'libs/shared',
      sourceRoot: 'libs/shared/src',
      projectType: 'library',
    };

    const ctx: MoveContext = {
      normalizedSource: 'libs/ui/src/lib/button.tsx',
      normalizedTarget: 'libs/shared/src/lib/button.tsx',
      sourceProject,
      sourceProjectName: 'ui',
      targetProject,
      targetProjectName: 'shared',
      fileContent: 'export const Button = () => {};',
      sourceRoot: 'libs/ui/src',
      relativeFilePathInSource: 'lib/button.tsx',
      isExported: false,
      sourceImportPath: '@org/ui',
      targetImportPath: '@org/shared',
      hasImportsInTarget: false,
      isSameProject: false,
    };

    handleNonExportedAliasMove(tree, ctx, mockGetProjectSourceFiles);

    expect(updateImportPathsToPackageAlias).toHaveBeenCalledWith(
      tree,
      sourceProject,
      ctx.normalizedSource,
      '@org/shared',
      [ctx.normalizedTarget], // Verify the moved file is excluded
      mockGetProjectSourceFiles,
    );
  });
});
