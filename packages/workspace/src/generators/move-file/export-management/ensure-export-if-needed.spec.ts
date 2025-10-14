import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { ensureExportIfNeeded } from './ensure-export-if-needed';
import { shouldExportFile } from './should-export-file';
import { ensureFileExported } from './ensure-file-exported';
import type { MoveContext } from '../types/move-context';
import type { MoveFileGeneratorSchema } from '../schema';
import type { ProjectConfiguration } from '@nx/devkit';

jest.mock('./should-export-file');
jest.mock('./ensure-file-exported');

describe('ensureExportIfNeeded', () => {
  let tree: Tree;
  const mockShouldExportFile = shouldExportFile as jest.MockedFunction<
    typeof shouldExportFile
  >;
  const mockEnsureFileExported = ensureFileExported as jest.MockedFunction<
    typeof ensureFileExported
  >;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    jest.clearAllMocks();
  });

  it('should call ensureFileExported when conditions are met', () => {
    const targetProject: ProjectConfiguration = {
      root: 'libs/mylib',
      sourceRoot: 'libs/mylib/src',
      name: 'mylib',
    };

    const ctx: MoveContext = {
      targetImportPath: '@test/mylib',
      targetProject,
      normalizedTarget: 'libs/mylib/src/lib/utils.ts',
    } as MoveContext;

    const options: MoveFileGeneratorSchema = {
      skipExport: false,
    } as MoveFileGeneratorSchema;

    const cachedTreeExists = jest.fn();
    mockShouldExportFile.mockReturnValue(true);

    ensureExportIfNeeded(tree, ctx, options, cachedTreeExists);

    expect(mockShouldExportFile).toHaveBeenCalledWith(ctx, options);
    expect(mockEnsureFileExported).toHaveBeenCalledWith(
      tree,
      targetProject,
      'lib/utils.ts',
      cachedTreeExists,
    );
  });

  it('should skip when targetImportPath is missing', () => {
    const ctx: MoveContext = {
      targetImportPath: undefined,
    } as MoveContext;

    const options: MoveFileGeneratorSchema = {} as MoveFileGeneratorSchema;
    const cachedTreeExists = jest.fn();

    ensureExportIfNeeded(tree, ctx, options, cachedTreeExists);

    expect(mockShouldExportFile).not.toHaveBeenCalled();
    expect(mockEnsureFileExported).not.toHaveBeenCalled();
  });

  it('should skip when shouldExportFile returns false', () => {
    const targetProject: ProjectConfiguration = {
      root: 'libs/mylib',
      sourceRoot: 'libs/mylib/src',
      name: 'mylib',
    };

    const ctx: MoveContext = {
      targetImportPath: '@test/mylib',
      targetProject,
      normalizedTarget: 'libs/mylib/src/lib/utils.ts',
    } as MoveContext;

    const options: MoveFileGeneratorSchema = {
      skipExport: true,
    } as MoveFileGeneratorSchema;

    const cachedTreeExists = jest.fn();
    mockShouldExportFile.mockReturnValue(false);

    ensureExportIfNeeded(tree, ctx, options, cachedTreeExists);

    expect(mockShouldExportFile).toHaveBeenCalledWith(ctx, options);
    expect(mockEnsureFileExported).not.toHaveBeenCalled();
  });

  it('should calculate correct relative path using sourceRoot', () => {
    const targetProject: ProjectConfiguration = {
      root: 'libs/mylib',
      sourceRoot: 'libs/mylib/src',
      name: 'mylib',
    };

    const ctx: MoveContext = {
      targetImportPath: '@test/mylib',
      targetProject,
      normalizedTarget: 'libs/mylib/src/lib/utils.ts',
    } as MoveContext;

    const options: MoveFileGeneratorSchema = {} as MoveFileGeneratorSchema;
    const cachedTreeExists = jest.fn();

    mockShouldExportFile.mockReturnValue(true);

    ensureExportIfNeeded(tree, ctx, options, cachedTreeExists);

    expect(mockEnsureFileExported).toHaveBeenCalledWith(
      tree,
      targetProject,
      'lib/utils.ts',
      cachedTreeExists,
    );
  });

  it('should calculate correct relative path using root when sourceRoot is missing', () => {
    const targetProject: ProjectConfiguration = {
      root: 'libs/mylib',
      name: 'mylib',
    };

    const ctx: MoveContext = {
      targetImportPath: '@test/mylib',
      targetProject,
      normalizedTarget: 'libs/mylib/lib/utils.ts',
    } as MoveContext;

    const options: MoveFileGeneratorSchema = {} as MoveFileGeneratorSchema;
    const cachedTreeExists = jest.fn();

    mockShouldExportFile.mockReturnValue(true);

    ensureExportIfNeeded(tree, ctx, options, cachedTreeExists);

    expect(mockEnsureFileExported).toHaveBeenCalledWith(
      tree,
      targetProject,
      'lib/utils.ts',
      cachedTreeExists,
    );
  });
});
