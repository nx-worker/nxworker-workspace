import { toFirstPath } from './to-first-path';

describe('toFirstPath', () => {
  it('should return the string when pathEntry is a string', () => {
    const result = toFirstPath('packages/lib1/src/index.ts');

    expect(result).toBe('packages/lib1/src/index.ts');
  });

  it('should return the first element when pathEntry is a string array', () => {
    const result = toFirstPath([
      'packages/lib1/src/index.ts',
      'packages/lib1/src/public-api.ts',
    ]);

    expect(result).toBe('packages/lib1/src/index.ts');
  });

  it('should return null when pathEntry is an empty array', () => {
    const result = toFirstPath([]);

    expect(result).toBeNull();
  });

  it('should return null when pathEntry is an array with non-string first element', () => {
    const result = toFirstPath([123, 'packages/lib1/src/index.ts']);

    expect(result).toBeNull();
  });

  it('should return null when pathEntry is null', () => {
    const result = toFirstPath(null);

    expect(result).toBeNull();
  });

  it('should return null when pathEntry is undefined', () => {
    const result = toFirstPath(undefined);

    expect(result).toBeNull();
  });

  it('should return null when pathEntry is a number', () => {
    const result = toFirstPath(123);

    expect(result).toBeNull();
  });

  it('should return null when pathEntry is an object', () => {
    const result = toFirstPath({ path: 'packages/lib1/src/index.ts' });

    expect(result).toBeNull();
  });

  it('should handle empty string', () => {
    const result = toFirstPath('');

    expect(result).toBe('');
  });

  it('should handle array with empty string as first element', () => {
    const result = toFirstPath(['', 'packages/lib1/src/index.ts']);

    expect(result).toBe('');
  });
});
