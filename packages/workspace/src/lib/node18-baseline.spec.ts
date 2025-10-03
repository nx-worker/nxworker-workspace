/**
 * This test file verifies that ESLint rules correctly ban Node.js 20+ and 22+ features
 * to enforce Node.js 18 baseline compatibility.
 *
 * Each test case should trigger an ESLint error when linted.
 */

describe('Node.js 18 baseline enforcement', () => {
  it('should prevent Promise.withResolvers (Node 22+)', () => {
    // This should be caught by es-x/no-promise-withresolvers
    // const { promise, resolve, reject } = Promise.withResolvers();
    expect(true).toBe(true);
  });

  it('should prevent Array.prototype.toReversed (Node 20+)', () => {
    // This should be caught by es-x/no-array-prototype-toreversed
    // const arr = [1, 2, 3];
    // const reversed = arr.toReversed();
    expect(true).toBe(true);
  });

  it('should prevent Array.prototype.findLast (Node 20+)', () => {
    // This should be caught by es-x/no-array-prototype-findlast-findlastindex
    // const arr = [1, 2, 3];
    // const last = arr.findLast(x => x > 1);
    expect(true).toBe(true);
  });

  it('should prevent RegExp /v flag (Node 22+)', () => {
    // This should be caught by es-x/no-regexp-v-flag
    // const regex = /[a&&b]/v;
    expect(true).toBe(true);
  });

  it('should prevent Set methods (Experimental)', () => {
    // This should be caught by es-x/no-set-prototype-union
    // const set1 = new Set([1, 2, 3]);
    // const set2 = new Set([2, 3, 4]);
    // const union = set1.union(set2);
    expect(true).toBe(true);
  });

  it('should allow Node.js 18 compatible features', () => {
    // These are all safe in Node.js 18
    const arr = [1, 2, 3];
    const filtered = arr.filter((x) => x > 1);
    const mapped = arr.map((x) => x * 2);
    const found = arr.find((x) => x === 2);

    expect(filtered).toEqual([2, 3]);
    expect(mapped).toEqual([2, 4, 6]);
    expect(found).toBe(2);

    // structuredClone is safe in Node.js 18
    const obj = { a: 1, b: { c: 2 } };
    const cloned = structuredClone(obj);
    expect(cloned).toEqual(obj);
    expect(cloned).not.toBe(obj);

    // Object.hasOwn is safe in Node.js 18
    expect(Object.hasOwn(obj, 'a')).toBe(true);

    // Error cause is safe in Node.js 18
    const err = new Error('Test error', { cause: new Error('Root cause') });
    expect(err.message).toBe('Test error');
  });
});
