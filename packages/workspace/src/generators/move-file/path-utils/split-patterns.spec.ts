import { splitPatterns } from './split-patterns';

describe('splitPatterns', () => {
  it('should split simple comma-separated patterns', () => {
    const result = splitPatterns('file1.ts,file2.ts,file3.ts');
    expect(result).toEqual(['file1.ts', 'file2.ts', 'file3.ts']);
  });

  it('should preserve brace expansions', () => {
    const result = splitPatterns('file.{ts,js}');
    expect(result).toEqual(['file.{ts,js}']);
  });

  it('should split patterns with brace expansions', () => {
    const result = splitPatterns('file1.ts,file.{ts,js}');
    expect(result).toEqual(['file1.ts', 'file.{ts,js}']);
  });

  it('should handle nested braces', () => {
    const result = splitPatterns('file.{a,{b,c}},other.ts');
    expect(result).toEqual(['file.{a,{b,c}}', 'other.ts']);
  });

  it('should trim whitespace from patterns', () => {
    const result = splitPatterns('  file1.ts  ,  file2.ts  ');
    expect(result).toEqual(['file1.ts', 'file2.ts']);
  });

  it('should handle empty string', () => {
    const result = splitPatterns('');
    expect(result).toEqual([]);
  });

  it('should ignore empty patterns', () => {
    const result = splitPatterns('file1.ts,,file2.ts');
    expect(result).toEqual(['file1.ts', 'file2.ts']);
  });

  it('should handle single pattern without commas', () => {
    const result = splitPatterns('single-file.ts');
    expect(result).toEqual(['single-file.ts']);
  });

  it('should handle trailing comma', () => {
    const result = splitPatterns('file1.ts,file2.ts,');
    expect(result).toEqual(['file1.ts', 'file2.ts']);
  });

  it('should handle leading comma', () => {
    const result = splitPatterns(',file1.ts,file2.ts');
    expect(result).toEqual(['file1.ts', 'file2.ts']);
  });

  it('should handle multiple brace groups', () => {
    const result = splitPatterns('file.{a,b},other.{c,d}');
    expect(result).toEqual(['file.{a,b}', 'other.{c,d}']);
  });

  it('should handle complex nested braces', () => {
    const result = splitPatterns('src/{lib,app}/{index,main}.{ts,js}');
    expect(result).toEqual(['src/{lib,app}/{index,main}.{ts,js}']);
  });

  it('should handle whitespace inside braces', () => {
    const result = splitPatterns('file.{ts, js, jsx}');
    expect(result).toEqual(['file.{ts, js, jsx}']);
  });
});
