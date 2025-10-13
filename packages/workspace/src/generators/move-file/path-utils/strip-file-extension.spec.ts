import { stripFileExtension } from './strip-file-extension';

describe('stripFileExtension', () => {
  it('should strip .ts extension', () => {
    expect(stripFileExtension('file.ts')).toBe('file');
    expect(stripFileExtension('./path/to/file.ts')).toBe('./path/to/file');
  });

  it('should strip .tsx extension', () => {
    expect(stripFileExtension('component.tsx')).toBe('component');
  });

  it('should strip .js extension', () => {
    expect(stripFileExtension('file.js')).toBe('file');
  });

  it('should strip .jsx extension', () => {
    expect(stripFileExtension('component.jsx')).toBe('component');
  });

  it('should preserve .mjs extension (ESM)', () => {
    expect(stripFileExtension('file.mjs')).toBe('file.mjs');
  });

  it('should preserve .mts extension (ESM)', () => {
    expect(stripFileExtension('file.mts')).toBe('file.mts');
  });

  it('should preserve .cjs extension (CommonJS)', () => {
    expect(stripFileExtension('file.cjs')).toBe('file.cjs');
  });

  it('should preserve .cts extension (CommonJS)', () => {
    expect(stripFileExtension('file.cts')).toBe('file.cts');
  });

  it('should handle files without extension', () => {
    expect(stripFileExtension('file')).toBe('file');
  });

  it('should handle paths with multiple dots', () => {
    expect(stripFileExtension('file.spec.ts')).toBe('file.spec');
    expect(stripFileExtension('file.test.tsx')).toBe('file.test');
  });

  it('should handle relative paths', () => {
    expect(stripFileExtension('./file.ts')).toBe('./file');
    expect(stripFileExtension('../file.js')).toBe('../file');
    expect(stripFileExtension('../../file.tsx')).toBe('../../file');
  });

  it('should handle absolute paths', () => {
    expect(stripFileExtension('/packages/lib1/file.ts')).toBe(
      '/packages/lib1/file',
    );
  });

  it('should handle empty string', () => {
    expect(stripFileExtension('')).toBe('');
  });

  it('should handle files with only extension', () => {
    expect(stripFileExtension('.ts')).toBe('.ts');
    expect(stripFileExtension('.js')).toBe('.js');
  });

  it('should preserve other extensions', () => {
    expect(stripFileExtension('file.json')).toBe('file.json');
    expect(stripFileExtension('file.css')).toBe('file.css');
    expect(stripFileExtension('file.scss')).toBe('file.scss');
  });
});
