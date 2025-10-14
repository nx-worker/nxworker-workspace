import { ProjectConfiguration } from '@nx/devkit';
import { findProjectForFile } from './find-project-for-file';

describe('findProjectForFile', () => {
  let projects: Map<string, ProjectConfiguration>;

  beforeEach(() => {
    projects = new Map<string, ProjectConfiguration>([
      [
        'lib1',
        {
          root: 'packages/lib1',
          sourceRoot: 'packages/lib1/src',
          projectType: 'library',
        },
      ],
      [
        'lib2',
        {
          root: 'packages/lib2',
          sourceRoot: 'packages/lib2/src',
          projectType: 'library',
        },
      ],
      [
        'app1',
        {
          root: 'apps/app1',
          sourceRoot: 'apps/app1/src',
          projectType: 'application',
        },
      ],
    ]);
  });

  it('should find project by source root', () => {
    const result = findProjectForFile(
      projects,
      'packages/lib1/src/lib/file.ts',
    );

    expect(result).not.toBeNull();
    expect(result?.name).toBe('lib1');
    expect(result?.project.root).toBe('packages/lib1');
  });

  it('should find project by project root', () => {
    const result = findProjectForFile(projects, 'packages/lib1/README.md');

    expect(result).not.toBeNull();
    expect(result?.name).toBe('lib1');
  });

  it('should return null for file not in any project', () => {
    const result = findProjectForFile(projects, 'packages/lib3/src/file.ts');

    expect(result).toBeNull();
  });

  it('should return null for empty file path', () => {
    const result = findProjectForFile(projects, '');

    expect(result).toBeNull();
  });

  it('should distinguish between different projects', () => {
    const result1 = findProjectForFile(projects, 'packages/lib1/src/index.ts');
    const result2 = findProjectForFile(projects, 'packages/lib2/src/index.ts');

    expect(result1?.name).toBe('lib1');
    expect(result2?.name).toBe('lib2');
    expect(result1?.name).not.toBe(result2?.name);
  });

  it('should handle application projects', () => {
    const result = findProjectForFile(projects, 'apps/app1/src/main.ts');

    expect(result).not.toBeNull();
    expect(result?.name).toBe('app1');
    expect(result?.project.projectType).toBe('application');
  });

  it('should handle projects without sourceRoot', () => {
    projects.set('lib3', {
      root: 'packages/lib3',
      projectType: 'library',
    });

    const result = findProjectForFile(projects, 'packages/lib3/index.ts');

    expect(result).not.toBeNull();
    expect(result?.name).toBe('lib3');
  });

  it('should match sourceRoot before projectRoot', () => {
    // File in source root
    const result = findProjectForFile(
      projects,
      'packages/lib1/src/lib/file.ts',
    );

    expect(result?.name).toBe('lib1');
  });

  it('should handle nested directory structures', () => {
    const result = findProjectForFile(
      projects,
      'packages/lib1/src/lib/nested/deep/file.ts',
    );

    expect(result).not.toBeNull();
    expect(result?.name).toBe('lib1');
  });

  it('should not match partial path prefixes', () => {
    // This should not match 'lib1' because it's 'lib10'
    const result = findProjectForFile(projects, 'packages/lib10/src/file.ts');

    expect(result).toBeNull();
  });

  it('should handle root-level files', () => {
    const result = findProjectForFile(projects, 'packages/lib1/package.json');

    expect(result).not.toBeNull();
    expect(result?.name).toBe('lib1');
  });

  it('should handle empty projects map', () => {
    const emptyProjects = new Map<string, ProjectConfiguration>();
    const result = findProjectForFile(
      emptyProjects,
      'packages/lib1/src/file.ts',
    );

    expect(result).toBeNull();
  });
});
