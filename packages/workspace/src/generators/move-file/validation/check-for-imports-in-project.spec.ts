import { Tree, ProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { checkForImportsInProject } from './check-for-imports-in-project';
import { clearCache } from '../jscodeshift-utils';

describe('checkForImportsInProject', () => {
  let tree: Tree;
  let project: ProjectConfiguration;

  beforeEach(() => {
    clearCache(); // Clear AST cache between tests
    tree = createTreeWithEmptyWorkspace();
    project = {
      root: 'libs/shared-utils',
      sourceRoot: 'libs/shared-utils/src',
      name: 'shared-utils',
    };
  });

  it('should return true when a file imports the specified path', () => {
    const mainFile = 'apps/web-app/src/app/main.ts';
    const otherFile = 'apps/web-app/src/app/other.ts';

    tree.write(mainFile, "import { helper } from '@myorg/shared-utils';");
    tree.write(otherFile, 'export function other() {}');

    const getProjectSourceFiles = jest
      .fn()
      .mockReturnValue([mainFile, otherFile]);

    const result = checkForImportsInProject(
      tree,
      project,
      '@myorg/shared-utils',
      getProjectSourceFiles,
    );

    expect(result).toBe(true);
  });

  it('should return false when no files import the specified path', () => {
    const mainFile = 'apps/web-app/src/app/main.ts';
    const otherFile = 'apps/web-app/src/app/other.ts';

    tree.write(mainFile, "import { helper } from '@myorg/other-lib';");
    tree.write(otherFile, 'export function other() {}');

    const getProjectSourceFiles = jest
      .fn()
      .mockReturnValue([mainFile, otherFile]);

    const result = checkForImportsInProject(
      tree,
      project,
      '@myorg/shared-utils',
      getProjectSourceFiles,
    );

    expect(result).toBe(false);
  });

  it('should detect relative imports', () => {
    const mainFile = 'libs/shared-utils/src/lib/main.ts';
    const formatHelper = 'libs/shared-utils/src/lib/helpers/format.ts';

    tree.write(mainFile, "import { format } from './helpers/format';");
    tree.write(formatHelper, 'export function format() {}');

    const getProjectSourceFiles = jest
      .fn()
      .mockReturnValue([mainFile, formatHelper]);

    const result = checkForImportsInProject(
      tree,
      project,
      './helpers/format',
      getProjectSourceFiles,
    );

    expect(result).toBe(true);
  });

  it('should detect nested relative imports', () => {
    const loginFile = 'libs/shared-utils/src/lib/features/auth/login.ts';
    const formatHelper = 'libs/shared-utils/src/lib/helpers/format.ts';

    tree.write(loginFile, "import { format } from '../../helpers/format';");
    tree.write(formatHelper, 'export function format() {}');

    const getProjectSourceFiles = jest
      .fn()
      .mockReturnValue([loginFile, formatHelper]);

    const result = checkForImportsInProject(
      tree,
      project,
      '../../helpers/format',
      getProjectSourceFiles,
    );

    expect(result).toBe(true);
  });

  it('should detect export statements with import paths', () => {
    const indexFile = 'apps/web-app/src/index.ts';
    const otherFile = 'apps/web-app/src/app/other.ts';

    tree.write(indexFile, "export * from '@myorg/shared-utils';");
    tree.write(otherFile, 'export function other() {}');

    const getProjectSourceFiles = jest
      .fn()
      .mockReturnValue([indexFile, otherFile]);

    const result = checkForImportsInProject(
      tree,
      project,
      '@myorg/shared-utils',
      getProjectSourceFiles,
    );

    expect(result).toBe(true);
  });

  it('should detect named export statements with import paths', () => {
    const indexFile = 'apps/web-app/src/index.ts';
    const otherFile = 'apps/web-app/src/app/other.ts';

    tree.write(indexFile, "export { helper } from '@myorg/shared-utils';");
    tree.write(otherFile, 'export function other() {}');

    const getProjectSourceFiles = jest
      .fn()
      .mockReturnValue([indexFile, otherFile]);

    const result = checkForImportsInProject(
      tree,
      project,
      '@myorg/shared-utils',
      getProjectSourceFiles,
    );

    expect(result).toBe(true);
  });

  it('should detect dynamic imports', () => {
    const mainFile = 'apps/web-app/src/app/main.ts';
    const otherFile = 'apps/web-app/src/app/other.ts';

    tree.write(
      mainFile,
      "export const load = () => import('@myorg/shared-utils');",
    );
    tree.write(otherFile, 'export function other() {}');

    const getProjectSourceFiles = jest
      .fn()
      .mockReturnValue([mainFile, otherFile]);

    const result = checkForImportsInProject(
      tree,
      project,
      '@myorg/shared-utils',
      getProjectSourceFiles,
    );

    expect(result).toBe(true);
  });

  it('should detect require statements', () => {
    const mainFile = 'apps/web-app/src/app/main.ts';
    const otherFile = 'apps/web-app/src/app/other.ts';

    tree.write(mainFile, "const utils = require('@myorg/shared-utils');");
    tree.write(otherFile, 'export function other() {}');

    const getProjectSourceFiles = jest
      .fn()
      .mockReturnValue([mainFile, otherFile]);

    const result = checkForImportsInProject(
      tree,
      project,
      '@myorg/shared-utils',
      getProjectSourceFiles,
    );

    expect(result).toBe(true);
  });

  it('should detect require.resolve statements', () => {
    const mainFile = 'apps/web-app/src/app/main.ts';
    const otherFile = 'apps/web-app/src/app/other.ts';

    tree.write(
      mainFile,
      "const path = require.resolve('@myorg/shared-utils');",
    );
    tree.write(otherFile, 'export function other() {}');

    const getProjectSourceFiles = jest
      .fn()
      .mockReturnValue([mainFile, otherFile]);

    const result = checkForImportsInProject(
      tree,
      project,
      '@myorg/shared-utils',
      getProjectSourceFiles,
    );

    expect(result).toBe(true);
  });

  it('should return false when import path is different', () => {
    const mainFile = 'apps/web-app/src/app/main.ts';
    const otherFile = 'apps/web-app/src/app/other.ts';

    tree.write(mainFile, "import { helper } from '@myorg/shared-utils';");
    tree.write(otherFile, "import { other } from '@myorg/other-lib';");

    const getProjectSourceFiles = jest
      .fn()
      .mockReturnValue([mainFile, otherFile]);

    const result = checkForImportsInProject(
      tree,
      project,
      '@myorg/data-access',
      getProjectSourceFiles,
    );

    expect(result).toBe(false);
  });

  it('should handle files with multiple imports', () => {
    const mainFile = 'apps/web-app/src/app/main.ts';
    const otherFile = 'apps/web-app/src/app/other.ts';

    tree.write(
      mainFile,
      "import { a } from '@myorg/feature-a';\nimport { b } from '@myorg/feature-b';\nimport { utils } from '@myorg/shared-utils';",
    );
    tree.write(otherFile, 'export function other() {}');

    const getProjectSourceFiles = jest
      .fn()
      .mockReturnValue([mainFile, otherFile]);

    const result = checkForImportsInProject(
      tree,
      project,
      '@myorg/shared-utils',
      getProjectSourceFiles,
    );

    expect(result).toBe(true);
  });

  it('should stop searching after finding first match', () => {
    const componentFile = 'apps/web-app/src/app/component.ts';
    const serviceFile = 'apps/web-app/src/app/service.ts';
    const utilFile = 'apps/web-app/src/app/util.ts';

    tree.write(componentFile, "import { helper } from '@myorg/shared-utils';");
    tree.write(serviceFile, "import { helper } from '@myorg/shared-utils';");
    tree.write(utilFile, 'export function other() {}');

    const getProjectSourceFiles = jest
      .fn()
      .mockReturnValue([componentFile, serviceFile, utilFile]);

    const result = checkForImportsInProject(
      tree,
      project,
      '@myorg/shared-utils',
      getProjectSourceFiles,
    );

    expect(result).toBe(true);
    // The function should return true as soon as it finds the first match
  });

  it('should handle empty files', () => {
    const mainFile = 'apps/web-app/src/app/main.ts';
    const emptyFile = 'apps/web-app/src/app/empty.ts';

    tree.write(mainFile, "import { helper } from '@myorg/other-lib';");
    tree.write(emptyFile, '');

    const getProjectSourceFiles = jest
      .fn()
      .mockReturnValue([mainFile, emptyFile]);

    const result = checkForImportsInProject(
      tree,
      project,
      '@myorg/shared-utils',
      getProjectSourceFiles,
    );

    expect(result).toBe(false);
  });

  it('should handle files with only comments', () => {
    const mainFile = 'apps/web-app/src/app/main.ts';
    const commentsFile = 'apps/web-app/src/app/comments.ts';

    tree.write(mainFile, "import { helper } from '@myorg/other-lib';");
    tree.write(commentsFile, '// This is a comment\n/* Another comment */');

    const getProjectSourceFiles = jest
      .fn()
      .mockReturnValue([mainFile, commentsFile]);

    const result = checkForImportsInProject(
      tree,
      project,
      '@myorg/shared-utils',
      getProjectSourceFiles,
    );

    expect(result).toBe(false);
  });

  it('should handle project with no source files', () => {
    const getProjectSourceFiles = jest.fn().mockReturnValue([]);

    const result = checkForImportsInProject(
      tree,
      project,
      '@myorg/shared-utils',
      getProjectSourceFiles,
    );

    expect(result).toBe(false);
    expect(getProjectSourceFiles).toHaveBeenCalledWith(tree, project.root);
  });

  it('should call getProjectSourceFilesFn with correct arguments', () => {
    const mainFile = 'apps/web-app/src/app/main.ts';
    tree.write(mainFile, 'export function main() {}');

    const getProjectSourceFiles = jest.fn().mockReturnValue([mainFile]);

    checkForImportsInProject(
      tree,
      project,
      '@myorg/shared-utils',
      getProjectSourceFiles,
    );

    expect(getProjectSourceFiles).toHaveBeenCalledWith(tree, project.root);
    expect(getProjectSourceFiles).toHaveBeenCalledTimes(1);
  });

  it('should work with scoped package names with subpaths', () => {
    const mainFile = 'apps/web-app/src/app/main.ts';

    tree.write(mainFile, "import { helper } from '@myorg/utils/helpers';");

    const getProjectSourceFiles = jest.fn().mockReturnValue([mainFile]);

    const result = checkForImportsInProject(
      tree,
      project,
      '@myorg/utils/helpers',
      getProjectSourceFiles,
    );

    expect(result).toBe(true);
  });

  it('should handle imports with file extensions', () => {
    const mainFile = 'apps/web-app/src/app/main.ts';

    tree.write(mainFile, "import { helper } from './utils/helper.js';");

    const getProjectSourceFiles = jest.fn().mockReturnValue([mainFile]);

    const result = checkForImportsInProject(
      tree,
      project,
      './utils/helper.js',
      getProjectSourceFiles,
    );

    expect(result).toBe(true);
  });

  it('should handle mixed import types in same file', () => {
    const mainFile = 'apps/web-app/src/app/main.ts';

    tree.write(
      mainFile,
      `import { a } from '@myorg/feature-a';
const b = require('@myorg/feature-b');
export * from '@myorg/shared-utils';
const c = require.resolve('@myorg/feature-c');`,
    );

    const getProjectSourceFiles = jest.fn().mockReturnValue([mainFile]);

    const result = checkForImportsInProject(
      tree,
      project,
      '@myorg/shared-utils',
      getProjectSourceFiles,
    );

    expect(result).toBe(true);
  });
});
