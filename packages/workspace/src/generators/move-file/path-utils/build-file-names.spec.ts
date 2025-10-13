import { buildFileNames } from './build-file-names';

describe('buildFileNames', () => {
  it('should build file names with all entry point extensions', () => {
    const result = buildFileNames(['index']);
    expect(result).toContain('index.ts');
    expect(result).toContain('index.js');
    expect(result).toContain('index.mjs');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle multiple base names', () => {
    const result = buildFileNames(['index', 'main']);
    expect(result).toContain('index.ts');
    expect(result).toContain('index.js');
    expect(result).toContain('main.ts');
    expect(result).toContain('main.js');
  });

  it('should return empty array for empty input', () => {
    const result = buildFileNames([]);
    expect(result).toEqual([]);
  });

  it('should preserve base name exactly', () => {
    const result = buildFileNames(['my-custom-name']);
    expect(result.some((name) => name.startsWith('my-custom-name.'))).toBe(
      true,
    );
  });

  it('should handle base names with special characters', () => {
    const result = buildFileNames(['index-v2', 'app.config']);
    expect(result.some((name) => name.startsWith('index-v2.'))).toBe(true);
    expect(result.some((name) => name.startsWith('app.config.'))).toBe(true);
  });
});
