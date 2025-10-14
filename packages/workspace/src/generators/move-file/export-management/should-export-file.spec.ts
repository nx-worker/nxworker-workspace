import { shouldExportFile } from './should-export-file';
import type { MoveContext } from '../types/move-context';
import type { MoveFileGeneratorSchema } from '../schema';

describe('shouldExportFile', () => {
  const createMockContext = (overrides = {}): MoveContext =>
    ({
      isSameProject: false,
      isExported: false,
      hasImportsInTarget: false,
      ...overrides,
    }) as MoveContext;

  const createMockOptions = (overrides = {}): MoveFileGeneratorSchema =>
    ({
      skipExport: false,
      ...overrides,
    }) as MoveFileGeneratorSchema;

  it('should return false when skipExport is true', () => {
    const ctx = createMockContext({ isExported: true, hasImportsInTarget: true });
    const options = createMockOptions({ skipExport: true });
    expect(shouldExportFile(ctx, options)).toBe(false);
  });

  it('should maintain export status for same-project moves when exported', () => {
    const ctx = createMockContext({ isSameProject: true, isExported: true });
    const options = createMockOptions();
    expect(shouldExportFile(ctx, options)).toBe(true);
  });

  it('should maintain export status for same-project moves when not exported', () => {
    const ctx = createMockContext({ isSameProject: true, isExported: false });
    const options = createMockOptions();
    expect(shouldExportFile(ctx, options)).toBe(false);
  });

  it('should export if file was exported for cross-project moves', () => {
    const ctx = createMockContext({
      isSameProject: false,
      isExported: true,
      hasImportsInTarget: false,
    });
    const options = createMockOptions();
    expect(shouldExportFile(ctx, options)).toBe(true);
  });

  it('should export if target has imports for cross-project moves', () => {
    const ctx = createMockContext({
      isSameProject: false,
      isExported: false,
      hasImportsInTarget: true,
    });
    const options = createMockOptions();
    expect(shouldExportFile(ctx, options)).toBe(true);
  });

  it('should export if file was exported AND target has imports', () => {
    const ctx = createMockContext({
      isSameProject: false,
      isExported: true,
      hasImportsInTarget: true,
    });
    const options = createMockOptions();
    expect(shouldExportFile(ctx, options)).toBe(true);
  });

  it('should not export if file was not exported and no target imports for cross-project', () => {
    const ctx = createMockContext({
      isSameProject: false,
      isExported: false,
      hasImportsInTarget: false,
    });
    const options = createMockOptions();
    expect(shouldExportFile(ctx, options)).toBe(false);
  });

  it('should respect skipExport even when conditions suggest export', () => {
    const ctx = createMockContext({
      isSameProject: false,
      isExported: true,
      hasImportsInTarget: true,
    });
    const options = createMockOptions({ skipExport: true });
    expect(shouldExportFile(ctx, options)).toBe(false);
  });
});
