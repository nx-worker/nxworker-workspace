import { isWildcardAlias } from './is-wildcard-alias';

describe('isWildcardAlias', () => {
  it('should return true when both alias and path contain wildcards', () => {
    const result = isWildcardAlias('@myorg/*', 'packages/*/src/index.ts');

    expect(result).toBe(true);
  });

  it('should return false when only alias contains wildcard', () => {
    const result = isWildcardAlias('@myorg/*', 'packages/lib1/src/index.ts');

    expect(result).toBe(false);
  });

  it('should return false when only path contains wildcard', () => {
    const result = isWildcardAlias('@myorg/lib1', 'packages/*/src/index.ts');

    expect(result).toBe(false);
  });

  it('should return false when neither contains wildcards', () => {
    const result = isWildcardAlias('@myorg/lib1', 'packages/lib1/src/index.ts');

    expect(result).toBe(false);
  });

  it('should return true with multiple wildcards in alias', () => {
    const result = isWildcardAlias('@myorg/*/*', 'packages/*/lib/*/index.ts');

    expect(result).toBe(true);
  });

  it('should return true with wildcard at different positions', () => {
    const result = isWildcardAlias('*-lib', 'packages/*-lib/src/index.ts');

    expect(result).toBe(true);
  });

  it('should handle empty strings', () => {
    const result = isWildcardAlias('', '');

    expect(result).toBe(false);
  });

  it('should handle wildcards at the start', () => {
    const result = isWildcardAlias('*/lib', '*/src/index.ts');

    expect(result).toBe(true);
  });

  it('should handle wildcards at the end', () => {
    const result = isWildcardAlias('lib/*', 'packages/*');

    expect(result).toBe(true);
  });
});
