import { Tree, ProjectConfiguration, ProjectGraph } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { handleExportedMove } from './handle-exported-move';
import { updateImportPathsInDependentProjects } from '../import-updates/update-import-paths-in-dependent-projects';
import { removeFileExport } from '../export-management/remove-file-export';
import { updateImportPathsToPackageAlias } from '../import-updates/update-import-paths-to-package-alias';
import type { MoveContext } from '../types/move-context';

jest.mock('../import-updates/update-import-paths-in-dependent-projects');
jest.mock('../export-management/remove-file-export');
jest.mock('../import-updates/update-import-paths-to-package-alias');

describe('handleExportedMove', () => {
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

  it('should update dependent projects when file is exported', async () => {
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

    projects.set('lib1', sourceProject);
    projects.set('lib2', targetProject);

    const mockProjectGraph: ProjectGraph = {
      nodes: {},
      dependencies: {},
    };

    mockGetProjectGraphAsync.mockResolvedValue(mockProjectGraph);

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

    await handleExportedMove(
      tree,
      mockGetProjectGraphAsync,
      projects,
      ctx,
      mockGetCachedDependentProjects,
      mockGetProjectSourceFiles,
      mockCachedTreeExists,
    );

    expect(mockGetProjectGraphAsync).toHaveBeenCalled();
    expect(updateImportPathsInDependentProjects).toHaveBeenCalledWith(
      tree,
      mockProjectGraph,
      projects,
      'lib1',
      '@my/lib1',
      '@my/lib2',
      {
        targetProjectName: 'lib2',
        targetRelativePath: 'lib/test.ts',
      },
      mockGetCachedDependentProjects,
      mockGetProjectSourceFiles,
    );
    expect(removeFileExport).toHaveBeenCalledWith(
      tree,
      sourceProject,
      'lib/test.ts',
      mockCachedTreeExists,
    );
    expect(updateImportPathsToPackageAlias).toHaveBeenCalledWith(
      tree,
      sourceProject,
      ctx.normalizedSource,
      '@my/lib2',
      [ctx.normalizedTarget],
      mockGetProjectSourceFiles,
    );
  });

  it('should do nothing when sourceImportPath is null', async () => {
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

    await handleExportedMove(
      tree,
      mockGetProjectGraphAsync,
      projects,
      ctx,
      mockGetCachedDependentProjects,
      mockGetProjectSourceFiles,
      mockCachedTreeExists,
    );

    expect(mockGetProjectGraphAsync).not.toHaveBeenCalled();
    expect(updateImportPathsInDependentProjects).not.toHaveBeenCalled();
  });

  it('should do nothing when targetImportPath is null', async () => {
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
      targetImportPath: null,
      hasImportsInTarget: false,
      isSameProject: false,
    };

    await handleExportedMove(
      tree,
      mockGetProjectGraphAsync,
      projects,
      ctx,
      mockGetCachedDependentProjects,
      mockGetProjectSourceFiles,
      mockCachedTreeExists,
    );

    expect(mockGetProjectGraphAsync).not.toHaveBeenCalled();
    expect(updateImportPathsInDependentProjects).not.toHaveBeenCalled();
  });

  it('should use project.root when sourceRoot is not available', async () => {
    const sourceProject: ProjectConfiguration = {
      root: 'packages/lib1',
      projectType: 'library',
    };

    const targetProject: ProjectConfiguration = {
      root: 'packages/lib2',
      projectType: 'library',
    };

    projects.set('lib1', sourceProject);
    projects.set('lib2', targetProject);

    const mockProjectGraph: ProjectGraph = {
      nodes: {},
      dependencies: {},
    };

    mockGetProjectGraphAsync.mockResolvedValue(mockProjectGraph);

    const ctx: MoveContext = {
      normalizedSource: 'packages/lib1/lib/test.ts',
      normalizedTarget: 'packages/lib2/lib/test.ts',
      sourceProject,
      sourceProjectName: 'lib1',
      targetProject,
      targetProjectName: 'lib2',
      fileContent: 'export const test = 1;',
      sourceRoot: 'packages/lib1',
      relativeFilePathInSource: 'lib/test.ts',
      isExported: true,
      sourceImportPath: '@my/lib1',
      targetImportPath: '@my/lib2',
      hasImportsInTarget: false,
      isSameProject: false,
    };

    await handleExportedMove(
      tree,
      mockGetProjectGraphAsync,
      projects,
      ctx,
      mockGetCachedDependentProjects,
      mockGetProjectSourceFiles,
      mockCachedTreeExists,
    );

    expect(updateImportPathsInDependentProjects).toHaveBeenCalledWith(
      tree,
      mockProjectGraph,
      projects,
      'lib1',
      '@my/lib1',
      '@my/lib2',
      {
        targetProjectName: 'lib2',
        targetRelativePath: 'lib/test.ts',
      },
      mockGetCachedDependentProjects,
      mockGetProjectSourceFiles,
    );
  });
});
