import { ProjectGraph } from '@nx/devkit';
import { getDependentProjectNames } from './get-dependent-project-names';

describe('getDependentProjectNames', () => {
  it('should return direct dependents', () => {
    const projectGraph: ProjectGraph = {
      nodes: {},
      dependencies: {
        lib1: [{ source: 'lib1', target: 'lib2', type: 'static' }],
        lib3: [{ source: 'lib3', target: 'lib2', type: 'static' }],
      },
    };

    const result = getDependentProjectNames(projectGraph, 'lib2');

    expect(result.sort()).toEqual(['lib1', 'lib3']);
  });

  it('should return transitive dependents', () => {
    const projectGraph: ProjectGraph = {
      nodes: {},
      dependencies: {
        lib1: [{ source: 'lib1', target: 'lib2', type: 'static' }],
        lib2: [{ source: 'lib2', target: 'lib3', type: 'static' }],
      },
    };

    const result = getDependentProjectNames(projectGraph, 'lib3');

    expect(result.sort()).toEqual(['lib1', 'lib2']);
  });

  it('should return empty array when no dependents exist', () => {
    const projectGraph: ProjectGraph = {
      nodes: {},
      dependencies: {
        lib1: [{ source: 'lib1', target: 'lib2', type: 'static' }],
      },
    };

    const result = getDependentProjectNames(projectGraph, 'lib1');

    expect(result).toEqual([]);
  });

  it('should handle project not in graph', () => {
    const projectGraph: ProjectGraph = {
      nodes: {},
      dependencies: {
        lib1: [{ source: 'lib1', target: 'lib2', type: 'static' }],
      },
    };

    const result = getDependentProjectNames(projectGraph, 'lib3');

    expect(result).toEqual([]);
  });

  it('should handle complex dependency tree', () => {
    const projectGraph: ProjectGraph = {
      nodes: {},
      dependencies: {
        app1: [
          { source: 'app1', target: 'lib1', type: 'static' },
          { source: 'app1', target: 'lib2', type: 'static' },
        ],
        app2: [{ source: 'app2', target: 'lib1', type: 'static' }],
        lib1: [{ source: 'lib1', target: 'lib3', type: 'static' }],
        lib2: [{ source: 'lib2', target: 'lib3', type: 'static' }],
      },
    };

    const result = getDependentProjectNames(projectGraph, 'lib3');

    expect(result.sort()).toEqual(['app1', 'app2', 'lib1', 'lib2']);
  });

  it('should not include the project itself', () => {
    const projectGraph: ProjectGraph = {
      nodes: {},
      dependencies: {
        lib1: [{ source: 'lib1', target: 'lib2', type: 'static' }],
        lib2: [{ source: 'lib2', target: 'lib1', type: 'static' }],
      },
    };

    const result = getDependentProjectNames(projectGraph, 'lib1');

    expect(result).toEqual(['lib2']);
    expect(result).not.toContain('lib1');
  });

  it('should handle circular dependencies', () => {
    const projectGraph: ProjectGraph = {
      nodes: {},
      dependencies: {
        lib1: [{ source: 'lib1', target: 'lib2', type: 'static' }],
        lib2: [{ source: 'lib2', target: 'lib3', type: 'static' }],
        lib3: [{ source: 'lib3', target: 'lib1', type: 'static' }],
      },
    };

    const result = getDependentProjectNames(projectGraph, 'lib1');

    expect(result.sort()).toEqual(['lib2', 'lib3']);
  });

  it('should handle diamond dependency pattern', () => {
    const projectGraph: ProjectGraph = {
      nodes: {},
      dependencies: {
        app: [
          { source: 'app', target: 'lib1', type: 'static' },
          { source: 'app', target: 'lib2', type: 'static' },
        ],
        lib1: [{ source: 'lib1', target: 'shared', type: 'static' }],
        lib2: [{ source: 'lib2', target: 'shared', type: 'static' }],
      },
    };

    const result = getDependentProjectNames(projectGraph, 'shared');

    expect(result.sort()).toEqual(['app', 'lib1', 'lib2']);
  });

  it('should handle empty dependencies object', () => {
    const projectGraph: ProjectGraph = {
      nodes: {},
      dependencies: {},
    };

    const result = getDependentProjectNames(projectGraph, 'lib1');

    expect(result).toEqual([]);
  });

  it('should handle multiple levels of transitive dependents', () => {
    const projectGraph: ProjectGraph = {
      nodes: {},
      dependencies: {
        level1: [{ source: 'level1', target: 'level2', type: 'static' }],
        level2: [{ source: 'level2', target: 'level3', type: 'static' }],
        level3: [{ source: 'level3', target: 'level4', type: 'static' }],
        level4: [{ source: 'level4', target: 'base', type: 'static' }],
      },
    };

    const result = getDependentProjectNames(projectGraph, 'base');

    expect(result.sort()).toEqual(['level1', 'level2', 'level3', 'level4']);
  });
});
