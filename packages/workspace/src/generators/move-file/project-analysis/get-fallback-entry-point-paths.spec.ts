import { ProjectConfiguration } from '@nx/devkit';
import { getFallbackEntryPointPaths } from './get-fallback-entry-point-paths';

describe('getFallbackEntryPointPaths', () => {
  it('should return entry points for library with sourceRoot', () => {
    const project: ProjectConfiguration = {
      root: 'packages/lib1',
      sourceRoot: 'packages/lib1/src',
      projectType: 'library',
    };

    const result = getFallbackEntryPointPaths(project);

    expect(result).toContain('packages/lib1/src/index.ts');
    expect(result).toContain('packages/lib1/src/public-api.ts');
    expect(result).toContain('packages/lib1/src/index.js');
    expect(result).toContain('packages/lib1/src/public-api.js');
  });

  it('should return entry points in both sourceRoot and root/src', () => {
    const project: ProjectConfiguration = {
      root: 'packages/lib1',
      sourceRoot: 'packages/lib1/src',
      projectType: 'library',
    };

    const result = getFallbackEntryPointPaths(project);

    // Should have entries for sourceRoot
    expect(
      result.filter((p) => p.startsWith('packages/lib1/src/')).length,
    ).toBeGreaterThan(0);

    // Note: Both sourceRoot and root/src will be the same in this case
    // so we just verify the structure is correct
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle project without sourceRoot', () => {
    const project: ProjectConfiguration = {
      root: 'packages/lib2',
      projectType: 'library',
    };

    const result = getFallbackEntryPointPaths(project);

    expect(result).toContain('packages/lib2/index.ts');
    expect(result).toContain('packages/lib2/public-api.ts');
    expect(result).toContain('packages/lib2/src/index.ts');
    expect(result).toContain('packages/lib2/src/public-api.ts');
  });

  it('should include all primary entry file extensions', () => {
    const project: ProjectConfiguration = {
      root: 'packages/lib1',
      sourceRoot: 'packages/lib1/src',
      projectType: 'library',
    };

    const result = getFallbackEntryPointPaths(project);

    const extensions = ['ts', 'tsx', 'js', 'jsx', 'mts', 'mjs', 'cts', 'cjs'];

    extensions.forEach((ext) => {
      expect(result).toContain(`packages/lib1/src/index.${ext}`);
      expect(result).toContain(`packages/lib1/src/public-api.${ext}`);
    });
  });

  it('should handle application project', () => {
    const project: ProjectConfiguration = {
      root: 'apps/app1',
      sourceRoot: 'apps/app1/src',
      projectType: 'application',
    };

    const result = getFallbackEntryPointPaths(project);

    expect(result).toContain('apps/app1/src/index.ts');
    expect(result).toContain('apps/app1/src/public-api.ts');
  });

  it('should handle custom source root location', () => {
    const project: ProjectConfiguration = {
      root: 'libs/custom',
      sourceRoot: 'libs/custom/lib',
      projectType: 'library',
    };

    const result = getFallbackEntryPointPaths(project);

    expect(result).toContain('libs/custom/lib/index.ts');
    expect(result).toContain('libs/custom/lib/public-api.ts');
    expect(result).toContain('libs/custom/src/index.ts');
    expect(result).toContain('libs/custom/src/public-api.ts');
  });

  it('should have duplicates when sourceRoot equals root/src', () => {
    const project: ProjectConfiguration = {
      root: 'packages/lib1',
      sourceRoot: 'packages/lib1/src',
      projectType: 'library',
    };

    const result = getFallbackEntryPointPaths(project);

    // When sourceRoot is root/src, both patterns produce the same paths
    // So we should have 32 total paths (16 * 2) with 16 unique
    expect(result.length).toBe(32); // 2 sets of 16 files
    const uniquePaths = new Set(result);
    expect(uniquePaths.size).toBe(16); // Only 16 unique paths
  });

  it('should handle root-level project', () => {
    const project: ProjectConfiguration = {
      root: '.',
      sourceRoot: 'src',
      projectType: 'library',
    };

    const result = getFallbackEntryPointPaths(project);

    expect(result).toContain('src/index.ts');
    expect(result).toContain('src/public-api.ts');
  });
});
