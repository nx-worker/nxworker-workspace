import { clearAllCaches } from './clear-all-caches';
import { treeReadCache } from '../tree-cache';

// Mock the tree-cache module
jest.mock('../tree-cache', () => ({
  treeReadCache: {
    clear: jest.fn(),
  },
}));

describe('clearAllCaches', () => {
  let projectSourceFilesCache: Map<string, string[]>;
  let fileExistenceCache: Map<string, boolean>;
  let compilerPathsCache: { value: Record<string, unknown> | null | undefined };
  let dependencyGraphCache: Map<string, Set<string>>;

  beforeEach(() => {
    projectSourceFilesCache = new Map([
      ['project1', ['file1.ts', 'file2.ts']],
      ['project2', ['file3.ts']],
    ]);
    fileExistenceCache = new Map([
      ['file1.ts', true],
      ['file2.ts', false],
    ]);
    compilerPathsCache = { value: { '@lib/*': ['libs/lib/src/*'] } };
    dependencyGraphCache = new Map([
      ['project1', new Set(['project2', 'project3'])],
    ]);

    // Clear mock calls
    jest.clearAllMocks();
  });

  it('should clear all cache instances', () => {
    clearAllCaches(
      projectSourceFilesCache,
      fileExistenceCache,
      compilerPathsCache,
      dependencyGraphCache,
    );

    expect(projectSourceFilesCache.size).toBe(0);
    expect(fileExistenceCache.size).toBe(0);
    expect(compilerPathsCache.value).toBeUndefined();
    expect(dependencyGraphCache.size).toBe(0);
  });

  it('should clear tree read cache', () => {
    clearAllCaches(
      projectSourceFilesCache,
      fileExistenceCache,
      compilerPathsCache,
      dependencyGraphCache,
    );

    expect(treeReadCache.clear).toHaveBeenCalledTimes(1);
  });

  it('should handle already empty caches', () => {
    projectSourceFilesCache.clear();
    fileExistenceCache.clear();
    compilerPathsCache.value = undefined;
    dependencyGraphCache.clear();

    expect(() =>
      clearAllCaches(
        projectSourceFilesCache,
        fileExistenceCache,
        compilerPathsCache,
        dependencyGraphCache,
      ),
    ).not.toThrow();

    expect(projectSourceFilesCache.size).toBe(0);
    expect(fileExistenceCache.size).toBe(0);
  });

  it('should reset compiler paths cache to undefined (not null)', () => {
    compilerPathsCache.value = null;

    clearAllCaches(
      projectSourceFilesCache,
      fileExistenceCache,
      compilerPathsCache,
      dependencyGraphCache,
    );

    expect(compilerPathsCache.value).toBeUndefined();
    expect(compilerPathsCache.value).not.toBeNull();
  });
});
