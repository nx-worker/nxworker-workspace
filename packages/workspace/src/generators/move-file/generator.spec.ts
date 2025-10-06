import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import {
  Tree,
  addProjectConfiguration,
  updateJson,
  createProjectGraphAsync,
  formatFiles,
} from '@nx/devkit';

import { moveFileGenerator } from './generator';
import { MoveFileGeneratorSchema } from './schema';

jest.mock('@nx/devkit', () => {
  const actual = jest.requireActual('@nx/devkit');
  return {
    ...actual,
    formatFiles: jest.fn(),
    createProjectGraphAsync: jest.fn(),
  };
});

const createProjectGraphAsyncMock = jest.mocked(createProjectGraphAsync);
const formatFilesMock = jest.mocked(formatFiles);

describe('move-file generator', () => {
  let tree: Tree;

  beforeEach(() => {
    createProjectGraphAsyncMock.mockImplementation(async () => ({
      nodes: {},
      dependencies: {
        app1: [{ source: 'app1', target: 'lib1', type: 'static' }],
        lib1: [],
        lib2: [],
      },
    }));
    formatFilesMock.mockResolvedValue(undefined);

    tree = createTreeWithEmptyWorkspace();

    // Setup tsconfig.base.json with path mappings
    updateJson(tree, 'tsconfig.base.json', (json) => {
      json.compilerOptions = json.compilerOptions || {};
      json.compilerOptions.paths = {
        '@test/lib1': ['packages/lib1/src/index.ts'],
        '@test/lib2': ['packages/lib2/src/index.ts'],
      };
      return json;
    });

    // Add two test projects
    addProjectConfiguration(tree, 'lib1', {
      root: 'packages/lib1',
      sourceRoot: 'packages/lib1/src',
      projectType: 'library',
    });

    addProjectConfiguration(tree, 'lib2', {
      root: 'packages/lib2',
      sourceRoot: 'packages/lib2/src',
      projectType: 'library',
    });

    // Create index files
    tree.write('packages/lib1/src/index.ts', '');
    tree.write('packages/lib2/src/index.ts', '');
  });

  describe('moving within the same project', () => {
    it('should update dynamic imports to new relative paths', async () => {
      tree.write(
        'packages/lib1/src/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      tree.write(
        'packages/lib1/src/lazy.ts',
        "export async function load() { return import('./utils/helper'); }\n",
      );

      const options: MoveFileGeneratorSchema = {
        from: 'packages/lib1/src/utils/helper.ts',
        to: 'packages/lib1/src/features/helper.ts',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      const lazyContent = tree.read('packages/lib1/src/lazy.ts', 'utf-8');
      expect(lazyContent).toContain("import('./features/helper')");
    });

    it('should update chained dynamic imports to new relative paths', async () => {
      tree.write(
        'packages/lib1/src/utils/helper.ts',
        'export const HelperModule = {};',
      );

      tree.write(
        'packages/lib1/src/lazy-route.ts',
        "export const loadModule = () => import('./utils/helper').then(m => m.HelperModule);\n",
      );

      const options: MoveFileGeneratorSchema = {
        from: 'packages/lib1/src/utils/helper.ts',
        to: 'packages/lib1/src/features/helper.ts',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      const lazyContent = tree.read('packages/lib1/src/lazy-route.ts', 'utf-8');
      expect(lazyContent).toContain(
        "import('./features/helper').then(m => m.HelperModule)",
      );
    });
  });

  describe('moving a file that is not exported', () => {
    it('should move the file and update relative imports', async () => {
      // Setup: Create a file in lib1
      tree.write(
        'packages/lib1/src/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      // Create another file that imports it
      tree.write(
        'packages/lib1/src/main.ts',
        "import { helper } from './utils/helper';\n\nexport const result = helper();",
      );

      const options: MoveFileGeneratorSchema = {
        from: 'packages/lib1/src/utils/helper.ts',
        to: 'packages/lib2/src/utils/helper.ts',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // File should be moved
      expect(tree.exists('packages/lib1/src/utils/helper.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/utils/helper.ts')).toBe(true);

      // Content should be preserved
      const movedContent = tree.read(
        'packages/lib2/src/utils/helper.ts',
        'utf-8',
      );
      expect(movedContent).toContain('export function helper()');
    });

    it('should update imports in source project to use target import path', async () => {
      // Setup: Create a file in lib1
      tree.write(
        'packages/lib1/src/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      // Create another file that imports it
      tree.write(
        'packages/lib1/src/main.ts',
        "import { helper } from './utils/helper';\n\nexport const result = helper();",
      );

      const options: MoveFileGeneratorSchema = {
        from: 'packages/lib1/src/utils/helper.ts',
        to: 'packages/lib2/src/utils/helper.ts',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // Imports should be updated to use target import path
      const mainContent = tree.read('packages/lib1/src/main.ts', 'utf-8');
      expect(mainContent).toContain("from '@test/lib2'");
    });

    it('should update dynamic imports in source project to use target import path', async () => {
      tree.write(
        'packages/lib1/src/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      tree.write(
        'packages/lib1/src/lazy.ts',
        "export const load = () => import('./utils/helper').then(m => m.helper);\n",
      );

      const options: MoveFileGeneratorSchema = {
        from: 'packages/lib1/src/utils/helper.ts',
        to: 'packages/lib2/src/utils/helper.ts',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      const lazyContent = tree.read('packages/lib1/src/lazy.ts', 'utf-8');
      expect(lazyContent).toContain("import('@test/lib2').then(m => m.helper)");
    });
  });

  describe('moving a file that is exported', () => {
    it('should move the file and export it from target project', async () => {
      // Setup: Create a file and export it
      tree.write(
        'packages/lib1/src/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      tree.write(
        'packages/lib1/src/index.ts',
        "export * from './utils/helper';",
      );

      const options: MoveFileGeneratorSchema = {
        from: 'packages/lib1/src/utils/helper.ts',
        to: 'packages/lib2/src/utils/helper.ts',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // File should be moved
      expect(tree.exists('packages/lib1/src/utils/helper.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/utils/helper.ts')).toBe(true);

      // Target index should export it
      const targetIndex = tree.read('packages/lib2/src/index.ts', 'utf-8');
      expect(targetIndex).toContain("export * from './utils/helper'");
    });

    it('should update imports in dependent projects', async () => {
      // Setup: Create a file and export it
      tree.write(
        'packages/lib1/src/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      tree.write(
        'packages/lib1/src/index.ts',
        "export * from './utils/helper';",
      );

      // Create a third project that depends on lib1
      addProjectConfiguration(tree, 'app1', {
        root: 'packages/app1',
        sourceRoot: 'packages/app1/src',
        projectType: 'application',
      });

      tree.write(
        'packages/app1/src/main.ts',
        "import { helper } from '@test/lib1';\nexport const load = () => import('@test/lib1').then(m => m.helper);\nconsole.log(helper());",
      );

      const options: MoveFileGeneratorSchema = {
        from: 'packages/lib1/src/utils/helper.ts',
        to: 'packages/lib2/src/utils/helper.ts',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // App should now import from lib2
      const appContent = tree.read('packages/app1/src/main.ts', 'utf-8');
      expect(appContent).toContain("from '@test/lib2'");
      expect(appContent).toContain("import('@test/lib2').then(m => m.helper)");
    });

    it('should remove export from source index when file is moved', async () => {
      // Setup: Create two files and export both
      tree.write(
        'packages/lib1/src/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      tree.write(
        'packages/lib1/src/utils/other.ts',
        'export function other() { return "world"; }',
      );

      tree.write(
        'packages/lib1/src/index.ts',
        "export * from './utils/helper';\nexport * from './utils/other';",
      );

      const options: MoveFileGeneratorSchema = {
        from: 'packages/lib1/src/utils/helper.ts',
        to: 'packages/lib2/src/utils/helper.ts',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // Source index should have removed the helper export but kept other
      const sourceIndex = tree.read('packages/lib1/src/index.ts', 'utf-8');
      expect(sourceIndex).not.toContain("export * from './utils/helper'");
      expect(sourceIndex).toContain("export * from './utils/other'");
    });

    it('should add empty export when removing last export from source index', async () => {
      // Setup: Create a file and export it (the only export)
      tree.write(
        'packages/lib1/src/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      tree.write(
        'packages/lib1/src/index.ts',
        "export * from './utils/helper';",
      );

      const options: MoveFileGeneratorSchema = {
        from: 'packages/lib1/src/utils/helper.ts',
        to: 'packages/lib2/src/utils/helper.ts',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // Source index should have export {} to prevent runtime errors
      const sourceIndex = tree.read('packages/lib1/src/index.ts', 'utf-8');
      expect(sourceIndex).not.toContain("export * from './utils/helper'");
      expect(sourceIndex?.trim()).toBe('export {};');
    });

    it('should handle export { Named } from pattern', async () => {
      tree.write(
        'packages/lib1/src/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      tree.write(
        'packages/lib1/src/index.ts',
        "export { helper } from './utils/helper';",
      );

      // Create a third project that depends on lib1
      addProjectConfiguration(tree, 'app1', {
        root: 'packages/app1',
        sourceRoot: 'packages/app1/src',
        projectType: 'application',
      });

      tree.write(
        'packages/app1/src/main.ts',
        "import { helper } from '@test/lib1';\n\nconsole.log(helper());",
      );

      const options: MoveFileGeneratorSchema = {
        from: 'packages/lib1/src/utils/helper.ts',
        to: 'packages/lib2/src/utils/helper.ts',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // App should now import from lib2
      const appContent = tree.read('packages/app1/src/main.ts', 'utf-8');
      expect(appContent).toContain("from '@test/lib2'");

      // Check that lib1's index was updated or file removed (depending on implementation)
      expect(tree.exists('packages/lib1/src/utils/helper.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/utils/helper.ts')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should throw error if source file does not exist', async () => {
      const options: MoveFileGeneratorSchema = {
        from: 'packages/lib1/src/utils/non-existent.ts',
        to: 'packages/lib2/src/utils/non-existent.ts',
        skipFormat: true,
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        'Source file "packages/lib1/src/utils/non-existent.ts" not found',
      );
    });

    it('should throw error if source project cannot be determined', async () => {
      // Create a file that doesn't belong to any project
      tree.write(
        'unknown/path/helper.ts',
        'export function helper() { return "hello"; }',
      );

      const options: MoveFileGeneratorSchema = {
        from: 'unknown/path/helper.ts',
        to: 'packages/lib2/src/helper.ts',
        skipFormat: true,
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        'Could not determine source project for file',
      );
    });

    it('should throw error if target project cannot be determined', async () => {
      tree.write(
        'packages/lib1/src/helper.ts',
        'export function helper() { return "hello"; }',
      );

      const options: MoveFileGeneratorSchema = {
        from: 'packages/lib1/src/helper.ts',
        to: 'unknown/path/helper.ts',
        skipFormat: true,
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        'Could not determine target project for file',
      );
    });

    it('should throw error if target file already exists', async () => {
      tree.write(
        'packages/lib1/src/helper.ts',
        'export function helper() { return "hello"; }',
      );
      tree.write(
        'packages/lib2/src/helper.ts',
        'export function existingHelper() { return "exists"; }',
      );

      const options: MoveFileGeneratorSchema = {
        from: 'packages/lib1/src/helper.ts',
        to: 'packages/lib2/src/helper.ts',
        skipFormat: true,
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        'Target file "packages/lib2/src/helper.ts" already exists',
      );
    });

    it('should throw error for path traversal in source', async () => {
      const options: MoveFileGeneratorSchema = {
        from: '../../../etc/passwd',
        to: 'packages/lib2/src/helper.ts',
        skipFormat: true,
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        'Invalid path: path traversal detected',
      );
    });

    it('should throw error for path traversal in target', async () => {
      tree.write(
        'packages/lib1/src/helper.ts',
        'export function helper() { return "hello"; }',
      );

      const options: MoveFileGeneratorSchema = {
        from: 'packages/lib1/src/helper.ts',
        to: '../../etc/passwd',
        skipFormat: true,
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        'Invalid path: path traversal detected',
      );
    });

    it('should reject source containing disallowed characters', async () => {
      // user attempts to pass a regex-like string
      const options: MoveFileGeneratorSchema = {
        from: 'packages/lib1/src/[evil*].ts',
        to: 'packages/lib2/src/helper.ts',
        skipFormat: true,
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        /Invalid path input for 'from': contains disallowed characters/,
      );
    });

    it('should reject target containing disallowed characters', async () => {
      const options: MoveFileGeneratorSchema = {
        from: 'packages/lib1/src/helper.ts',
        to: 'packages/lib2/src/(bad).ts',
        skipFormat: true,
      };

      // Ensure source exists to reach the validation of target
      tree.write('packages/lib1/src/helper.ts', 'export const a = 1;');

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        /Invalid path input for 'to': contains disallowed characters/,
      );
    });

    it('should allow unicode when allowUnicode option is true', async () => {
      // Setup: Create a file with unicode name in lib1
      tree.write('packages/lib1/src/файл.ts', 'export const a = 1;');

      const options: MoveFileGeneratorSchema = {
        from: 'packages/lib1/src/файл.ts',
        to: 'packages/lib2/src/файл.ts',
        skipFormat: true,
        allowUnicode: true,
      } as MoveFileGeneratorSchema;

      await moveFileGenerator(tree, options);

      expect(tree.exists('packages/lib2/src/файл.ts')).toBe(true);
      expect(tree.exists('packages/lib1/src/файл.ts')).toBe(false);
    });
  });
});
