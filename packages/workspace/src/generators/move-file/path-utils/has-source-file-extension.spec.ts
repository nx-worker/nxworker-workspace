import { hasSourceFileExtension } from './has-source-file-extension';

describe('hasSourceFileExtension', () => {
  it('should return true for .ts files', () => {
    expect(hasSourceFileExtension('file.ts')).toBe(true);
    expect(hasSourceFileExtension('path/to/file.ts')).toBe(true);
  });

  it('should return true for .tsx files', () => {
    expect(hasSourceFileExtension('component.tsx')).toBe(true);
  });

  it('should return true for .js files', () => {
    expect(hasSourceFileExtension('file.js')).toBe(true);
  });

  it('should return true for .jsx files', () => {
    expect(hasSourceFileExtension('component.jsx')).toBe(true);
  });

  it('should return true for .mjs files', () => {
    expect(hasSourceFileExtension('file.mjs')).toBe(true);
  });

  it('should return true for .mts files', () => {
    expect(hasSourceFileExtension('file.mts')).toBe(true);
  });

  it('should return true for .cjs files', () => {
    expect(hasSourceFileExtension('file.cjs')).toBe(true);
  });

  it('should return true for .cts files', () => {
    expect(hasSourceFileExtension('file.cts')).toBe(true);
  });

  it('should return false for unsupported extensions', () => {
    expect(hasSourceFileExtension('file.json')).toBe(false);
    expect(hasSourceFileExtension('file.css')).toBe(false);
    expect(hasSourceFileExtension('file.scss')).toBe(false);
    expect(hasSourceFileExtension('file.html')).toBe(false);
  });

  it('should return false for files without extension', () => {
    expect(hasSourceFileExtension('file')).toBe(false);
  });

  it('should handle files with multiple dots', () => {
    expect(hasSourceFileExtension('file.spec.ts')).toBe(true);
    expect(hasSourceFileExtension('file.test.tsx')).toBe(true);
    expect(hasSourceFileExtension('file.config.js')).toBe(true);
  });

  it('should handle relative paths', () => {
    expect(hasSourceFileExtension('./file.ts')).toBe(true);
    expect(hasSourceFileExtension('../file.js')).toBe(true);
  });

  it('should handle absolute paths', () => {
    expect(hasSourceFileExtension('/packages/lib1/file.ts')).toBe(true);
  });

  it('should handle empty string', () => {
    expect(hasSourceFileExtension('')).toBe(false);
  });

  it('should be case-sensitive', () => {
    // Extensions in sourceFileExtensions are lowercase
    expect(hasSourceFileExtension('file.TS')).toBe(false);
    expect(hasSourceFileExtension('file.JS')).toBe(false);
  });
});
