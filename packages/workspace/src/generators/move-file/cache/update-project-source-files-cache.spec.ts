import { updateProjectSourceFilesCache } from './update-project-source-files-cache';

describe('updateProjectSourceFilesCache', () => {
  let projectSourceFilesCache: Map<string, string[]>;

  beforeEach(() => {
    projectSourceFilesCache = new Map();
  });

  it('should do nothing if cache does not exist for project', () => {
    updateProjectSourceFilesCache(
      'libs/mylib',
      'libs/mylib/src/old.ts',
      'libs/mylib/src/new.ts',
      projectSourceFilesCache,
    );

    expect(projectSourceFilesCache.size).toBe(0);
  });

  it('should remove old path and add new path', () => {
    projectSourceFilesCache.set('libs/mylib', [
      'libs/mylib/src/index.ts',
      'libs/mylib/src/old.ts',
      'libs/mylib/src/util.ts',
    ]);

    updateProjectSourceFilesCache(
      'libs/mylib',
      'libs/mylib/src/old.ts',
      'libs/mylib/src/new.ts',
      projectSourceFilesCache,
    );

    const cached = projectSourceFilesCache.get('libs/mylib');
    expect(cached).toContain('libs/mylib/src/new.ts');
    expect(cached).not.toContain('libs/mylib/src/old.ts');
    expect(cached).toHaveLength(3);
  });

  it('should only remove old path if newPath is null', () => {
    projectSourceFilesCache.set('libs/mylib', [
      'libs/mylib/src/index.ts',
      'libs/mylib/src/old.ts',
    ]);

    updateProjectSourceFilesCache(
      'libs/mylib',
      'libs/mylib/src/old.ts',
      null,
      projectSourceFilesCache,
    );

    const cached = projectSourceFilesCache.get('libs/mylib');
    expect(cached).not.toContain('libs/mylib/src/old.ts');
    expect(cached).toHaveLength(1);
  });

  it('should not add new path if it is in a different project', () => {
    projectSourceFilesCache.set('libs/mylib', ['libs/mylib/src/old.ts']);

    updateProjectSourceFilesCache(
      'libs/mylib',
      'libs/mylib/src/old.ts',
      'libs/otherlib/src/new.ts',
      projectSourceFilesCache,
    );

    const cached = projectSourceFilesCache.get('libs/mylib');
    expect(cached).not.toContain('libs/mylib/src/old.ts');
    expect(cached).not.toContain('libs/otherlib/src/new.ts');
    expect(cached).toHaveLength(0);
  });

  it('should handle old path not being in cache', () => {
    projectSourceFilesCache.set('libs/mylib', ['libs/mylib/src/index.ts']);

    updateProjectSourceFilesCache(
      'libs/mylib',
      'libs/mylib/src/missing.ts',
      'libs/mylib/src/new.ts',
      projectSourceFilesCache,
    );

    const cached = projectSourceFilesCache.get('libs/mylib');
    expect(cached).toContain('libs/mylib/src/new.ts');
    expect(cached).toHaveLength(2);
  });

  it('should preserve other files in cache', () => {
    projectSourceFilesCache.set('libs/mylib', [
      'libs/mylib/src/index.ts',
      'libs/mylib/src/old.ts',
      'libs/mylib/src/util.ts',
      'libs/mylib/src/helper.ts',
    ]);

    updateProjectSourceFilesCache(
      'libs/mylib',
      'libs/mylib/src/old.ts',
      'libs/mylib/src/new.ts',
      projectSourceFilesCache,
    );

    const cached = projectSourceFilesCache.get('libs/mylib');
    expect(cached).toContain('libs/mylib/src/index.ts');
    expect(cached).toContain('libs/mylib/src/util.ts');
    expect(cached).toContain('libs/mylib/src/helper.ts');
  });

  it('should handle newPath in subdirectory of project', () => {
    projectSourceFilesCache.set('libs/mylib', ['libs/mylib/src/old.ts']);

    updateProjectSourceFilesCache(
      'libs/mylib',
      'libs/mylib/src/old.ts',
      'libs/mylib/src/features/new.ts',
      projectSourceFilesCache,
    );

    const cached = projectSourceFilesCache.get('libs/mylib');
    expect(cached).toContain('libs/mylib/src/features/new.ts');
  });
});
