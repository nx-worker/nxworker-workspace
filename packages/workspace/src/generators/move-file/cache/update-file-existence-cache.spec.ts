import { updateFileExistenceCache } from './update-file-existence-cache';

describe('updateFileExistenceCache', () => {
  let fileExistenceCache: Map<string, boolean>;

  beforeEach(() => {
    fileExistenceCache = new Map();
  });

  it('should add file to cache when created', () => {
    updateFileExistenceCache('test.ts', true, fileExistenceCache);

    expect(fileExistenceCache.get('test.ts')).toBe(true);
  });

  it('should add file to cache when deleted', () => {
    updateFileExistenceCache('test.ts', false, fileExistenceCache);

    expect(fileExistenceCache.get('test.ts')).toBe(false);
  });

  it('should update existing cache entry', () => {
    fileExistenceCache.set('test.ts', true);

    updateFileExistenceCache('test.ts', false, fileExistenceCache);

    expect(fileExistenceCache.get('test.ts')).toBe(false);
  });

  it('should handle multiple files', () => {
    updateFileExistenceCache('file1.ts', true, fileExistenceCache);
    updateFileExistenceCache('file2.ts', false, fileExistenceCache);
    updateFileExistenceCache('file3.ts', true, fileExistenceCache);

    expect(fileExistenceCache.get('file1.ts')).toBe(true);
    expect(fileExistenceCache.get('file2.ts')).toBe(false);
    expect(fileExistenceCache.get('file3.ts')).toBe(true);
  });

  it('should handle updates to same file multiple times', () => {
    updateFileExistenceCache('test.ts', true, fileExistenceCache);
    expect(fileExistenceCache.get('test.ts')).toBe(true);

    updateFileExistenceCache('test.ts', false, fileExistenceCache);
    expect(fileExistenceCache.get('test.ts')).toBe(false);

    updateFileExistenceCache('test.ts', true, fileExistenceCache);
    expect(fileExistenceCache.get('test.ts')).toBe(true);
  });
});
