import { sanitizePath } from './sanitize-path';

describe('sanitizePath', () => {
  it('should normalize a simple relative path', () => {
    expect(sanitizePath('packages/lib1/src/file.ts')).toBe(
      'packages/lib1/src/file.ts',
    );
  });

  it('should remove leading slash', () => {
    expect(sanitizePath('/packages/lib1/src/file.ts')).toBe(
      'packages/lib1/src/file.ts',
    );
  });

  it('should throw error for path traversal', () => {
    expect(() => sanitizePath('../etc/passwd')).toThrow(
      'Invalid path: path traversal detected in "../etc/passwd"',
    );
  });
});
