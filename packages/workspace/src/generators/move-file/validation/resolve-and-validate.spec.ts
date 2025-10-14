import { Tree, ProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { resolveAndValidate } from './resolve-and-validate';
import { MoveFileGeneratorSchema } from '../schema';

describe('resolveAndValidate', () => {
  let tree: Tree;
  let projects: Map<string, ProjectConfiguration>;
  let mockCachedTreeExists: jest.Mock;
  let mockGetProjectSourceFiles: jest.Mock;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    projects = new Map();
    mockCachedTreeExists = jest.fn();
    mockGetProjectSourceFiles = jest.fn().mockReturnValue([]);

    // Setup test projects
    const lib1: ProjectConfiguration = {
      root: 'packages/lib1',
      sourceRoot: 'packages/lib1/src',
      projectType: 'library',
    };
    const lib2: ProjectConfiguration = {
      root: 'packages/lib2',
      sourceRoot: 'packages/lib2/src',
      projectType: 'library',
    };
    projects.set('lib1', lib1);
    projects.set('lib2', lib2);
  });

  describe('input validation', () => {
    it('should validate file path successfully', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
      };

      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      expect(result.normalizedSource).toBe('packages/lib1/src/lib/test.ts');
      expect(result.targetProjectName).toBe('lib2');
    });

    it('should throw error for invalid file path with disallowed characters', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/../../../etc/passwd',
        project: 'lib2',
      };

      expect(() =>
        resolveAndValidate(
          tree,
          options,
          projects,
          mockCachedTreeExists,
          mockGetProjectSourceFiles,
        ),
      ).toThrow(/path traversal detected/);
    });

    it('should throw error for invalid project name', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: '../invalid',
      };

      expect(() =>
        resolveAndValidate(
          tree,
          options,
          projects,
          mockCachedTreeExists,
          mockGetProjectSourceFiles,
        ),
      ).toThrow(/not found in workspace/);
    });

    it('should allow glob patterns when intended', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/*.ts',
        project: 'lib2',
      };

      // Note: glob expansion happens before this function is called
      // This test verifies the validation allows glob characters
      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      // Should not throw for glob pattern at validation stage
      expect(() =>
        resolveAndValidate(
          tree,
          options,
          projects,
          mockCachedTreeExists,
          mockGetProjectSourceFiles,
        ),
      ).toThrow(/Source file.*not found/); // Fails at file existence, not validation
    });

    it('should validate with unicode characters when allowed', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test-文件.ts',
        project: 'lib2',
        allowUnicode: true,
      };

      tree.write(
        'packages/lib1/src/lib/test-文件.ts',
        'export const test = 1;',
      );
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      expect(result.normalizedSource).toContain('test-文件.ts');
    });
  });

  describe('project validation', () => {
    it('should throw error when target project does not exist', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'nonexistent',
      };

      expect(() =>
        resolveAndValidate(
          tree,
          options,
          projects,
          mockCachedTreeExists,
          mockGetProjectSourceFiles,
        ),
      ).toThrow(/Target project "nonexistent" not found/);
    });

    it('should throw error when both deriveProjectDirectory and projectDirectory are set', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
        deriveProjectDirectory: true,
        projectDirectory: 'custom',
      };

      expect(() =>
        resolveAndValidate(
          tree,
          options,
          projects,
          mockCachedTreeExists,
          mockGetProjectSourceFiles,
        ),
      ).toThrow(
        /Cannot use both "deriveProjectDirectory" and "projectDirectory"/,
      );
    });

    it('should throw error for invalid projectDirectory with path traversal', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
        projectDirectory: '../../../etc',
      };

      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      expect(() =>
        resolveAndValidate(
          tree,
          options,
          projects,
          mockCachedTreeExists,
          mockGetProjectSourceFiles,
        ),
      ).toThrow(/path traversal detected/);
    });

    it('should accept valid projectDirectory', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
        projectDirectory: 'utils',
      };

      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      expect(result.normalizedTarget).toContain('utils');
    });
  });

  describe('file existence validation', () => {
    it('should throw error when source file does not exist', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/nonexistent.ts',
        project: 'lib2',
      };

      mockCachedTreeExists.mockReturnValue(false);

      expect(() =>
        resolveAndValidate(
          tree,
          options,
          projects,
          mockCachedTreeExists,
          mockGetProjectSourceFiles,
        ),
      ).toThrow(/Source file.*not found/);
    });

    it('should throw error when target file already exists', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
      };

      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');
      tree.write('packages/lib2/src/lib/test.ts', 'export const test = 2;');

      mockCachedTreeExists.mockImplementation((t, filePath) => {
        return tree.exists(filePath);
      });

      expect(() =>
        resolveAndValidate(
          tree,
          options,
          projects,
          mockCachedTreeExists,
          mockGetProjectSourceFiles,
        ),
      ).toThrow(/Target file.*already exists/);
    });

    it('should validate successfully when source exists and target does not', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
      };

      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');

      mockCachedTreeExists.mockImplementation((t, filePath) => {
        return tree.exists(filePath);
      });

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      expect(result.normalizedSource).toBe('packages/lib1/src/lib/test.ts');
      expect(result.normalizedTarget).toBe('packages/lib2/src/lib/test.ts');
    });
  });

  describe('project resolution', () => {
    it('should throw error when source project cannot be determined', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'unknown/path/test.ts',
        project: 'lib2',
      };

      tree.write('unknown/path/test.ts', 'export const test = 1;');
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      expect(() =>
        resolveAndValidate(
          tree,
          options,
          projects,
          mockCachedTreeExists,
          mockGetProjectSourceFiles,
        ),
      ).toThrow(/Could not determine source project/);
    });

    it('should determine source project from file path', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
      };

      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      expect(result.sourceProjectName).toBe('lib1');
      expect(result.sourceProject.root).toBe('packages/lib1');
    });

    it('should handle project without sourceRoot', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib3/test.ts',
        project: 'lib2',
      };

      const lib3: ProjectConfiguration = {
        root: 'packages/lib3',
        projectType: 'library',
      };
      projects.set('lib3', lib3);

      tree.write('packages/lib3/test.ts', 'export const test = 1;');
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      expect(result.sourceProjectName).toBe('lib3');
      expect(result.sourceRoot).toBe('packages/lib3'); // Falls back to root
    });
  });

  describe('same project detection', () => {
    it('should detect same project move', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib1',
        projectDirectory: 'utils',
      };

      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      expect(result.isSameProject).toBe(true);
    });

    it('should detect cross-project move', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
      };

      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      expect(result.isSameProject).toBe(false);
    });
  });

  describe('file content reading', () => {
    it('should read file content successfully', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
      };

      const content = 'export const test = 1;';
      tree.write('packages/lib1/src/lib/test.ts', content);
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      expect(result.fileContent).toBe(content);
    });

    it('should read file with complex content', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/complex.ts',
        project: 'lib2',
      };

      const content = `
        import { something } from './other';
        
        export class MyClass {
          constructor() {
            console.log('hello');
          }
        }
      `;
      tree.write('packages/lib1/src/lib/complex.ts', content);
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      expect(result.fileContent).toBe(content);
    });
  });

  describe('directory handling', () => {
    it('should use provided projectDirectory', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
        projectDirectory: 'custom',
      };

      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      // projectDirectory is used in buildTargetPath, which preserves directory structure
      expect(result.normalizedTarget).toContain('custom');
    });

    it('should derive directory from source file path', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils/test.ts',
        project: 'lib2',
        deriveProjectDirectory: true,
      };

      tree.write(
        'packages/lib1/src/lib/utils/test.ts',
        'export const test = 1;',
      );
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      // Directory derived from source path structure
      expect(result.normalizedTarget).toContain('lib/utils');
    });

    it('should handle no directory provided or derived', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
      };

      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      // Should maintain directory structure from source
      expect(result.normalizedTarget).toBe('packages/lib2/src/lib/test.ts');
    });
  });

  describe('export status', () => {
    it('should detect exported file', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
      };

      tree.write('packages/lib1/src/index.ts', 'export * from "./lib/test";');
      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      expect(result.isExported).toBe(true);
    });

    it('should detect non-exported file', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/internal.ts',
        project: 'lib2',
      };

      tree.write('packages/lib1/src/index.ts', '// empty');
      tree.write(
        'packages/lib1/src/lib/internal.ts',
        'export const internal = 1;',
      );
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      expect(result.isExported).toBe(false);
    });
  });

  describe('import path resolution', () => {
    it('should call getProjectImportPath for both projects', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
      };

      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      // Import paths are retrieved, value depends on tsconfig
      expect(result).toHaveProperty('sourceImportPath');
      expect(result).toHaveProperty('targetImportPath');
    });

    it('should handle projects without import paths', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
      };

      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      // Without tsconfig paths, import paths may be null
      expect(result).toHaveProperty('sourceImportPath');
      expect(result).toHaveProperty('targetImportPath');
    });
  });

  describe('import checking in target project', () => {
    it('should check for imports in target project', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
      };

      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));
      mockGetProjectSourceFiles.mockReturnValue([
        'packages/lib2/src/lib/consumer.ts',
      ]);

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      // hasImportsInTarget is computed based on import path and actual imports
      expect(result).toHaveProperty('hasImportsInTarget');
      expect(typeof result.hasImportsInTarget).toBe('boolean');
    });

    it('should handle no imports in target project', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
      };

      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');
      tree.write(
        'tsconfig.base.json',
        JSON.stringify({
          compilerOptions: {
            paths: {
              '@test/lib1': ['packages/lib1/src/index.ts'],
              '@test/lib2': ['packages/lib2/src/index.ts'],
            },
          },
        }),
      );
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));
      mockGetProjectSourceFiles.mockReturnValue([]);

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      expect(result.hasImportsInTarget).toBe(false);
    });

    it('should handle target project without import path', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
      };

      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      expect(result.hasImportsInTarget).toBe(false);
    });
  });

  describe('context completeness', () => {
    it('should return complete MoveContext with all required fields', () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/test.ts',
        project: 'lib2',
      };

      tree.write('packages/lib1/src/lib/test.ts', 'export const test = 1;');
      mockCachedTreeExists.mockImplementation((t, p) => tree.exists(p));

      const result = resolveAndValidate(
        tree,
        options,
        projects,
        mockCachedTreeExists,
        mockGetProjectSourceFiles,
      );

      // Verify all expected fields are present
      expect(result).toHaveProperty('normalizedSource');
      expect(result).toHaveProperty('normalizedTarget');
      expect(result).toHaveProperty('sourceProject');
      expect(result).toHaveProperty('sourceProjectName');
      expect(result).toHaveProperty('targetProject');
      expect(result).toHaveProperty('targetProjectName');
      expect(result).toHaveProperty('fileContent');
      expect(result).toHaveProperty('sourceRoot');
      expect(result).toHaveProperty('relativeFilePathInSource');
      expect(result).toHaveProperty('isExported');
      expect(result).toHaveProperty('sourceImportPath');
      expect(result).toHaveProperty('targetImportPath');
      expect(result).toHaveProperty('hasImportsInTarget');
      expect(result).toHaveProperty('isSameProject');
    });
  });
});
