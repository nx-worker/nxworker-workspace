import { Tree, ProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { handleMoveStrategy } from './handle-move-strategy';
import { handleSameProjectMove } from './handle-same-project-move';
import { handleExportedMove } from './handle-exported-move';
import { handleNonExportedAliasMove } from './handle-non-exported-alias-move';
import { handleDefaultMove } from './handle-default-move';
import type { MoveContext } from '../types/move-context';

jest.mock('./handle-same-project-move');
jest.mock('./handle-exported-move');
jest.mock('./handle-non-exported-alias-move');
jest.mock('./handle-default-move');

describe('handleMoveStrategy', () => {
  let tree: Tree;
  let mockGetProjectGraphAsync: jest.Mock;
  let mockGetCachedDependentProjects: jest.Mock;
  let mockGetProjectSourceFiles: jest.Mock;
  let mockCachedTreeExists: jest.Mock;
  let projects: Map<string, ProjectConfiguration>;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    mockGetProjectGraphAsync = jest.fn();
    mockGetCachedDependentProjects = jest.fn();
    mockGetProjectSourceFiles = jest.fn();
    mockCachedTreeExists = jest.fn();
    projects = new Map();
    jest.clearAllMocks();
  });

  it('should call handleSameProjectMove for same-project moves', async () => {
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

    await handleMoveStrategy(
      tree,
      mockGetProjectGraphAsync,
      projects,
      ctx,
      mockGetCachedDependentProjects,
      mockGetProjectSourceFiles,
      mockCachedTreeExists,
    );

    expect(handleSameProjectMove).toHaveBeenCalledWith(
      tree,
      ctx,
      mockGetProjectSourceFiles,
    );
    expect(handleExportedMove).not.toHaveBeenCalled();
    expect(handleNonExportedAliasMove).not.toHaveBeenCalled();
    expect(handleDefaultMove).not.toHaveBeenCalled();
  });

  it('should call handleExportedMove for exported cross-project moves', async () => {
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
      isExported: true,
      sourceImportPath: '@my/lib1',
      targetImportPath: '@my/lib2',
      hasImportsInTarget: false,
      isSameProject: false,
    };

    await handleMoveStrategy(
      tree,
      mockGetProjectGraphAsync,
      projects,
      ctx,
      mockGetCachedDependentProjects,
      mockGetProjectSourceFiles,
      mockCachedTreeExists,
    );

    expect(handleExportedMove).toHaveBeenCalledWith(
      tree,
      mockGetProjectGraphAsync,
      projects,
      ctx,
      mockGetCachedDependentProjects,
      mockGetProjectSourceFiles,
      mockCachedTreeExists,
    );
    expect(handleSameProjectMove).not.toHaveBeenCalled();
    expect(handleNonExportedAliasMove).not.toHaveBeenCalled();
    expect(handleDefaultMove).not.toHaveBeenCalled();
  });

  it('should call handleNonExportedAliasMove for non-exported moves with target alias', async () => {
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

    await handleMoveStrategy(
      tree,
      mockGetProjectGraphAsync,
      projects,
      ctx,
      mockGetCachedDependentProjects,
      mockGetProjectSourceFiles,
      mockCachedTreeExists,
    );

    expect(handleNonExportedAliasMove).toHaveBeenCalledWith(
      tree,
      ctx,
      mockGetProjectSourceFiles,
    );
    expect(handleSameProjectMove).not.toHaveBeenCalled();
    expect(handleExportedMove).not.toHaveBeenCalled();
    expect(handleDefaultMove).not.toHaveBeenCalled();
  });

  it('should call handleDefaultMove as fallback', async () => {
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

    await handleMoveStrategy(
      tree,
      mockGetProjectGraphAsync,
      projects,
      ctx,
      mockGetCachedDependentProjects,
      mockGetProjectSourceFiles,
      mockCachedTreeExists,
    );

    expect(handleDefaultMove).toHaveBeenCalledWith(
      tree,
      ctx,
      mockGetProjectSourceFiles,
    );
    expect(handleSameProjectMove).not.toHaveBeenCalled();
    expect(handleExportedMove).not.toHaveBeenCalled();
    expect(handleNonExportedAliasMove).not.toHaveBeenCalled();
  });

  it('should not call exported move when sourceImportPath is missing', async () => {
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
      isExported: true,
      sourceImportPath: null,
      targetImportPath: '@my/lib2',
      hasImportsInTarget: false,
      isSameProject: false,
    };

    await handleMoveStrategy(
      tree,
      mockGetProjectGraphAsync,
      projects,
      ctx,
      mockGetCachedDependentProjects,
      mockGetProjectSourceFiles,
      mockCachedTreeExists,
    );

    expect(handleNonExportedAliasMove).toHaveBeenCalled();
    expect(handleExportedMove).not.toHaveBeenCalled();
  });
});
