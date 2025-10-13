import { buildPatterns } from './build-patterns';

describe('buildPatterns', () => {
  it('should combine prefixes with file names', () => {
    const result = buildPatterns(['src/', 'lib/'], ['index.ts', 'main.js']);
    expect(result).toContain('src/index.ts');
    expect(result).toContain('src/main.js');
    expect(result).toContain('lib/index.ts');
    expect(result).toContain('lib/main.js');
    expect(result).toHaveLength(4);
  });

  it('should handle single prefix and multiple files', () => {
    const result = buildPatterns(['packages/'], ['app.ts', 'lib.ts']);
    expect(result).toEqual(['packages/app.ts', 'packages/lib.ts']);
  });

  it('should handle multiple prefixes and single file', () => {
    const result = buildPatterns(['src/', 'dist/', 'build/'], ['index.ts']);
    expect(result).toEqual(['src/index.ts', 'dist/index.ts', 'build/index.ts']);
  });

  it('should return empty array when prefixes are empty', () => {
    const result = buildPatterns([], ['file.ts']);
    expect(result).toEqual([]);
  });

  it('should return empty array when fileNames are empty', () => {
    const result = buildPatterns(['src/'], []);
    expect(result).toEqual([]);
  });

  it('should handle empty prefixes correctly', () => {
    const result = buildPatterns(['', 'lib/'], ['index.ts']);
    expect(result).toEqual(['index.ts', 'lib/index.ts']);
  });

  it('should preserve path separators in prefixes', () => {
    const result = buildPatterns(
      ['packages/lib1/', 'packages/lib2/'],
      ['index.ts'],
    );
    expect(result).toEqual([
      'packages/lib1/index.ts',
      'packages/lib2/index.ts',
    ]);
  });

  it('should handle special characters in file names', () => {
    const result = buildPatterns(
      ['src/'],
      ['file-name.spec.ts', 'app.config.js'],
    );
    expect(result).toContain('src/file-name.spec.ts');
    expect(result).toContain('src/app.config.js');
  });
});
