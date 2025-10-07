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
      // user attempts to pass a regex-like string
      const options: MoveFileGeneratorSchema = {
        file: 'packages/lib1/src/[evil*].ts',
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
        'At least one file path must be provided',
      );
    });

    it('should throw error if only whitespace is provided', async () => {
      const options: MoveFileGeneratorSchema = {
        file: '  ,  ,  ',
        project: 'lib2',
        skipFormat: true,
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        'At least one file path must be provided',
      );
    });
  });
});
