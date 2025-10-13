import { ProjectGraph } from '@nx/devkit';
import { getCachedDependentProjects } from './get-cached-dependent-projects';

describe('getCachedDependentProjects', () => {
  let projectGraph: ProjectGraph;
  let dependencyGraphCache: Map<string, Set<string>>;
  let getDependentProjectNames: jest.Mock;

  beforeEach(() => {
    projectGraph = {
      nodes: {},
      dependencies: {},
    } as ProjectGraph;

    dependencyGraphCache = new Map();
    getDependentProjectNames = jest.fn();
  });

  it('should call getDependentProjectNames on cache miss', () => {
    getDependentProjectNames.mockReturnValue(['project2', 'project3']);

    const result = getCachedDependentProjects(
      projectGraph,
      'project1',
      getDependentProjectNames,
      dependencyGraphCache,
    );

    expect(getDependentProjectNames).toHaveBeenCalledWith(
      projectGraph,
      'project1',
    );
    expect(result).toEqual(new Set(['project2', 'project3']));
  });

  it('should cache the result', () => {
    getDependentProjectNames.mockReturnValue(['project2', 'project3']);

    getCachedDependentProjects(
      projectGraph,
      'project1',
      getDependentProjectNames,
      dependencyGraphCache,
    );

    expect(dependencyGraphCache.has('project1')).toBe(true);
    expect(dependencyGraphCache.get('project1')).toEqual(
      new Set(['project2', 'project3']),
    );
  });

  it('should use cached result on second call', () => {
    getDependentProjectNames.mockReturnValue(['project2', 'project3']);

    // First call
    const result1 = getCachedDependentProjects(
      projectGraph,
      'project1',
      getDependentProjectNames,
      dependencyGraphCache,
    );

    // Second call
    const result2 = getCachedDependentProjects(
      projectGraph,
      'project1',
      getDependentProjectNames,
      dependencyGraphCache,
    );

    expect(getDependentProjectNames).toHaveBeenCalledTimes(1);
    expect(result1).toBe(result2); // Same Set instance
  });

  it('should handle projects with no dependents', () => {
    getDependentProjectNames.mockReturnValue([]);

    const result = getCachedDependentProjects(
      projectGraph,
      'project1',
      getDependentProjectNames,
      dependencyGraphCache,
    );

    expect(result).toEqual(new Set());
  });

  it('should handle different projects independently', () => {
    getDependentProjectNames
      .mockReturnValueOnce(['project2'])
      .mockReturnValueOnce(['project3', 'project4']);

    const result1 = getCachedDependentProjects(
      projectGraph,
      'project1',
      getDependentProjectNames,
      dependencyGraphCache,
    );

    const result2 = getCachedDependentProjects(
      projectGraph,
      'project2',
      getDependentProjectNames,
      dependencyGraphCache,
    );

    expect(result1).toEqual(new Set(['project2']));
    expect(result2).toEqual(new Set(['project3', 'project4']));
    expect(dependencyGraphCache.size).toBe(2);
  });

  it('should convert array to Set', () => {
    getDependentProjectNames.mockReturnValue([
      'project2',
      'project2',
      'project3',
    ]);

    const result = getCachedDependentProjects(
      projectGraph,
      'project1',
      getDependentProjectNames,
      dependencyGraphCache,
    );

    // Set should deduplicate
    expect(result).toEqual(new Set(['project2', 'project3']));
  });
});
