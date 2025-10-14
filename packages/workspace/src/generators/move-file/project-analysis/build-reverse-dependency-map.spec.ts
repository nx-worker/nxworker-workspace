import { ProjectGraph } from '@nx/devkit';
import { buildReverseDependencyMap } from './build-reverse-dependency-map';

describe('buildReverseDependencyMap', () => {
  it('should build reverse dependency map from project graph', () => {
    const projectGraph: ProjectGraph = {
      nodes: {},
      dependencies: {
        lib1: [{ source: 'lib1', target: 'lib2', type: 'static' }],
        lib3: [{ source: 'lib3', target: 'lib2', type: 'static' }],
      },
    };

    const result = buildReverseDependencyMap(projectGraph);

    expect(result.get('lib2')).toEqual(new Set(['lib1', 'lib3']));
    expect(result.get('lib1')).toBeUndefined();
    expect(result.get('lib3')).toBeUndefined();
  });

  it('should handle empty project graph', () => {
    const projectGraph: ProjectGraph = {
      nodes: {},
      dependencies: {},
    };

    const result = buildReverseDependencyMap(projectGraph);

    expect(result.size).toBe(0);
  });

  it('should handle project graph with no dependencies', () => {
    const projectGraph: ProjectGraph = {
      nodes: {},
      dependencies: {
        lib1: [],
        lib2: [],
      },
    };

    const result = buildReverseDependencyMap(projectGraph);

    expect(result.size).toBe(0);
  });

  it('should handle chain of dependencies', () => {
    const projectGraph: ProjectGraph = {
      nodes: {},
      dependencies: {
        lib1: [{ source: 'lib1', target: 'lib2', type: 'static' }],
        lib2: [{ source: 'lib2', target: 'lib3', type: 'static' }],
      },
    };

    const result = buildReverseDependencyMap(projectGraph);

    expect(result.get('lib2')).toEqual(new Set(['lib1']));
    expect(result.get('lib3')).toEqual(new Set(['lib2']));
    expect(result.get('lib1')).toBeUndefined();
  });

  it('should handle multiple dependencies from same project', () => {
    const projectGraph: ProjectGraph = {
      nodes: {},
      dependencies: {
        lib1: [
          { source: 'lib1', target: 'lib2', type: 'static' },
          { source: 'lib1', target: 'lib3', type: 'static' },
        ],
      },
    };

    const result = buildReverseDependencyMap(projectGraph);

    expect(result.get('lib2')).toEqual(new Set(['lib1']));
    expect(result.get('lib3')).toEqual(new Set(['lib1']));
  });

  it('should handle circular dependencies', () => {
    const projectGraph: ProjectGraph = {
      nodes: {},
      dependencies: {
        lib1: [{ source: 'lib1', target: 'lib2', type: 'static' }],
        lib2: [{ source: 'lib2', target: 'lib1', type: 'static' }],
      },
    };

    const result = buildReverseDependencyMap(projectGraph);

    expect(result.get('lib1')).toEqual(new Set(['lib2']));
    expect(result.get('lib2')).toEqual(new Set(['lib1']));
  });

  it('should handle complex dependency graph', () => {
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

    const result = buildReverseDependencyMap(projectGraph);

    expect(result.get('lib1')).toEqual(new Set(['app1', 'app2']));
    expect(result.get('lib2')).toEqual(new Set(['app1']));
    expect(result.get('lib3')).toEqual(new Set(['lib1', 'lib2']));
    expect(result.get('app1')).toBeUndefined();
    expect(result.get('app2')).toBeUndefined();
  });

  it('should preserve multiple dependents for same target', () => {
    const projectGraph: ProjectGraph = {
      nodes: {},
      dependencies: {
        lib1: [{ source: 'lib1', target: 'shared', type: 'static' }],
        lib2: [{ source: 'lib2', target: 'shared', type: 'static' }],
        lib3: [{ source: 'lib3', target: 'shared', type: 'static' }],
      },
    };

    const result = buildReverseDependencyMap(projectGraph);

    expect(result.get('shared')).toEqual(new Set(['lib1', 'lib2', 'lib3']));
  });

  it('should handle null dependencies object', () => {
    const projectGraph: ProjectGraph = {
      nodes: {},
      dependencies: null as any,
    };

    const result = buildReverseDependencyMap(projectGraph);

    expect(result.size).toBe(0);
  });
});
