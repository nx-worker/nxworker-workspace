import { getRelativeImportSpecifier } from './get-relative-import-specifier';

describe('getRelativeImportSpecifier', () => {
  it('should calculate relative path in same directory', () => {
    const result = getRelativeImportSpecifier(
      'packages/lib1/src/lib/a.ts',
      'packages/lib1/src/lib/b.ts',
    );
    expect(result).toBe('./b');
  });

  it('should calculate relative path to subdirectory', () => {
    const result = getRelativeImportSpecifier(
      'packages/lib1/src/lib/a.ts',
      'packages/lib1/src/lib/utils/b.ts',
    );
    expect(result).toBe('./utils/b');
  });

  it('should calculate relative path to parent directory', () => {
    const result = getRelativeImportSpecifier(
      'packages/lib1/src/lib/utils/a.ts',
      'packages/lib1/src/lib/b.ts',
    );
    expect(result).toBe('../b');
  });

  it('should calculate relative path across projects', () => {
    const result = getRelativeImportSpecifier(
      'packages/lib1/src/lib/a.ts',
      'packages/lib2/src/lib/b.ts',
    );
    expect(result).toBe('../../../lib2/src/lib/b');
  });

  it('should strip .ts extension', () => {
    const result = getRelativeImportSpecifier(
      'packages/lib1/src/lib/a.ts',
      'packages/lib1/src/lib/b.ts',
    );
    expect(result).not.toContain('.ts');
  });

  it('should strip .js extension', () => {
    const result = getRelativeImportSpecifier(
      'packages/lib1/src/lib/a.js',
      'packages/lib1/src/lib/b.js',
    );
    expect(result).not.toContain('.js');
  });

  it('should preserve .mjs extension (ESM)', () => {
    const result = getRelativeImportSpecifier(
      'packages/lib1/src/lib/a.mjs',
      'packages/lib1/src/lib/b.mjs',
    );
    expect(result).toContain('.mjs');
  });

  it('should add ./ prefix for same directory', () => {
    const result = getRelativeImportSpecifier(
      'packages/lib1/src/lib/a.ts',
      'packages/lib1/src/lib/b.ts',
    );
    expect(result).toMatch(/^\.\/|^\.\.\//);
  });

  it('should normalize path separators', () => {
    const result = getRelativeImportSpecifier(
      'packages/lib1/src/lib/a.ts',
      'packages/lib2/src/lib/b.ts',
    );
    expect(result).not.toContain('\\');
  });

  it('should handle deep nesting', () => {
    const result = getRelativeImportSpecifier(
      'packages/lib1/src/lib/a/b/c/d.ts',
      'packages/lib1/src/lib/x/y/z.ts',
    );
    expect(result).toBe('../../../x/y/z');
  });

  it('should handle paths with leading slash', () => {
    const result = getRelativeImportSpecifier(
      '/packages/lib1/src/lib/a.ts',
      '/packages/lib1/src/lib/b.ts',
    );
    expect(result).toBe('./b');
  });

  it('should handle index files', () => {
    const result = getRelativeImportSpecifier(
      'packages/lib1/src/lib/a.ts',
      'packages/lib1/src/index.ts',
    );
    expect(result).toBe('../index');
  });

  it('should handle files with dots in name', () => {
    const result = getRelativeImportSpecifier(
      'packages/lib1/src/lib/a.ts',
      'packages/lib1/src/lib/b.spec.ts',
    );
    expect(result).toBe('./b.spec');
  });
});
