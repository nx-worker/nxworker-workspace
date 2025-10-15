import { Tree, ProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { executeMove } from './execute-move';
import { createTargetFile } from './create-target-file';
import { handleMoveStrategy } from './handle-move-strategy';
import { finalizeMove } from './finalize-move';
import { updateMovedFileImportsIfNeeded } from '../import-updates/update-moved-file-imports-if-needed';
import { updateTargetProjectImportsIfNeeded } from '../import-updates/update-target-project-imports-if-needed';
import { ensureExportIfNeeded } from '../export-management/ensure-export-if-needed';
import type { MoveContext } from '../types/move-context';

jest.mock('./create-target-file');
jest.mock('./handle-move-strategy');
jest.mock('./finalize-move');
jest.mock('../import-updates/update-moved-file-imports-if-needed');
jest.mock('../import-updates/update-target-project-imports-if-needed');
jest.mock('../export-management/ensure-export-if-needed');

describe('executeMove', () => {
  let tree: Tree;
  let projects: Map<string, ProjectConfiguration>;
  let mockGetProjectGraphAsync: jest.Mock;
  let mockCachedTreeExists: jest.Mock;
  let mockUpdateProjectSourceFilesCache: jest.Mock;
  let mockUpdateFileExistenceCache: jest.Mock;
  let mockGetProjectSourceFiles: jest.Mock;
  let mockGetCachedDependentProjects: jest.Mock;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    projects = new Map();
    mockGetProjectGraphAsync = jest.fn();
    mockCachedTreeExists = jest.fn();
    mockUpdateProjectSourceFilesCache = jest.fn();
    mockUpdateFileExistenceCache = jest.fn();
    mockGetProjectSourceFiles = jest.fn();
    mockGetCachedDependentProjects = jest.fn();

    // Setup test projects
    const lib1: ProjectConfiguration = {
      root: 'packages/lib1',
      sourceRoot: 'packages/lib1/src',
      projectType: 'library',
    };
    const lib2: ProjectConfiguration = {
      root: 'packages/lib2',
      sourceRoot: 'packages/lib2/src',
      projectType: 'library',
    };
    projects.set('lib1', lib1);
    projects.set('lib2', lib2);

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('move orchestration', () => {
    it('should execute all move steps in correct order', async () => {
      const lib1 = projects.get('lib1');
      const lib2 = projects.get('lib2');
      if (!lib1 || !lib2) {
        throw new Error('Projects not set up correctly');
      }

      const ctx: MoveContext = {
        normalizedSource: 'packages/lib1/src/lib/test.ts',
        normalizedTarget: 'packages/lib2/src/lib/test.ts',
        sourceProject: lib1,
        sourceProjectName: 'lib1',
        targetProject: lib2,
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

      await executeMove(
        tree,
        { file: ctx.normalizedSource, project: 'lib2' },
        projects,
        mockGetProjectGraphAsync,
        ctx,
        mockCachedTreeExists,
        mockUpdateProjectSourceFilesCache,
        mockUpdateFileExistenceCache,
        mockGetProjectSourceFiles,
        mockGetCachedDependentProjects,
        false,
      );

      // Verify order of operations
      expect(createTargetFile).toHaveBeenCalledWith(
        tree,
        ctx.normalizedTarget,
        ctx.fileContent,
        mockUpdateFileExistenceCache,
      );
      expect(mockUpdateProjectSourceFilesCache).toHaveBeenCalledTimes(2);
      expect(updateMovedFileImportsIfNeeded).toHaveBeenCalledWith(
        tree,
        ctx,
        mockCachedTreeExists,
      );
      expect(handleMoveStrategy).toHaveBeenCalledWith(
        tree,
        mockGetProjectGraphAsync,
        projects,
        ctx,
        mockGetCachedDependentProjects,
        mockGetProjectSourceFiles,
        mockCachedTreeExists,
      );
      expect(updateTargetProjectImportsIfNeeded).toHaveBeenCalledWith(
        tree,
        ctx,
        ctx.sourceImportPath,
        mockGetProjectSourceFiles,
      );
      expect(ensureExportIfNeeded).toHaveBeenCalledWith(
        tree,
        ctx,
        expect.any(Object),
        mockCachedTreeExists,
      );
      expect(finalizeMove).toHaveBeenCalledWith(
        tree,
        ctx.normalizedSource,
        expect.any(Object),
      );
    });

    it('should skip finalization when requested', async () => {
      const lib1 = projects.get('lib1');
      const lib2 = projects.get('lib2');
      if (!lib1 || !lib2) {
        throw new Error('Projects not set up correctly');
      }

      const ctx: MoveContext = {
        normalizedSource: 'packages/lib1/src/lib/test.ts',
        normalizedTarget: 'packages/lib2/src/lib/test.ts',
        sourceProject: lib1,
        sourceProjectName: 'lib1',
        targetProject: lib2,
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

      await executeMove(
        tree,
        { file: ctx.normalizedSource, project: 'lib2' },
        projects,
        mockGetProjectGraphAsync,
        ctx,
        mockCachedTreeExists,
        mockUpdateProjectSourceFilesCache,
        mockUpdateFileExistenceCache,
        mockGetProjectSourceFiles,
        mockGetCachedDependentProjects,
        true, // skipFinalization = true
      );

      expect(finalizeMove).not.toHaveBeenCalled();
    });

    it('should use normalizedSource as sourceIdentifier when sourceImportPath is null', async () => {
      const lib1 = projects.get('lib1');
      const lib2 = projects.get('lib2');
      if (!lib1 || !lib2) {
        throw new Error('Projects not set up correctly');
      }

      const ctx: MoveContext = {
        normalizedSource: 'packages/lib1/src/lib/test.ts',
        normalizedTarget: 'packages/lib2/src/lib/test.ts',
        sourceProject: lib1,
        sourceProjectName: 'lib1',
        targetProject: lib2,
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

      await executeMove(
        tree,
        { file: ctx.normalizedSource, project: 'lib2' },
        projects,
        mockGetProjectGraphAsync,
        ctx,
        mockCachedTreeExists,
        mockUpdateProjectSourceFilesCache,
        mockUpdateFileExistenceCache,
        mockGetProjectSourceFiles,
        mockGetCachedDependentProjects,
        true,
      );

      expect(updateTargetProjectImportsIfNeeded).toHaveBeenCalledWith(
        tree,
        ctx,
        ctx.normalizedSource,
        mockGetProjectSourceFiles,
      );
    });
  });

  describe('cache updates', () => {
    it('should update cache for cross-project move', async () => {
      const lib1 = projects.get('lib1');
      const lib2 = projects.get('lib2');
      if (!lib1 || !lib2) {
        throw new Error('Projects not set up correctly');
      }

      const ctx: MoveContext = {
        normalizedSource: 'packages/lib1/src/lib/test.ts',
        normalizedTarget: 'packages/lib2/src/lib/test.ts',
        sourceProject: lib1,
        sourceProjectName: 'lib1',
        targetProject: lib2,
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

      await executeMove(
        tree,
        { file: ctx.normalizedSource, project: 'lib2' },
        projects,
        mockGetProjectGraphAsync,
        ctx,
        mockCachedTreeExists,
        mockUpdateProjectSourceFilesCache,
        mockUpdateFileExistenceCache,
        mockGetProjectSourceFiles,
        mockGetCachedDependentProjects,
        true,
      );

      // Source project cache updated with null (file removed)
      expect(mockUpdateProjectSourceFilesCache).toHaveBeenCalledWith(
        'packages/lib1',
        ctx.normalizedSource,
        null,
      );

      // Target project cache updated with new file
      expect(mockUpdateProjectSourceFilesCache).toHaveBeenCalledWith(
        'packages/lib2',
        '',
        ctx.normalizedTarget,
      );
    });

    it('should update cache for same-project move', async () => {
      const lib1 = projects.get('lib1');
      if (!lib1) {
        throw new Error('Projects not set up correctly');
      }

      const ctx: MoveContext = {
        normalizedSource: 'packages/lib1/src/lib/test.ts',
        normalizedTarget: 'packages/lib1/src/utils/test.ts',
        sourceProject: lib1,
        sourceProjectName: 'lib1',
        targetProject: lib1,
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

      await executeMove(
        tree,
        { file: ctx.normalizedSource, project: 'lib1' },
        projects,
        mockGetProjectGraphAsync,
        ctx,
        mockCachedTreeExists,
        mockUpdateProjectSourceFilesCache,
        mockUpdateFileExistenceCache,
        mockGetProjectSourceFiles,
        mockGetCachedDependentProjects,
        true,
      );

      // Same project cache updated with new path
      expect(mockUpdateProjectSourceFilesCache).toHaveBeenCalledWith(
        'packages/lib1',
        ctx.normalizedSource,
        ctx.normalizedTarget,
      );
    });

    it('should only update source cache when projects are the same', async () => {
      const lib1 = projects.get('lib1');
      if (!lib1) {
        throw new Error('Projects not set up correctly');
      }

      const ctx: MoveContext = {
        normalizedSource: 'packages/lib1/src/lib/test.ts',
        normalizedTarget: 'packages/lib1/src/utils/test.ts',
        sourceProject: lib1,
        sourceProjectName: 'lib1',
        targetProject: lib1,
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

      await executeMove(
        tree,
        { file: ctx.normalizedSource, project: 'lib1' },
        projects,
        mockGetProjectGraphAsync,
        ctx,
        mockCachedTreeExists,
        mockUpdateProjectSourceFilesCache,
        mockUpdateFileExistenceCache,
        mockGetProjectSourceFiles,
        mockGetCachedDependentProjects,
        true,
      );

      // Only one call for same project
      expect(mockUpdateProjectSourceFilesCache).toHaveBeenCalledTimes(1);
    });
  });
});
