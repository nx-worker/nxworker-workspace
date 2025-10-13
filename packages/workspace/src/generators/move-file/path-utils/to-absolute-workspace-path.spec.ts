import { toAbsoluteWorkspacePath } from './to-absolute-workspace-path';

describe('toAbsoluteWorkspacePath', () => {
  it('should add leading slash to relative path', () => {
    const result = toAbsoluteWorkspacePath('packages/lib1/src/file.ts');
    expect(result).toBe('/packages/lib1/src/file.ts');
  });

  it('should normalize path separators', () => {
    const result = toAbsoluteWorkspacePath('packages/lib1/src/file.ts');
    expect(result).not.toContain('\\');
    expect(result).toContain('/');
  });

  it('should handle path with leading slash', () => {
    const result = toAbsoluteWorkspacePath('/packages/lib1/src/file.ts');
    expect(result).toBe('/packages/lib1/src/file.ts');
  });

  it('should handle simple file name', () => {
    const result = toAbsoluteWorkspacePath('file.ts');
    expect(result).toBe('/file.ts');
  });

  it('should handle nested directory structure', () => {
    const result = toAbsoluteWorkspacePath('a/b/c/d/e/file.ts');
    expect(result).toBe('/a/b/c/d/e/file.ts');
  });

  it('should handle empty string', () => {
    const result = toAbsoluteWorkspacePath('');
    expect(result).toBe('/');
  });

  it('should normalize double slashes', () => {
    const result = toAbsoluteWorkspacePath('packages//lib1//src//file.ts');
    expect(result).not.toContain('//');
  });

  it('should handle paths with dots', () => {
    const result = toAbsoluteWorkspacePath('packages/lib1/src/file.spec.ts');
    expect(result).toBe('/packages/lib1/src/file.spec.ts');
  });

  it('should handle paths with special characters', () => {
    const result = toAbsoluteWorkspacePath('packages/lib-1/src/file_name.ts');
    expect(result).toBe('/packages/lib-1/src/file_name.ts');
  });
});
