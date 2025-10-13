import { removeSourceFileExtension } from './remove-source-file-extension';

describe('removeSourceFileExtension', () => {
  it('should remove .ts extension', () => {
    expect(removeSourceFileExtension('file.ts')).toBe('file');
    expect(removeSourceFileExtension('path/to/file.ts')).toBe('path/to/file');
  });

  it('should remove .tsx extension', () => {
    expect(removeSourceFileExtension('component.tsx')).toBe('component');
  });

  it('should remove .js extension', () => {
    expect(removeSourceFileExtension('file.js')).toBe('file');
  });

  it('should remove .jsx extension', () => {
    expect(removeSourceFileExtension('component.jsx')).toBe('component');
  });

  it('should remove .mjs extension', () => {
    expect(removeSourceFileExtension('file.mjs')).toBe('file');
  });

  it('should remove .mts extension', () => {
    expect(removeSourceFileExtension('file.mts')).toBe('file');
  });

  it('should remove .cjs extension', () => {
    expect(removeSourceFileExtension('file.cjs')).toBe('file');
  });

  it('should remove .cts extension', () => {
    expect(removeSourceFileExtension('file.cts')).toBe('file');
  });

  it('should preserve unsupported extensions', () => {
    expect(removeSourceFileExtension('file.json')).toBe('file.json');
    expect(removeSourceFileExtension('file.css')).toBe('file.css');
    expect(removeSourceFileExtension('file.scss')).toBe('file.scss');
  });

  it('should handle files without extension', () => {
    expect(removeSourceFileExtension('file')).toBe('file');
  });

  it('should handle files with multiple dots', () => {
    expect(removeSourceFileExtension('file.spec.ts')).toBe('file.spec');
    expect(removeSourceFileExtension('file.test.tsx')).toBe('file.test');
  });

  it('should handle relative paths', () => {
    expect(removeSourceFileExtension('./file.ts')).toBe('./file');
    expect(removeSourceFileExtension('../file.js')).toBe('../file');
  });

  it('should handle absolute paths', () => {
    expect(removeSourceFileExtension('/packages/lib1/file.ts')).toBe(
      '/packages/lib1/file',
    );
  });

  it('should handle empty string', () => {
    expect(removeSourceFileExtension('')).toBe('');
  });

  it('should handle paths with only extension', () => {
    expect(removeSourceFileExtension('.ts')).toBe('.ts');
    expect(removeSourceFileExtension('.js')).toBe('.js');
  });

  it('should handle nested directory paths', () => {
    expect(removeSourceFileExtension('a/b/c/d/file.ts')).toBe('a/b/c/d/file');
  });
});
