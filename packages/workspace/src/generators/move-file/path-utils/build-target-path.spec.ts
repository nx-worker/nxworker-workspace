import { ProjectConfiguration } from '@nx/devkit';
import { buildTargetPath } from './build-target-path';

describe('buildTargetPath', () => {
  it('should build path for library project', () => {
    const project: ProjectConfiguration = {
      root: 'packages/lib1',
      sourceRoot: 'packages/lib1/src',
      projectType: 'library',
    };

    const result = buildTargetPath(project, 'source/file.ts');
    expect(result).toBe('packages/lib1/src/lib/file.ts');
  });

  it('should build path for application project', () => {
    const project: ProjectConfiguration = {
      root: 'apps/app1',
      sourceRoot: 'apps/app1/src',
      projectType: 'application',
    };

    const result = buildTargetPath(project, 'source/file.ts');
    expect(result).toBe('apps/app1/src/app/file.ts');
  });

  it('should use default sourceRoot when not provided', () => {
    const project: ProjectConfiguration = {
      root: 'packages/lib1',
      projectType: 'library',
    };

    const result = buildTargetPath(project, 'source/file.ts');
    expect(result).toBe('packages/lib1/src/lib/file.ts');
  });

  it('should handle projectDirectory option', () => {
    const project: ProjectConfiguration = {
      root: 'packages/lib1',
      sourceRoot: 'packages/lib1/src',
      projectType: 'library',
    };

    const result = buildTargetPath(project, 'source/file.ts', 'utils');
    expect(result).toBe('packages/lib1/src/lib/utils/file.ts');
  });

  it('should handle nested projectDirectory', () => {
    const project: ProjectConfiguration = {
      root: 'packages/lib1',
      sourceRoot: 'packages/lib1/src',
      projectType: 'library',
    };

    const result = buildTargetPath(project, 'source/file.ts', 'utils/helpers');
    expect(result).toBe('packages/lib1/src/lib/utils/helpers/file.ts');
  });

  it('should extract filename from complex source path', () => {
    const project: ProjectConfiguration = {
      root: 'packages/lib1',
      sourceRoot: 'packages/lib1/src',
      projectType: 'library',
    };

    const result = buildTargetPath(
      project,
      'packages/lib2/src/lib/deep/nested/file.ts',
    );
    expect(result).toBe('packages/lib1/src/lib/file.ts');
  });

  it('should preserve file extension', () => {
    const project: ProjectConfiguration = {
      root: 'packages/lib1',
      sourceRoot: 'packages/lib1/src',
      projectType: 'library',
    };

    expect(buildTargetPath(project, 'source/file.ts')).toMatch(/\.ts$/);
    expect(buildTargetPath(project, 'source/file.js')).toMatch(/\.js$/);
    expect(buildTargetPath(project, 'source/file.tsx')).toMatch(/\.tsx$/);
  });

  it('should handle files with dots in name', () => {
    const project: ProjectConfiguration = {
      root: 'packages/lib1',
      sourceRoot: 'packages/lib1/src',
      projectType: 'library',
    };

    const result = buildTargetPath(project, 'source/file.spec.ts');
    expect(result).toBe('packages/lib1/src/lib/file.spec.ts');
  });

  it('should normalize path separators', () => {
    const project: ProjectConfiguration = {
      root: 'packages/lib1',
      sourceRoot: 'packages/lib1/src',
      projectType: 'library',
    };

    const result = buildTargetPath(project, 'source/file.ts');
    // normalizePath should ensure forward slashes
    expect(result).not.toContain('\\');
  });
});
