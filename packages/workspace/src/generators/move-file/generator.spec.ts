import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, addProjectConfiguration, updateJson } from '@nx/devkit';

import { moveFileGenerator } from './generator';
import { MoveFileGeneratorSchema } from './schema';

describe('move-file generator', () => {
  let tree: Tree;

  beforeEach(() => {
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
        source: 'packages/lib1/src/utils/helper.ts',
        target: 'packages/lib2/src/utils/helper.ts',
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
        source: 'packages/lib1/src/utils/helper.ts',
        target: 'packages/lib2/src/utils/helper.ts',
      };

      await moveFileGenerator(tree, options);

      // Imports should be updated to use target import path
      const mainContent = tree.read('packages/lib1/src/main.ts', 'utf-8');
      expect(mainContent).toContain("from '@test/lib2'");
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
        source: 'packages/lib1/src/utils/helper.ts',
        target: 'packages/lib2/src/utils/helper.ts',
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
        "import { helper } from '@test/lib1';\n\nconsole.log(helper());",
      );

      const options: MoveFileGeneratorSchema = {
        source: 'packages/lib1/src/utils/helper.ts',
        target: 'packages/lib2/src/utils/helper.ts',
      };

      await moveFileGenerator(tree, options);

      // App should now import from lib2
      const appContent = tree.read('packages/app1/src/main.ts', 'utf-8');
      expect(appContent).toContain("from '@test/lib2'");
    });
  });

  describe('error handling', () => {
    it('should throw error if source file does not exist', async () => {
      const options: MoveFileGeneratorSchema = {
        source: 'packages/lib1/src/utils/non-existent.ts',
        target: 'packages/lib2/src/utils/non-existent.ts',
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
        source: 'unknown/path/helper.ts',
        target: 'packages/lib2/src/helper.ts',
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
        source: 'packages/lib1/src/helper.ts',
        target: 'unknown/path/helper.ts',
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        'Could not determine target project for file',
      );
    });

    it('should throw error for path traversal in source', async () => {
      const options: MoveFileGeneratorSchema = {
        source: '../../../etc/passwd',
        target: 'packages/lib2/src/helper.ts',
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
        source: 'packages/lib1/src/helper.ts',
        target: '../../etc/passwd',
      };

      await expect(moveFileGenerator(tree, options)).rejects.toThrow(
        'Invalid path: path traversal detected',
      );
    });
  });
});
