import { uniqueId } from './test-utils';

describe('uniqueId', () => {
  it('should generate a unique ID without prefix', () => {
    const id = uniqueId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
    // UUID without dashes should be 32 hex characters
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('should generate a unique ID with prefix', () => {
    const id = uniqueId('test-');
    expect(id).toMatch(/^test-[0-9a-f]{32}$/);
  });

  it('should generate different IDs on each call', () => {
    const id1 = uniqueId('lib-');
    const id2 = uniqueId('lib-');
    expect(id1).not.toBe(id2);
  });

  it('should handle empty string prefix', () => {
    const id = uniqueId('');
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('should maintain prefix exactly as provided', () => {
    const prefix = 'myLib123-';
    const id = uniqueId(prefix);
    expect(id.startsWith(prefix)).toBe(true);
    expect(id.substring(prefix.length)).toMatch(/^[0-9a-f]{32}$/);
  });

  it('should generate globally unique IDs across multiple calls', () => {
    const ids = new Set<string>();
    const count = 1000;

    for (let i = 0; i < count; i++) {
      ids.add(uniqueId());
    }

    // All IDs should be unique
    expect(ids.size).toBe(count);
  });

  it('should be compatible with lodash uniqueId signature', () => {
    // Test that it works with no arguments (matches lodash signature)
    const noPrefix = uniqueId();
    expect(typeof noPrefix).toBe('string');

    // Test that it works with prefix argument (matches lodash signature)
    const withPrefix = uniqueId('prefix-');
    expect(withPrefix.startsWith('prefix-')).toBe(true);
  });
});
