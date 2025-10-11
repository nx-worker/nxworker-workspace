import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import {
  Tree,
  addProjectConfiguration,
  updateJson,
  createProjectGraphAsync,
  formatFiles,
  logger,
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

jest.mock('@nx/workspace', () => ({
  ...jest.requireActual('@nx/workspace'),
  removeGenerator: jest.fn(),
}));

const createProjectGraphAsyncMock = jest.mocked(createProjectGraphAsync);
const formatFilesMock = jest.mocked(formatFiles);
const { removeGenerator: removeGeneratorMock } =
  jest.requireMock('@nx/workspace');

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
    removeGeneratorMock.mockResolvedValue(undefined);

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
        'packages/lib1/src/lib/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      tree.write(
        'packages/lib1/src/lib/lazy.ts',
        "export async function load() { return import('./utils/helper'); }\n",
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils/helper.ts',
        project: 'lib1',
        projectDirectory: 'features',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      const lazyContent = tree.read('packages/lib1/src/lib/lazy.ts', 'utf-8');
      expect(lazyContent).toContain("import('./features/helper')");
    });

    it('should update chained dynamic imports to new relative paths', async () => {
      tree.write(
        'packages/lib1/src/lib/utils/helper.ts',
        'export const HelperModule = {};',
      );

      tree.write(
        'packages/lib1/src/lib/lazy-route.ts',
        "export const loadModule = () => import('./utils/helper').then(m => m.HelperModule);\n",
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils/helper.ts',
        project: 'lib1',
        projectDirectory: 'features',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      const lazyContent = tree.read(
        'packages/lib1/src/lib/lazy-route.ts',
        'utf-8',
      );
      expect(lazyContent).toContain(
        "import('./features/helper').then(m => m.HelperModule)",
      );
    });
  });

  describe('lazy project graph resolution', () => {
    it('should not create project graph for same-project moves', async () => {
      // Reset the mock to track calls
      createProjectGraphAsyncMock.mockClear();

      tree.write(
        'packages/lib1/src/lib/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      tree.write(
        'packages/lib1/src/lib/main.ts',
        "import { helper } from './utils/helper';\n\nexport const result = helper();",
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils/helper.ts',
        project: 'lib1',
        projectDirectory: 'features',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // Verify project graph was never created for same-project move
      expect(createProjectGraphAsyncMock).not.toHaveBeenCalled();

      // Verify the move still worked correctly
      expect(tree.exists('packages/lib1/src/lib/features/helper.ts')).toBe(
        true,
      );
      expect(tree.exists('packages/lib1/src/lib/utils/helper.ts')).toBe(false);

      const mainContent = tree.read('packages/lib1/src/lib/main.ts', 'utf-8');
      expect(mainContent).toContain(
        "import { helper } from './features/helper'",
      );
    });

    it('should create project graph only for cross-project exported moves', async () => {
      // Reset the mock to track calls
      createProjectGraphAsyncMock.mockClear();

      // Create an exported file in lib1
      tree.write(
        'packages/lib1/src/lib/exported-util.ts',
        'export function exportedUtil() { return "exported"; }',
      );

      // Export it from lib1's index
      tree.write(
        'packages/lib1/src/index.ts',
        "export * from './lib/exported-util';",
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/exported-util.ts',
        project: 'lib2',
        projectDirectory: 'utils',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // Verify project graph was created for cross-project exported move
      expect(createProjectGraphAsyncMock).toHaveBeenCalledTimes(1);

      // Verify the move worked correctly
      expect(tree.exists('packages/lib2/src/lib/utils/exported-util.ts')).toBe(
        true,
      );
      expect(tree.exists('packages/lib1/src/lib/exported-util.ts')).toBe(false);
    });

    it('should not create project graph for cross-project non-exported moves', async () => {
      // Reset the mock to track calls
      createProjectGraphAsyncMock.mockClear();

      // Create a non-exported file in lib1
      tree.write(
        'packages/lib1/src/lib/internal-util.ts',
        'export function internalUtil() { return "internal"; }',
      );

      // DO NOT export it from index
      tree.write('packages/lib1/src/index.ts', '');

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/internal-util.ts',
        project: 'lib2',
        projectDirectory: 'utils',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // Verify project graph was not created for non-exported move
      expect(createProjectGraphAsyncMock).not.toHaveBeenCalled();

      // Verify the move worked correctly
      expect(tree.exists('packages/lib2/src/lib/utils/internal-util.ts')).toBe(
        true,
      );
      expect(tree.exists('packages/lib1/src/lib/internal-util.ts')).toBe(false);
    });
  });

  describe('moving a file that is not exported', () => {
    it('should move the file and update relative imports', async () => {
      // Setup: Create a file in lib1
      tree.write(
        'packages/lib1/src/lib/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      // Create another file that imports it
      tree.write(
        'packages/lib1/src/lib/main.ts',
        "import { helper } from './utils/helper';\n\nexport const result = helper();",
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils/helper.ts',
        project: 'lib2',
        projectDirectory: 'utils',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // File should be moved
      expect(tree.exists('packages/lib1/src/lib/utils/helper.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/lib/utils/helper.ts')).toBe(true);

      // Content should be preserved
      const movedContent = tree.read(
        'packages/lib2/src/lib/utils/helper.ts',
        'utf-8',
      );
      expect(movedContent).toContain('export function helper()');
    });

    it('should use default "lib" directory when projectDirectory is not specified', async () => {
      tree.write(
        'packages/lib1/src/lib/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils/helper.ts',
        project: 'lib2',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // Target: packages/lib2/src/lib/helper.ts
      expect(tree.exists('packages/lib1/src/lib/utils/helper.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/lib/helper.ts')).toBe(true);

      const movedContent = tree.read(
        'packages/lib2/src/lib/helper.ts',
        'utf-8',
      );
      expect(movedContent).toContain('export function helper()');
    });

    it('should use "app" directory for application projects', async () => {
      // Add an application project
      addProjectConfiguration(tree, 'app1', {
        root: 'packages/app1',
        sourceRoot: 'packages/app1/src',
        projectType: 'application',
      });

      tree.write(
        'packages/lib1/src/lib/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils/helper.ts',
        project: 'app1',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // Target: packages/app1/src/app/helper.ts
      expect(tree.exists('packages/lib1/src/lib/utils/helper.ts')).toBe(false);
      expect(tree.exists('packages/app1/src/app/helper.ts')).toBe(true);

      const movedContent = tree.read(
        'packages/app1/src/app/helper.ts',
        'utf-8',
      );
      expect(movedContent).toContain('export function helper()');
    });

    it('should append projectDirectory to "app" for application projects', async () => {
      // Add an application project
      addProjectConfiguration(tree, 'app1', {
        root: 'packages/app1',
        sourceRoot: 'packages/app1/src',
        projectType: 'application',
      });

      tree.write(
        'packages/lib1/src/lib/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils/helper.ts',
        project: 'app1',
        projectDirectory: 'utils',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // Target: packages/app1/src/app/utils/helper.ts
      expect(tree.exists('packages/lib1/src/lib/utils/helper.ts')).toBe(false);
      expect(tree.exists('packages/app1/src/app/utils/helper.ts')).toBe(true);

      const movedContent = tree.read(
        'packages/app1/src/app/utils/helper.ts',
        'utf-8',
      );
      expect(movedContent).toContain('export function helper()');
    });

    it('should update imports in source project to use target import path', async () => {
      // Setup: Create a file in lib1
      tree.write(
        'packages/lib1/src/lib/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      // Create another file that imports it
      tree.write(
        'packages/lib1/src/lib/main.ts',
        "import { helper } from './utils/helper';\n\nexport const result = helper();",
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils/helper.ts',
        project: 'lib2',
        projectDirectory: 'utils',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // Imports should be updated to use target import path
      const mainContent = tree.read('packages/lib1/src/lib/main.ts', 'utf-8');
      expect(mainContent).toContain("from '@test/lib2'");
    });

    it('should update dynamic imports in source project to use target import path', async () => {
      tree.write(
        'packages/lib1/src/lib/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      tree.write(
        'packages/lib1/src/lib/lazy.ts',
        "export const load = () => import('./utils/helper').then(m => m.helper);\n",
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils/helper.ts',
        project: 'lib2',
        projectDirectory: 'utils',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      const lazyContent = tree.read('packages/lib1/src/lib/lazy.ts', 'utf-8');
      expect(lazyContent).toContain("import('@test/lib2').then(m => m.helper)");
    });

    it('should handle files with dots in the filename', async () => {
      // Test files with multiple dots in name (e.g., util.helper.ts)
      tree.write(
        'packages/lib1/src/lib/util.helper.ts',
        'export function utilHelper() { return "hello"; }',
      );

      tree.write(
        'packages/lib1/src/lib/main.ts',
        "import { utilHelper } from './util.helper';\n\nexport const result = utilHelper();",
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/util.helper.ts',
        project: 'lib1',
        projectDirectory: 'helpers',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // File should be moved
      expect(tree.exists('packages/lib1/src/lib/util.helper.ts')).toBe(false);
      expect(tree.exists('packages/lib1/src/lib/helpers/util.helper.ts')).toBe(
        true,
      );

      // Import should be updated
      const mainContent = tree.read('packages/lib1/src/lib/main.ts', 'utf-8');
      expect(mainContent).toContain("from './helpers/util.helper'");
    });
  });

  describe('moving a file that is exported', () => {
    it('should move the file and export it from target project', async () => {
      // Setup: Create a file and export it
      tree.write(
        'packages/lib1/src/lib/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      tree.write(
        'packages/lib1/src/index.ts',
        "export * from './lib/utils/helper';",
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils/helper.ts',
        project: 'lib2',
        projectDirectory: 'utils',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // File should be moved
      expect(tree.exists('packages/lib1/src/lib/utils/helper.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/lib/utils/helper.ts')).toBe(true);

      // Target index should export it
      const targetIndex = tree.read('packages/lib2/src/index.ts', 'utf-8');
      expect(targetIndex).toContain("export * from './lib/utils/helper'");
    });

    it('should update imports in dependent projects', async () => {
      // Setup: Create a file and export it
      tree.write(
        'packages/lib1/src/lib/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      tree.write(
        'packages/lib1/src/index.ts',
        "export * from './lib/utils/helper';",
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
        file: 'packages/lib1/src/lib/utils/helper.ts',
        project: 'lib2',
        projectDirectory: 'utils',
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
        'packages/lib1/src/lib/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      tree.write(
        'packages/lib1/src/lib/utils/other.ts',
        'export function other() { return "world"; }',
      );

      tree.write(
        'packages/lib1/src/index.ts',
        "export * from './lib/utils/helper';\nexport * from './lib/utils/other';",
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils/helper.ts',
        project: 'lib2',
        projectDirectory: 'utils',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // Source index should have removed the helper export but kept other
      const sourceIndex = tree.read('packages/lib1/src/index.ts', 'utf-8');
      expect(sourceIndex).not.toContain("export * from './lib/utils/helper'");
      expect(sourceIndex).toContain("export * from './lib/utils/other'");
    });

    it('should add empty export when removing last export from source index', async () => {
      // Setup: Create a file and export it (the only export)
      tree.write(
        'packages/lib1/src/lib/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      tree.write(
        'packages/lib1/src/index.ts',
        "export * from './lib/utils/helper';",
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils/helper.ts',
        project: 'lib2',
        projectDirectory: 'utils',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // Source index should have export {} to prevent runtime errors
      const sourceIndex = tree.read('packages/lib1/src/index.ts', 'utf-8');
      expect(sourceIndex).not.toContain("export * from './lib/utils/helper'");
      expect(sourceIndex?.trim()).toBe('export {};');
    });

    it('should handle export { Named } from pattern', async () => {
      tree.write(
        'packages/lib1/src/lib/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      tree.write(
        'packages/lib1/src/index.ts',
        "export { helper } from './lib/utils/helper';",
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
        file: 'packages/lib1/src/lib/utils/helper.ts',
        project: 'lib2',
        projectDirectory: 'utils',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // App should now import from lib2
      const appContent = tree.read('packages/app1/src/main.ts', 'utf-8');
      expect(appContent).toContain("from '@test/lib2'");

      // Check that lib1's index was updated or file removed (depending on implementation)
      expect(tree.exists('packages/lib1/src/lib/utils/helper.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/lib/utils/helper.ts')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should throw error if source file does not exist', async () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils/non-existent.ts',
        project: 'lib2',
        skipFormat: true,
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        'Source file "packages/lib1/src/lib/utils/non-existent.ts" not found',
      );
    });

    it('should throw error if source project cannot be determined', async () => {
      // Create a file that doesn't belong to any project
      tree.write(
        'unknown/path/helper.ts',
        'export function helper() { return "hello"; }',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'unknown/path/helper.ts',
        project: 'lib2',
        skipFormat: true,
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        'Could not determine source project for file',
      );
    });

    it('should throw error if target project does not exist', async () => {
      tree.write(
        'packages/lib1/src/lib/helper.ts',
        'export function helper() { return "hello"; }',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/helper.ts',
        project: 'unknown-project',
        skipFormat: true,
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        'Target project "unknown-project" not found in workspace',
      );
    });

    it('should throw error if target file already exists', async () => {
      tree.write(
        'packages/lib1/src/lib/helper.ts',
        'export function helper() { return "hello"; }',
      );
      tree.write(
        'packages/lib2/src/lib/helper.ts',
        'export function existingHelper() { return "exists"; }',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/helper.ts',
        project: 'lib2',
        skipFormat: true,
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        'Target file "packages/lib2/src/lib/helper.ts" already exists',
      );
    });

    it('should throw error for path traversal in source', async () => {
      const options: MoveFileGeneratorSchema = {
        file: '../../../etc/passwd',
        project: 'lib2',
        skipFormat: true,
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        'Invalid path: path traversal detected',
      );
    });

    it('should throw error for path traversal in projectDirectory', async () => {
      tree.write(
        'packages/lib1/src/lib/helper.ts',
        'export function helper() { return "hello"; }',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/helper.ts',
        project: 'lib2',
        projectDirectory: '../../etc',
        skipFormat: true,
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        'Invalid path: path traversal detected',
      );
    });

    it('should reject source containing disallowed characters', async () => {
      // user attempts to pass a string with parentheses (not allowed even with globs)
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/(evil).ts',
        project: 'lib2',
        skipFormat: true,
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        /Invalid path input for 'file': contains disallowed characters/,
      );
    });

    it('should reject projectDirectory containing disallowed characters', async () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/helper.ts',
        project: 'lib2',
        projectDirectory: '(bad)',
        skipFormat: true,
      };

      // Ensure source exists to reach the validation of projectDirectory
      tree.write('packages/lib1/src/lib/helper.ts', 'export const a = 1;');

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        /Invalid path input for 'projectDirectory': contains disallowed characters/,
      );
    });

    it('should reject unicode when allowUnicode is not set (defaults to false)', async () => {
      // Setup: Create a file with ASCII name but try to move to unicode directory
      tree.write('packages/lib1/src/lib/helper.ts', 'export const a = 1;');

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/helper.ts',
        project: 'lib2',
        projectDirectory: 'файл',
        skipFormat: true,
        // allowUnicode not set, should default to false
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        /Invalid path input for 'projectDirectory': contains disallowed characters/,
      );
    });

    it('should allow unicode when allowUnicode option is true', async () => {
      // Setup: Create a file with unicode name in lib1
      tree.write('packages/lib1/src/lib/файл.ts', 'export const a = 1;');

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/файл.ts',
        project: 'lib2',
        projectDirectory: 'файл',
        skipFormat: true,
        allowUnicode: true,
      } as MoveFileGeneratorSchema;

      await moveFileGenerator(tree, options);

      expect(tree.exists('packages/lib2/src/lib/файл/файл.ts')).toBe(true);
      expect(tree.exists('packages/lib1/src/lib/файл.ts')).toBe(false);
    });
  });

  describe('syncing imports after cross-project move', () => {
    it('should update relative imports in the moved file to alias imports to source project', async () => {
      // Create a shared utility in lib1
      tree.write(
        'packages/lib1/src/lib/utils/shared.ts',
        'export function shared() { return "shared"; }',
      );

      // Create helper file that imports shared relatively
      tree.write(
        'packages/lib1/src/lib/utils/helper.ts',
        "import { shared } from './shared';\nexport function helper() { return shared(); }",
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils/helper.ts',
        project: 'lib2',
        projectDirectory: 'utils',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // The moved file should now import shared using alias
      const movedContent = tree.read(
        'packages/lib2/src/lib/utils/helper.ts',
        'utf-8',
      );
      expect(movedContent).toContain("from '@test/lib1'");
      expect(movedContent).not.toContain("from './shared'");
    });

    it('should update imports in target project files to relative imports to the moved file', async () => {
      // Create a file that will be moved
      tree.write(
        'packages/lib1/src/lib/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );

      // Export it from lib1
      tree.write(
        'packages/lib1/src/index.ts',
        "export * from './lib/utils/helper';",
      );

      // Create a file in lib2 that imports from lib1
      tree.write(
        'packages/lib2/src/lib/feature.ts',
        "import { helper } from '@test/lib1';\nexport const result = helper();",
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils/helper.ts',
        project: 'lib2',
        projectDirectory: 'utils',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // The file in lib2 should now use relative import to helper
      const featureContent = tree.read(
        'packages/lib2/src/lib/feature.ts',
        'utf-8',
      );
      expect(featureContent).toContain("from './utils/helper'");
      expect(featureContent).not.toContain("from '@test/lib1'");
    });

    it('should update both moved file imports and target project imports together', async () => {
      // Setup source project with shared utility
      tree.write(
        'packages/lib1/src/lib/utils/shared.ts',
        'export function shared() { return "shared"; }',
      );

      // Create helper that imports shared
      tree.write(
        'packages/lib1/src/lib/utils/helper.ts',
        "import { shared } from './shared';\nexport function helper() { return shared(); }",
      );

      // Export helper from lib1
      tree.write(
        'packages/lib1/src/index.ts',
        "export * from './lib/utils/helper';",
      );

      // Create target project file that imports helper via alias
      tree.write(
        'packages/lib2/src/lib/feature.ts',
        "import { helper } from '@test/lib1';\nexport const result = helper();",
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils/helper.ts',
        project: 'lib2',
        projectDirectory: 'utils',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // Moved file should import shared via alias
      const movedContent = tree.read(
        'packages/lib2/src/lib/utils/helper.ts',
        'utf-8',
      );
      expect(movedContent).toContain("from '@test/lib1'");

      // Target project file should use relative import
      const featureContent = tree.read(
        'packages/lib2/src/lib/feature.ts',
        'utf-8',
      );
      expect(featureContent).toContain("from './utils/helper'");
    });

    it('should handle dynamic imports in the moved file', async () => {
      // Create shared utility
      tree.write(
        'packages/lib1/src/lib/utils/shared.ts',
        'export function shared() { return "shared"; }',
      );

      // Create helper with dynamic import
      tree.write(
        'packages/lib1/src/lib/utils/helper.ts',
        "export async function helper() { const m = await import('./shared'); return m.shared(); }",
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils/helper.ts',
        project: 'lib2',
        projectDirectory: 'utils',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // Dynamic import should be updated to alias
      const movedContent = tree.read(
        'packages/lib2/src/lib/utils/helper.ts',
        'utf-8',
      );
      expect(movedContent).toContain("import('@test/lib1')");
    });

    it('should not modify imports when moving within the same project', async () => {
      // Create shared utility
      tree.write(
        'packages/lib1/src/lib/utils/shared.ts',
        'export function shared() { return "shared"; }',
      );

      // Create helper that imports shared relatively
      tree.write(
        'packages/lib1/src/lib/utils/helper.ts',
        "import { shared } from './shared';\nexport function helper() { return shared(); }",
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils/helper.ts',
        project: 'lib1',
        projectDirectory: 'features',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // Imports should remain relative (not converted to alias)
      const movedContent = tree.read(
        'packages/lib1/src/lib/features/helper.ts',
        'utf-8',
      );
      expect(movedContent).toContain("from '../utils/shared'");
      expect(movedContent).not.toContain("from '@test/lib1'");
    });

    it('should log warning when converting relative import to alias for non-exported file', async () => {
      // Create a shared utility that is NOT exported
      tree.write(
        'packages/lib1/src/lib/utils/shared.ts',
        'export function shared() { return "shared"; }',
      );

      // lib1 index does NOT export shared
      tree.write('packages/lib1/src/index.ts', '');

      // Create helper file that imports shared relatively
      tree.write(
        'packages/lib1/src/lib/utils/helper.ts',
        "import { shared } from './shared';\nexport function helper() { return shared(); }",
      );

      // Spy on logger.warn
      const warnSpy = jest.spyOn(logger, 'warn');

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils/helper.ts',
        project: 'lib2',
        projectDirectory: 'utils',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // Should have logged a warning about the non-exported file
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "is being converted to '@test/lib1', but the imported file is not exported from the source project's entrypoint",
        ),
      );

      warnSpy.mockRestore();
    });
  });

  describe('multiple file moves', () => {
    it('should move multiple files separated by commas', async () => {
      // Create multiple related files
      tree.write(
        'packages/lib1/src/lib/calendar/calendar.component.ts',
        'export class CalendarComponent {}',
      );
      tree.write(
        'packages/lib1/src/lib/calendar/calendar.component.html',
        '<div>Calendar</div>',
      );
      tree.write(
        'packages/lib1/src/lib/calendar/calendar.component.css',
        '.calendar { color: blue; }',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/calendar/calendar.component.ts, packages/lib1/src/lib/calendar/calendar.component.html, packages/lib1/src/lib/calendar/calendar.component.css',
        project: 'lib2',
        projectDirectory: 'components',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // All files should be moved
      expect(
        tree.exists('packages/lib1/src/lib/calendar/calendar.component.ts'),
      ).toBe(false);
      expect(
        tree.exists('packages/lib1/src/lib/calendar/calendar.component.html'),
      ).toBe(false);
      expect(
        tree.exists('packages/lib1/src/lib/calendar/calendar.component.css'),
      ).toBe(false);

      expect(
        tree.exists('packages/lib2/src/lib/components/calendar.component.ts'),
      ).toBe(true);
      expect(
        tree.exists('packages/lib2/src/lib/components/calendar.component.html'),
      ).toBe(true);
      expect(
        tree.exists('packages/lib2/src/lib/components/calendar.component.css'),
      ).toBe(true);

      // Content should be preserved
      const tsContent = tree.read(
        'packages/lib2/src/lib/components/calendar.component.ts',
        'utf-8',
      );
      expect(tsContent).toContain('export class CalendarComponent');
    });

    it('should handle whitespace in comma-separated file list', async () => {
      tree.write(
        'packages/lib1/src/lib/file1.ts',
        'export const file1 = "test";',
      );
      tree.write(
        'packages/lib1/src/lib/file2.ts',
        'export const file2 = "test";',
      );

      const options: MoveFileGeneratorSchema = {
        file: '  packages/lib1/src/lib/file1.ts  ,  packages/lib1/src/lib/file2.ts  ',
        project: 'lib2',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      expect(tree.exists('packages/lib1/src/lib/file1.ts')).toBe(false);
      expect(tree.exists('packages/lib1/src/lib/file2.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/lib/file1.ts')).toBe(true);
      expect(tree.exists('packages/lib2/src/lib/file2.ts')).toBe(true);
    });

    it('should handle comma-separated files without spaces', async () => {
      tree.write(
        'packages/lib1/src/lib/file1.ts',
        'export const file1 = "test";',
      );
      tree.write(
        'packages/lib1/src/lib/file2.ts',
        'export const file2 = "test";',
      );
      tree.write(
        'packages/lib1/src/lib/file3.ts',
        'export const file3 = "test";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/file1.ts,packages/lib1/src/lib/file2.ts,packages/lib1/src/lib/file3.ts',
        project: 'lib2',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      expect(tree.exists('packages/lib1/src/lib/file1.ts')).toBe(false);
      expect(tree.exists('packages/lib1/src/lib/file2.ts')).toBe(false);
      expect(tree.exists('packages/lib1/src/lib/file3.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/lib/file1.ts')).toBe(true);
      expect(tree.exists('packages/lib2/src/lib/file2.ts')).toBe(true);
      expect(tree.exists('packages/lib2/src/lib/file3.ts')).toBe(true);
    });

    it('should update imports from one file to another in the same batch', async () => {
      // Create two files where one imports the other
      tree.write(
        'packages/lib1/src/lib/utils/helper.ts',
        'export function helper() { return "hello"; }',
      );
      tree.write(
        'packages/lib1/src/lib/utils/consumer.ts',
        "import { helper } from './helper';\nexport const result = helper();",
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils/helper.ts, packages/lib1/src/lib/utils/consumer.ts',
        project: 'lib2',
        projectDirectory: 'utils',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // Both files should be moved
      expect(tree.exists('packages/lib1/src/lib/utils/helper.ts')).toBe(false);
      expect(tree.exists('packages/lib1/src/lib/utils/consumer.ts')).toBe(
        false,
      );
      expect(tree.exists('packages/lib2/src/lib/utils/helper.ts')).toBe(true);
      expect(tree.exists('packages/lib2/src/lib/utils/consumer.ts')).toBe(true);

      // The import should still work (relative path should be maintained)
      const consumerContent = tree.read(
        'packages/lib2/src/lib/utils/consumer.ts',
        'utf-8',
      );
      // After cross-project move, relative imports to source project files
      // should be converted to alias imports
      expect(consumerContent).toContain("from '@test/lib1'");
    });

    it('should move multiple files within the same project', async () => {
      tree.write(
        'packages/lib1/src/lib/utils/helper1.ts',
        'export function helper1() { return "hello"; }',
      );
      tree.write(
        'packages/lib1/src/lib/utils/helper2.ts',
        'export function helper2() { return "world"; }',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils/helper1.ts, packages/lib1/src/lib/utils/helper2.ts',
        project: 'lib1',
        projectDirectory: 'features',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      expect(tree.exists('packages/lib1/src/lib/utils/helper1.ts')).toBe(false);
      expect(tree.exists('packages/lib1/src/lib/utils/helper2.ts')).toBe(false);
      expect(tree.exists('packages/lib1/src/lib/features/helper1.ts')).toBe(
        true,
      );
      expect(tree.exists('packages/lib1/src/lib/features/helper2.ts')).toBe(
        true,
      );
    });

    it('should throw error if any file in the list does not exist', async () => {
      tree.write(
        'packages/lib1/src/lib/file1.ts',
        'export const file1 = "test";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/file1.ts, packages/lib1/src/lib/non-existent.ts',
        project: 'lib2',
        skipFormat: true,
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        'Source file "packages/lib1/src/lib/non-existent.ts" not found',
      );
    });

    it('should move files from multiple source projects to one target project', async () => {
      // Create files in different source projects
      tree.write(
        'packages/lib1/src/lib/file1.ts',
        'export const file1 = "from lib1";',
      );
      tree.write(
        'packages/lib2/src/lib/file2.ts',
        'export const file2 = "from lib2";',
      );

      // Add a third project to move files to
      addProjectConfiguration(tree, 'lib3', {
        root: 'packages/lib3',
        sourceRoot: 'packages/lib3/src',
        projectType: 'library',
      });
      tree.write('packages/lib3/src/index.ts', '');

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/file1.ts,packages/lib2/src/lib/file2.ts',
        project: 'lib3',
        projectDirectory: 'shared',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // Both files should be removed from their original locations
      expect(tree.exists('packages/lib1/src/lib/file1.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/lib/file2.ts')).toBe(false);

      // Both files should exist in the target project
      expect(tree.exists('packages/lib3/src/lib/shared/file1.ts')).toBe(true);
      expect(tree.exists('packages/lib3/src/lib/shared/file2.ts')).toBe(true);

      // Content should be preserved
      const file1Content = tree.read(
        'packages/lib3/src/lib/shared/file1.ts',
        'utf-8',
      );
      const file2Content = tree.read(
        'packages/lib3/src/lib/shared/file2.ts',
        'utf-8',
      );
      expect(file1Content).toContain('from lib1');
      expect(file2Content).toContain('from lib2');
    });

    it('should throw error if empty file list is provided', async () => {
      const options: MoveFileGeneratorSchema = {
        file: '',
        project: 'lib2',
        skipFormat: true,
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        'At least one file path or glob pattern must be provided',
      );
    });

    it('should throw error if only whitespace is provided', async () => {
      const options: MoveFileGeneratorSchema = {
        file: '  ,  ,  ',
        project: 'lib2',
        skipFormat: true,
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        'At least one file path or glob pattern must be provided',
      );
    });
  });

  describe('glob pattern support', () => {
    it('should move files matching a simple glob pattern', async () => {
      // Create multiple files
      tree.write(
        'packages/lib1/src/lib/file1.ts',
        'export const file1 = "test1";',
      );
      tree.write(
        'packages/lib1/src/lib/file2.ts',
        'export const file2 = "test2";',
      );
      tree.write(
        'packages/lib1/src/lib/file3.ts',
        'export const file3 = "test3";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/file*.ts',
        project: 'lib2',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // All matching files should be moved
      expect(tree.exists('packages/lib1/src/lib/file1.ts')).toBe(false);
      expect(tree.exists('packages/lib1/src/lib/file2.ts')).toBe(false);
      expect(tree.exists('packages/lib1/src/lib/file3.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/lib/file1.ts')).toBe(true);
      expect(tree.exists('packages/lib2/src/lib/file2.ts')).toBe(true);
      expect(tree.exists('packages/lib2/src/lib/file3.ts')).toBe(true);
    });

    it('should move files matching a recursive glob pattern', async () => {
      // Create nested files
      tree.write(
        'packages/lib1/src/lib/utils/helper.spec.ts',
        'export const test1 = "test";',
      );
      tree.write(
        'packages/lib1/src/lib/services/api.spec.ts',
        'export const test2 = "test";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/**/*.spec.ts',
        project: 'lib2',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // All spec files should be moved
      expect(tree.exists('packages/lib1/src/lib/utils/helper.spec.ts')).toBe(
        false,
      );
      expect(tree.exists('packages/lib1/src/lib/services/api.spec.ts')).toBe(
        false,
      );
      expect(tree.exists('packages/lib2/src/lib/helper.spec.ts')).toBe(true);
      expect(tree.exists('packages/lib2/src/lib/api.spec.ts')).toBe(true);
    });

    it('should handle comma-separated glob patterns', async () => {
      // Create files with different extensions
      tree.write(
        'packages/lib1/src/lib/component.ts',
        'export class Component {}',
      );
      tree.write(
        'packages/lib1/src/lib/component.html',
        '<div>Component</div>',
      );
      tree.write(
        'packages/lib1/src/lib/component.css',
        '.component { color: red; }',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/component.ts,packages/lib1/src/lib/component.html,packages/lib1/src/lib/component.css',
        project: 'lib2',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // All files should be moved
      expect(tree.exists('packages/lib1/src/lib/component.ts')).toBe(false);
      expect(tree.exists('packages/lib1/src/lib/component.html')).toBe(false);
      expect(tree.exists('packages/lib1/src/lib/component.css')).toBe(false);
      expect(tree.exists('packages/lib2/src/lib/component.ts')).toBe(true);
      expect(tree.exists('packages/lib2/src/lib/component.html')).toBe(true);
      expect(tree.exists('packages/lib2/src/lib/component.css')).toBe(true);
    });

    it('should combine direct paths and glob patterns', async () => {
      tree.write(
        'packages/lib1/src/lib/main.ts',
        'export const main = "test";',
      );
      tree.write(
        'packages/lib1/src/lib/test1.spec.ts',
        'export const test1 = "test";',
      );
      tree.write(
        'packages/lib1/src/lib/test2.spec.ts',
        'export const test2 = "test";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/main.ts,packages/lib1/src/lib/*.spec.ts',
        project: 'lib2',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      expect(tree.exists('packages/lib1/src/lib/main.ts')).toBe(false);
      expect(tree.exists('packages/lib1/src/lib/test1.spec.ts')).toBe(false);
      expect(tree.exists('packages/lib1/src/lib/test2.spec.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/lib/main.ts')).toBe(true);
      expect(tree.exists('packages/lib2/src/lib/test1.spec.ts')).toBe(true);
      expect(tree.exists('packages/lib2/src/lib/test2.spec.ts')).toBe(true);
    });

    it('should throw error if glob pattern matches no files', async () => {
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/**/*.nonexistent.ts',
        project: 'lib2',
        skipFormat: true,
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        'No files found matching glob pattern',
      );
    });

    it('should handle glob patterns with braces', async () => {
      tree.write(
        'packages/lib1/src/lib/file.ts',
        'export const file = "test";',
      );
      tree.write(
        'packages/lib1/src/lib/file.js',
        'export const file = "test";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/file.{ts,js}',
        project: 'lib2',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      expect(tree.exists('packages/lib1/src/lib/file.ts')).toBe(false);
      expect(tree.exists('packages/lib1/src/lib/file.js')).toBe(false);
      expect(tree.exists('packages/lib2/src/lib/file.ts')).toBe(true);
      expect(tree.exists('packages/lib2/src/lib/file.js')).toBe(true);
    });

    it('should remove duplicate files when multiple patterns match the same file', async () => {
      tree.write(
        'packages/lib1/src/lib/file.ts',
        'export const file = "test";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/file.ts,packages/lib1/src/lib/*.ts',
        project: 'lib2',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // File should only be moved once
      expect(tree.exists('packages/lib1/src/lib/file.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/lib/file.ts')).toBe(true);
    });

    it('should handle glob patterns with backslashes (Windows path separators)', async () => {
      tree.write(
        'packages/lib1/src/lib/test1.spec.ts',
        'export const test1 = "test";',
      );
      tree.write(
        'packages/lib1/src/lib/test2.spec.ts',
        'export const test2 = "test";',
      );

      // Use backslashes like on Windows
      const options: MoveFileGeneratorSchema = {
        file: 'packages\\lib1\\src\\lib\\*.spec.ts',
        project: 'lib2',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // Files should be moved despite backslashes in pattern
      expect(tree.exists('packages/lib1/src/lib/test1.spec.ts')).toBe(false);
      expect(tree.exists('packages/lib1/src/lib/test2.spec.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/lib/test1.spec.ts')).toBe(true);
      expect(tree.exists('packages/lib2/src/lib/test2.spec.ts')).toBe(true);
    });

    it('should handle direct file paths with backslashes (Windows path separators)', async () => {
      tree.write(
        'packages/lib1/src/lib/component.ts',
        'export const component = "test";',
      );

      // Use backslashes like on Windows for a direct file path (not a glob)
      const options: MoveFileGeneratorSchema = {
        file: 'packages\\lib1\\src\\lib\\component.ts',
        project: 'lib2',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // File should be moved despite backslashes in path
      expect(tree.exists('packages/lib1/src/lib/component.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/lib/component.ts')).toBe(true);
    });
  });

  describe('removeEmptyProject option', () => {
    beforeEach(() => {
      // Reset the mock before each test
      removeGeneratorMock.mockClear();
    });

    it('should remove source project when it becomes empty and removeEmptyProject is true', async () => {
      // Create a project with only one file
      tree.write(
        'packages/lib1/src/lib/only-file.ts',
        'export const onlyFile = "test";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/only-file.ts',
        project: 'lib2',
        removeEmptyProject: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // The file should be moved
      expect(tree.exists('packages/lib1/src/lib/only-file.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/lib/only-file.ts')).toBe(true);

      // The remove generator should have been called for lib1
      expect(removeGeneratorMock).toHaveBeenCalledWith(tree, {
        projectName: 'lib1',
        skipFormat: true,
        forceRemove: false,
      });
    });

    it('should NOT remove source project when removeEmptyProject is false', async () => {
      // Create a project with only one file
      tree.write(
        'packages/lib1/src/lib/only-file.ts',
        'export const onlyFile = "test";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/only-file.ts',
        project: 'lib2',
        removeEmptyProject: false,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // The file should be moved
      expect(tree.exists('packages/lib1/src/lib/only-file.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/lib/only-file.ts')).toBe(true);

      // The remove generator should NOT have been called
      expect(removeGeneratorMock).not.toHaveBeenCalled();
    });

    it('should NOT remove source project when it still has other source files', async () => {
      // Create a project with multiple files
      tree.write(
        'packages/lib1/src/lib/file1.ts',
        'export const file1 = "test1";',
      );
      tree.write(
        'packages/lib1/src/lib/file2.ts',
        'export const file2 = "test2";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/file1.ts',
        project: 'lib2',
        removeEmptyProject: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // The file should be moved
      expect(tree.exists('packages/lib1/src/lib/file1.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/lib/file1.ts')).toBe(true);

      // lib1 still has file2.ts, so remove generator should NOT be called
      expect(removeGeneratorMock).not.toHaveBeenCalled();
    });

    it('should remove multiple source projects when they all become empty', async () => {
      // Add a third library
      addProjectConfiguration(tree, 'lib3', {
        root: 'packages/lib3',
        sourceRoot: 'packages/lib3/src',
        projectType: 'library',
      });
      tree.write('packages/lib3/src/index.ts', '');

      // Create single files in lib1 and lib2
      tree.write(
        'packages/lib1/src/lib/file1.ts',
        'export const file1 = "test1";',
      );
      tree.write(
        'packages/lib2/src/lib/file2.ts',
        'export const file2 = "test2";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/file1.ts, packages/lib2/src/lib/file2.ts',
        project: 'lib3',
        removeEmptyProject: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // Both files should be moved
      expect(tree.exists('packages/lib1/src/lib/file1.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/lib/file2.ts')).toBe(false);
      expect(tree.exists('packages/lib3/src/lib/file1.ts')).toBe(true);
      expect(tree.exists('packages/lib3/src/lib/file2.ts')).toBe(true);

      // The remove generator should have been called for both lib1 and lib2
      expect(removeGeneratorMock).toHaveBeenCalledTimes(2);
      expect(removeGeneratorMock).toHaveBeenCalledWith(tree, {
        projectName: 'lib1',
        skipFormat: true,
        forceRemove: false,
      });
      expect(removeGeneratorMock).toHaveBeenCalledWith(tree, {
        projectName: 'lib2',
        skipFormat: true,
        forceRemove: false,
      });
    });

    it('should consider project empty when only index.ts remains', async () => {
      // lib1 only has index.ts
      // No other files

      // Move a file from lib2 to lib1
      tree.write(
        'packages/lib2/src/lib/file.ts',
        'export const file = "test";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib2/src/lib/file.ts',
        project: 'lib1',
        removeEmptyProject: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // lib2 should be detected as empty (only index.ts remains)
      expect(removeGeneratorMock).toHaveBeenCalledWith(tree, {
        projectName: 'lib2',
        skipFormat: true,
        forceRemove: false,
      });
    });

    it('should NOT consider project empty when it has nested source files', async () => {
      // Create nested files in lib1
      tree.write(
        'packages/lib1/src/lib/feature/nested.ts',
        'export const nested = "test";',
      );
      tree.write(
        'packages/lib1/src/lib/file.ts',
        'export const file = "test";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/file.ts',
        project: 'lib2',
        removeEmptyProject: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // lib1 still has nested.ts, so it should NOT be removed
      expect(removeGeneratorMock).not.toHaveBeenCalled();
    });

    it('should detect empty project with different tsconfig file (tsconfig.json)', async () => {
      // Remove tsconfig.base.json and create tsconfig.json instead
      tree.delete('tsconfig.base.json');
      tree.write(
        'tsconfig.json',
        JSON.stringify({
          compilerOptions: {
            paths: {
              '@test/lib1': ['packages/lib1/src/index.ts'],
              '@test/lib2': ['packages/lib2/src/index.ts'],
            },
          },
        }),
      );

      // Create a project with only one file
      tree.write(
        'packages/lib1/src/lib/only-file.ts',
        'export const onlyFile = "test";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/only-file.ts',
        project: 'lib2',
        removeEmptyProject: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // The remove generator should have been called for lib1
      expect(removeGeneratorMock).toHaveBeenCalledWith(tree, {
        projectName: 'lib1',
        skipFormat: true,
        forceRemove: false,
      });
    });

    it('should detect empty project with custom tsconfig file (tsconfig.paths.json)', async () => {
      // Remove tsconfig.base.json and use tsconfig.paths.json instead
      tree.delete('tsconfig.base.json');
      tree.write(
        'tsconfig.paths.json',
        JSON.stringify({
          compilerOptions: {
            paths: {
              '@test/lib1': ['packages/lib1/src/index.ts'],
              '@test/lib2': ['packages/lib2/src/index.ts'],
            },
          },
        }),
      );

      // Create a project with only one file
      tree.write(
        'packages/lib1/src/lib/only-file.ts',
        'export const onlyFile = "test";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/only-file.ts',
        project: 'lib2',
        removeEmptyProject: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // The remove generator should have been called for lib1
      expect(removeGeneratorMock).toHaveBeenCalledWith(tree, {
        projectName: 'lib1',
        skipFormat: true,
        forceRemove: false,
      });
    });

    it('should detect empty project with different index file name (index.mts)', async () => {
      // Update tsconfig to use index.mts
      updateJson(tree, 'tsconfig.base.json', (json) => {
        json.compilerOptions.paths = {
          '@test/lib1': ['packages/lib1/src/index.mts'],
          '@test/lib2': ['packages/lib2/src/index.ts'],
        };
        return json;
      });

      // Create index.mts file for lib1
      tree.delete('packages/lib1/src/index.ts');
      tree.write('packages/lib1/src/index.mts', 'export {};');

      // Create a project with only one file
      tree.write(
        'packages/lib1/src/lib/only-file.ts',
        'export const onlyFile = "test";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/only-file.ts',
        project: 'lib2',
        removeEmptyProject: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // The remove generator should have been called for lib1
      expect(removeGeneratorMock).toHaveBeenCalledWith(tree, {
        projectName: 'lib1',
        skipFormat: true,
        forceRemove: false,
      });
    });

    it('should detect empty project with different index file name (index.cts)', async () => {
      // Update tsconfig to use index.cts
      updateJson(tree, 'tsconfig.base.json', (json) => {
        json.compilerOptions.paths = {
          '@test/lib1': ['packages/lib1/src/index.cts'],
          '@test/lib2': ['packages/lib2/src/index.ts'],
        };
        return json;
      });

      // Create index.cts file for lib1
      tree.delete('packages/lib1/src/index.ts');
      tree.write('packages/lib1/src/index.cts', 'export {};');

      // Create a project with only one file
      tree.write(
        'packages/lib1/src/lib/only-file.ts',
        'export const onlyFile = "test";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/only-file.ts',
        project: 'lib2',
        removeEmptyProject: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // The remove generator should have been called for lib1
      expect(removeGeneratorMock).toHaveBeenCalledWith(tree, {
        projectName: 'lib1',
        skipFormat: true,
        forceRemove: false,
      });
    });

    it('should handle moving .cjs files', async () => {
      // Create a .cjs file
      tree.write(
        'packages/lib1/src/lib/utils.cjs',
        'module.exports = { util: () => "test" };',
      );

      // Create a consumer file that imports the .cjs file
      tree.write(
        'packages/lib1/src/lib/consumer.ts',
        "import { util } from './utils.cjs';\nexport const value = util();",
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils.cjs',
        project: 'lib1',
        projectDirectory: 'common',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // The file should have been moved
      expect(tree.exists('packages/lib1/src/lib/utils.cjs')).toBe(false);
      expect(tree.exists('packages/lib1/src/lib/common/utils.cjs')).toBe(true);

      // The import should have been updated (preserving .cjs extension)
      const consumerContent = tree.read(
        'packages/lib1/src/lib/consumer.ts',
        'utf-8',
      );
      expect(consumerContent).toContain("from './common/utils.cjs'");
    });

    it('should handle moving .cts files', async () => {
      // Create a .cts file
      tree.write(
        'packages/lib1/src/lib/utils.cts',
        'export const util = () => "test";',
      );

      // Create a consumer file that imports the .cts file
      tree.write(
        'packages/lib1/src/lib/consumer.ts',
        "import { util } from './utils.cts';\nexport const value = util();",
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils.cts',
        project: 'lib1',
        projectDirectory: 'common',
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // The file should have been moved
      expect(tree.exists('packages/lib1/src/lib/utils.cts')).toBe(false);
      expect(tree.exists('packages/lib1/src/lib/common/utils.cts')).toBe(true);

      // The import should have been updated (preserving .cts extension)
      const consumerContent = tree.read(
        'packages/lib1/src/lib/consumer.ts',
        'utf-8',
      );
      expect(consumerContent).toContain("from './common/utils.cts'");
    });

    it('should dynamically detect custom entry point files', async () => {
      // Update tsconfig to use a custom entry point (main.ts)
      updateJson(tree, 'tsconfig.base.json', (json) => {
        json.compilerOptions.paths = {
          '@test/lib1': ['packages/lib1/src/main.ts'],
          '@test/lib2': ['packages/lib2/src/index.ts'],
        };
        return json;
      });

      // Create main.ts file for lib1 instead of index.ts
      tree.delete('packages/lib1/src/index.ts');
      tree.write('packages/lib1/src/main.ts', 'export {};');

      // Create a project with only one file
      tree.write(
        'packages/lib1/src/lib/only-file.ts',
        'export const onlyFile = "test";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/only-file.ts',
        project: 'lib2',
        removeEmptyProject: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // The remove generator should have been called for lib1
      expect(removeGeneratorMock).toHaveBeenCalledWith(tree, {
        projectName: 'lib1',
        skipFormat: true,
        forceRemove: false,
      });
    });

    it('should dynamically detect entry point in lib directory', async () => {
      // Update tsconfig to use lib/index.ts
      updateJson(tree, 'tsconfig.base.json', (json) => {
        json.compilerOptions.paths = {
          '@test/lib1': ['packages/lib1/lib/index.ts'],
          '@test/lib2': ['packages/lib2/src/index.ts'],
        };
        return json;
      });

      // Create lib/index.ts for lib1
      tree.delete('packages/lib1/src/index.ts');
      tree.write('packages/lib1/lib/index.ts', 'export {};');

      // Update lib1 project configuration to have lib as sourceRoot
      updateJson(tree, 'packages/lib1/project.json', (json) => {
        json.sourceRoot = 'packages/lib1/lib';
        return json;
      });

      // Create a project with only one file
      tree.write(
        'packages/lib1/lib/only-file.ts',
        'export const onlyFile = "test";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/lib/only-file.ts',
        project: 'lib2',
        removeEmptyProject: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // The remove generator should have been called for lib1
      expect(removeGeneratorMock).toHaveBeenCalledWith(tree, {
        projectName: 'lib1',
        skipFormat: true,
        forceRemove: false,
      });
    });

    it('should verify index file exists before treating as entry point', async () => {
      // Update tsconfig to reference a non-existent file
      updateJson(tree, 'tsconfig.base.json', (json) => {
        json.compilerOptions.paths = {
          '@test/lib1': ['packages/lib1/src/nonexistent.ts'],
          '@test/lib2': ['packages/lib2/src/index.ts'],
        };
        return json;
      });

      // Don't create the nonexistent.ts file

      // Create a project with only one file (and the standard index.ts)
      tree.write(
        'packages/lib1/src/lib/only-file.ts',
        'export const onlyFile = "test";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/only-file.ts',
        project: 'lib2',
        removeEmptyProject: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // The remove generator should have been called for lib1 because
      // only index.ts remains (fallback pattern matching)
      expect(removeGeneratorMock).toHaveBeenCalledWith(tree, {
        projectName: 'lib1',
        skipFormat: true,
        forceRemove: false,
      });
    });

    it('should support TypeScript CommonJS module extension (.cts)', async () => {
      // Test with .cts extension
      updateJson(tree, 'tsconfig.base.json', (json) => {
        json.compilerOptions.paths = {
          '@test/lib1': ['packages/lib1/src/index.cts'],
          '@test/lib2': ['packages/lib2/src/index.ts'],
        };
        return json;
      });

      tree.delete('packages/lib1/src/index.ts');
      tree.write('packages/lib1/src/index.cts', 'export {};');

      tree.write(
        'packages/lib1/src/lib/only-file.ts',
        'export const onlyFile = "test";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/only-file.ts',
        project: 'lib2',
        removeEmptyProject: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      expect(removeGeneratorMock).toHaveBeenCalledWith(tree, {
        projectName: 'lib1',
        skipFormat: true,
        forceRemove: false,
      });
    });

    it('should support TypeScript ES module extension (.mts)', async () => {
      // Test with .mts extension
      updateJson(tree, 'tsconfig.base.json', (json) => {
        json.compilerOptions.paths = {
          '@test/lib1': ['packages/lib1/src/index.mts'],
          '@test/lib2': ['packages/lib2/src/index.ts'],
        };
        return json;
      });

      tree.delete('packages/lib1/src/index.ts');
      tree.write('packages/lib1/src/index.mts', 'export {};');

      tree.write(
        'packages/lib1/src/lib/only-file.ts',
        'export const onlyFile = "test";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/only-file.ts',
        project: 'lib2',
        removeEmptyProject: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      expect(removeGeneratorMock).toHaveBeenCalledWith(tree, {
        projectName: 'lib1',
        skipFormat: true,
        forceRemove: false,
      });
    });

    it('should support JavaScript entry points', async () => {
      // Test with .js extension
      updateJson(tree, 'tsconfig.base.json', (json) => {
        json.compilerOptions.paths = {
          '@test/lib1': ['packages/lib1/src/index.js'],
          '@test/lib2': ['packages/lib2/src/index.ts'],
        };
        return json;
      });

      tree.delete('packages/lib1/src/index.ts');
      tree.write('packages/lib1/src/index.js', 'export {};');

      tree.write(
        'packages/lib1/src/lib/only-file.ts',
        'export const onlyFile = "test";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/only-file.ts',
        project: 'lib2',
        removeEmptyProject: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      expect(removeGeneratorMock).toHaveBeenCalledWith(tree, {
        projectName: 'lib1',
        skipFormat: true,
        forceRemove: false,
      });
    });

    it('should fallback to common index names when tsconfig has no paths', async () => {
      // Remove paths from tsconfig
      updateJson(tree, 'tsconfig.base.json', (json) => {
        delete json.compilerOptions.paths;
        return json;
      });

      // Create a project with only one file
      tree.write(
        'packages/lib1/src/lib/only-file.ts',
        'export const onlyFile = "test";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/only-file.ts',
        project: 'lib2',
        removeEmptyProject: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // Should still detect lib1 as empty using fallback index.ts check
      expect(removeGeneratorMock).toHaveBeenCalledWith(tree, {
        projectName: 'lib1',
        skipFormat: true,
        forceRemove: false,
      });
    });

    it('should handle removeGenerator failure gracefully', async () => {
      // Make removeGenerator throw an error
      removeGeneratorMock.mockRejectedValueOnce(
        new Error('Cannot remove project'),
      );

      // Create a project with only one file
      tree.write(
        'packages/lib1/src/lib/only-file.ts',
        'export const onlyFile = "test";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/only-file.ts',
        project: 'lib2',
        removeEmptyProject: true,
        skipFormat: true,
      };

      // Should not throw, but log the error
      await expect(moveFileGenerator(tree, options)).resolves.not.toThrow();

      // The file should still be moved
      expect(tree.exists('packages/lib1/src/lib/only-file.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/lib/only-file.ts')).toBe(true);
    });
  });

  describe('deriveProjectDirectory option', () => {
    it('should derive project directory from source file path for single file', async () => {
      // Create a file in a nested directory structure
      tree.write(
        'packages/lib1/src/lib/components/button/button.component.ts',
        'export class ButtonComponent {}',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/components/button/button.component.ts',
        project: 'lib2',
        deriveProjectDirectory: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // File should be moved with the same directory structure
      expect(
        tree.exists(
          'packages/lib1/src/lib/components/button/button.component.ts',
        ),
      ).toBe(false);
      expect(
        tree.exists(
          'packages/lib2/src/lib/components/button/button.component.ts',
        ),
      ).toBe(true);
    });

    it('should derive project directory for files in nested paths', async () => {
      tree.write(
        'packages/lib1/src/lib/features/auth/login/login.service.ts',
        'export class LoginService {}',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/features/auth/login/login.service.ts',
        project: 'lib2',
        deriveProjectDirectory: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      expect(
        tree.exists(
          'packages/lib1/src/lib/features/auth/login/login.service.ts',
        ),
      ).toBe(false);
      expect(
        tree.exists(
          'packages/lib2/src/lib/features/auth/login/login.service.ts',
        ),
      ).toBe(true);
    });

    it('should place file in base directory when source file has no subdirectory', async () => {
      tree.write(
        'packages/lib1/src/lib/simple.ts',
        'export const simple = true;',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/simple.ts',
        project: 'lib2',
        deriveProjectDirectory: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      expect(tree.exists('packages/lib1/src/lib/simple.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/lib/simple.ts')).toBe(true);
    });

    it('should work with glob patterns and deriveProjectDirectory', async () => {
      tree.write(
        'packages/lib1/src/lib/utils/helper1.ts',
        'export const helper1 = true;',
      );
      tree.write(
        'packages/lib1/src/lib/utils/helper2.ts',
        'export const helper2 = true;',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils/*.ts',
        project: 'lib2',
        deriveProjectDirectory: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      expect(tree.exists('packages/lib1/src/lib/utils/helper1.ts')).toBe(false);
      expect(tree.exists('packages/lib1/src/lib/utils/helper2.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/lib/utils/helper1.ts')).toBe(true);
      expect(tree.exists('packages/lib2/src/lib/utils/helper2.ts')).toBe(true);
    });

    it('should work with multiple files in different directories using comma-separated paths', async () => {
      tree.write(
        'packages/lib1/src/lib/components/button.ts',
        'export const button = true;',
      );
      tree.write(
        'packages/lib1/src/lib/services/api.ts',
        'export const api = true;',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/components/button.ts,packages/lib1/src/lib/services/api.ts',
        project: 'lib2',
        deriveProjectDirectory: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      expect(tree.exists('packages/lib1/src/lib/components/button.ts')).toBe(
        false,
      );
      expect(tree.exists('packages/lib1/src/lib/services/api.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/lib/components/button.ts')).toBe(
        true,
      );
      expect(tree.exists('packages/lib2/src/lib/services/api.ts')).toBe(true);
    });

    it('should work with comma-separated glob patterns', async () => {
      tree.write(
        'packages/lib1/src/lib/components/button.ts',
        'export const button = true;',
      );
      tree.write(
        'packages/lib1/src/lib/components/input.ts',
        'export const input = true;',
      );
      tree.write(
        'packages/lib1/src/lib/services/api.ts',
        'export const api = true;',
      );
      tree.write(
        'packages/lib1/src/lib/services/auth.ts',
        'export const auth = true;',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/components/*.ts,packages/lib1/src/lib/services/*.ts',
        project: 'lib2',
        deriveProjectDirectory: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // All files should be moved with their directory structure preserved
      expect(tree.exists('packages/lib1/src/lib/components/button.ts')).toBe(
        false,
      );
      expect(tree.exists('packages/lib1/src/lib/components/input.ts')).toBe(
        false,
      );
      expect(tree.exists('packages/lib1/src/lib/services/api.ts')).toBe(false);
      expect(tree.exists('packages/lib1/src/lib/services/auth.ts')).toBe(false);

      expect(tree.exists('packages/lib2/src/lib/components/button.ts')).toBe(
        true,
      );
      expect(tree.exists('packages/lib2/src/lib/components/input.ts')).toBe(
        true,
      );
      expect(tree.exists('packages/lib2/src/lib/services/api.ts')).toBe(true);
      expect(tree.exists('packages/lib2/src/lib/services/auth.ts')).toBe(true);
    });

    it('should work for application projects with app base directory', async () => {
      // Add an application project
      addProjectConfiguration(tree, 'app1', {
        root: 'packages/app1',
        sourceRoot: 'packages/app1/src',
        projectType: 'application',
      });

      tree.write(
        'packages/lib1/src/lib/features/profile/profile.component.ts',
        'export class ProfileComponent {}',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/features/profile/profile.component.ts',
        project: 'app1',
        deriveProjectDirectory: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      expect(
        tree.exists(
          'packages/lib1/src/lib/features/profile/profile.component.ts',
        ),
      ).toBe(false);
      expect(
        tree.exists(
          'packages/app1/src/app/features/profile/profile.component.ts',
        ),
      ).toBe(true);
    });

    it('should throw error when both deriveProjectDirectory and projectDirectory are set', async () => {
      tree.write(
        'packages/lib1/src/lib/utils/helper.ts',
        'export const helper = true;',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/utils/helper.ts',
        project: 'lib2',
        projectDirectory: 'custom',
        deriveProjectDirectory: true,
        skipFormat: true,
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        'Cannot use both "deriveProjectDirectory" and "projectDirectory" options at the same time',
      );
    });

    it('should handle deeply nested directory structures', async () => {
      tree.write(
        'packages/lib1/src/lib/a/b/c/d/e/deep.ts',
        'export const deep = true;',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/a/b/c/d/e/deep.ts',
        project: 'lib2',
        deriveProjectDirectory: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      expect(tree.exists('packages/lib1/src/lib/a/b/c/d/e/deep.ts')).toBe(
        false,
      );
      expect(tree.exists('packages/lib2/src/lib/a/b/c/d/e/deep.ts')).toBe(true);
    });

    it('should work with brace expansion glob patterns', async () => {
      tree.write(
        'packages/lib1/src/lib/components/button.component.ts',
        'export class ButtonComponent {}',
      );
      tree.write(
        'packages/lib1/src/lib/components/button.component.html',
        '<button>Click me</button>',
      );
      tree.write(
        'packages/lib1/src/lib/components/button.component.css',
        'button { color: blue; }',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/components/button.component.{ts,html,css}',
        project: 'lib2',
        deriveProjectDirectory: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      expect(
        tree.exists('packages/lib1/src/lib/components/button.component.ts'),
      ).toBe(false);
      expect(
        tree.exists('packages/lib1/src/lib/components/button.component.html'),
      ).toBe(false);
      expect(
        tree.exists('packages/lib1/src/lib/components/button.component.css'),
      ).toBe(false);

      expect(
        tree.exists('packages/lib2/src/lib/components/button.component.ts'),
      ).toBe(true);
      expect(
        tree.exists('packages/lib2/src/lib/components/button.component.html'),
      ).toBe(true);
      expect(
        tree.exists('packages/lib2/src/lib/components/button.component.css'),
      ).toBe(true);
    });

    it('should derive project directory from Windows path with backslashes', async () => {
      tree.write(
        'packages/lib1/src/lib/components/button/button.component.ts',
        'export class ButtonComponent {}',
      );

      // Use backslashes like on Windows
      const options: MoveFileGeneratorSchema = {
        file: 'packages\\lib1\\src\\lib\\components\\button\\button.component.ts',
        project: 'lib2',
        deriveProjectDirectory: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // File should be moved with the same directory structure preserved
      expect(
        tree.exists(
          'packages/lib1/src/lib/components/button/button.component.ts',
        ),
      ).toBe(false);
      expect(
        tree.exists(
          'packages/lib2/src/lib/components/button/button.component.ts',
        ),
      ).toBe(true);
    });

    it('should derive project directory with Windows backslash glob patterns', async () => {
      tree.write(
        'packages/lib1/src/lib/utils/helper1.ts',
        'export const helper1 = true;',
      );
      tree.write(
        'packages/lib1/src/lib/utils/helper2.ts',
        'export const helper2 = true;',
      );

      // Use backslashes in glob pattern like on Windows
      const options: MoveFileGeneratorSchema = {
        file: 'packages\\lib1\\src\\lib\\utils\\*.ts',
        project: 'lib2',
        deriveProjectDirectory: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // Files should be moved with directory structure preserved
      expect(tree.exists('packages/lib1/src/lib/utils/helper1.ts')).toBe(false);
      expect(tree.exists('packages/lib1/src/lib/utils/helper2.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/lib/utils/helper1.ts')).toBe(true);
      expect(tree.exists('packages/lib2/src/lib/utils/helper2.ts')).toBe(true);
    });

    it('should derive project directory with Windows backslash comma-separated paths', async () => {
      tree.write(
        'packages/lib1/src/lib/components/button.ts',
        'export const button = true;',
      );
      tree.write(
        'packages/lib1/src/lib/services/api.ts',
        'export const api = true;',
      );

      // Use backslashes in comma-separated paths like on Windows
      const options: MoveFileGeneratorSchema = {
        file: 'packages\\lib1\\src\\lib\\components\\button.ts,packages\\lib1\\src\\lib\\services\\api.ts',
        project: 'lib2',
        deriveProjectDirectory: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // Each file should preserve its respective directory structure
      expect(tree.exists('packages/lib1/src/lib/components/button.ts')).toBe(
        false,
      );
      expect(tree.exists('packages/lib1/src/lib/services/api.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/lib/components/button.ts')).toBe(
        true,
      );
      expect(tree.exists('packages/lib2/src/lib/services/api.ts')).toBe(true);
    });

    it('should derive project directory with Windows backslash deeply nested paths', async () => {
      tree.write(
        'packages/lib1/src/lib/features/auth/login/components/login-form.ts',
        'export class LoginForm {}',
      );

      // Use backslashes for deeply nested Windows path
      const options: MoveFileGeneratorSchema = {
        file: 'packages\\lib1\\src\\lib\\features\\auth\\login\\components\\login-form.ts',
        project: 'lib2',
        deriveProjectDirectory: true,
        skipFormat: true,
      };

      await moveFileGenerator(tree, options);

      // Deeply nested directory structure should be preserved
      expect(
        tree.exists(
          'packages/lib1/src/lib/features/auth/login/components/login-form.ts',
        ),
      ).toBe(false);
      expect(
        tree.exists(
          'packages/lib2/src/lib/features/auth/login/components/login-form.ts',
        ),
      ).toBe(true);
    });
  });

  describe('project import path caching', () => {
    it('should initialize cache once and reuse it for multiple lookups', async () => {
      // Create a third project for batch operations
      updateJson(tree, 'tsconfig.base.json', (json) => {
        json.compilerOptions.paths['@test/lib3'] = [
          'packages/lib3/src/index.ts',
        ];
        return json;
      });

      addProjectConfiguration(tree, 'lib3', {
        root: 'packages/lib3',
        sourceRoot: 'packages/lib3/src',
        projectType: 'library',
      });

      tree.write('packages/lib3/src/index.ts', '');

      // Create multiple files in lib1
      tree.write(
        'packages/lib1/src/lib/file1.ts',
        'export const file1 = "test1";',
      );
      tree.write(
        'packages/lib1/src/lib/file2.ts',
        'export const file2 = "test2";',
      );
      tree.write(
        'packages/lib1/src/lib/file3.ts',
        'export const file3 = "test3";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/lib/file1.ts,packages/lib1/src/lib/file2.ts,packages/lib1/src/lib/file3.ts',
        to: 'packages/lib2',
        project: 'lib2',
        skipFormat: true,
      };

      // Move multiple files - this should use the cache for all lookups
      await moveFileGenerator(tree, options);

      // All files should be moved
      expect(tree.exists('packages/lib1/src/lib/file1.ts')).toBe(false);
      expect(tree.exists('packages/lib1/src/lib/file2.ts')).toBe(false);
      expect(tree.exists('packages/lib1/src/lib/file3.ts')).toBe(false);
      expect(tree.exists('packages/lib2/src/lib/file1.ts')).toBe(true);
      expect(tree.exists('packages/lib2/src/lib/file2.ts')).toBe(true);
      expect(tree.exists('packages/lib2/src/lib/file3.ts')).toBe(true);
    });

    it('should cache results for all projects including those without import paths', async () => {
      // Create a project without a path mapping
      addProjectConfiguration(tree, 'lib-no-alias', {
        root: 'packages/lib-no-alias',
        sourceRoot: 'packages/lib-no-alias/src',
        projectType: 'library',
      });

      tree.write('packages/lib-no-alias/src/index.ts', '');
      tree.write(
        'packages/lib-no-alias/src/lib/test.ts',
        'export const test = "test";',
      );

      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib-no-alias/src/lib/test.ts',
        to: 'packages/lib1',
        project: 'lib1',
        skipFormat: true,
      };

      // This should work even though lib-no-alias has no import path
      await moveFileGenerator(tree, options);

      expect(tree.exists('packages/lib-no-alias/src/lib/test.ts')).toBe(false);
      expect(tree.exists('packages/lib1/src/lib/test.ts')).toBe(true);
    });
  });
});
