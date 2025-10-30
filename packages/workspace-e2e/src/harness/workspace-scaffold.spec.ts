import { join } from 'node:path';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import {
  createWorkspace,
  addSourceFile,
  getProjectImportAlias,
} from './workspace-scaffold';

// These are integration tests that actually create Nx workspaces
// They may take longer to run but provide confidence that the harness works correctly

describe('workspace-scaffold utilities', () => {
  const testBaseDir = join(process.cwd(), 'tmp', 'scaffold-tests');
  const createdWorkspaces: string[] = [];

  afterEach(async () => {
    // Clean up all created workspaces
    for (const workspacePath of createdWorkspaces) {
      try {
        rmSync(workspacePath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    createdWorkspaces.length = 0;
  });

  describe('createWorkspace', () => {
    it(
      'should create a workspace with default settings',
      async () => {
        const workspace = await createWorkspace({ baseDir: testBaseDir });
        createdWorkspaces.push(workspace.path);

        expect(workspace.name).toMatch(/^test-workspace-/);
        expect(workspace.path).toContain(testBaseDir);
        expect(existsSync(workspace.path)).toBe(true);
        expect(workspace.libs.length).toBe(2); // default is 2 libs
        expect(workspace.app).toBeUndefined(); // default is no app

        // Verify workspace structure
        const packageJsonPath = join(workspace.path, 'package.json');
        expect(existsSync(packageJsonPath)).toBe(true);

        const nxJsonPath = join(workspace.path, 'nx.json');
        expect(existsSync(nxJsonPath)).toBe(true);
      },
      120000,
    ); // 2 minutes timeout for workspace creation

    it(
      'should create a workspace with custom name',
      async () => {
        const customName = 'my-custom-workspace';
        const workspace = await createWorkspace({
          name: customName,
          baseDir: testBaseDir,
        });
        createdWorkspaces.push(workspace.path);

        expect(workspace.name).toBe(customName);
        expect(workspace.path).toContain(customName);
      },
      120000,
    );

    it(
      'should create a workspace with specified number of libraries',
      async () => {
        const workspace = await createWorkspace({
          libs: 3,
          baseDir: testBaseDir,
        });
        createdWorkspaces.push(workspace.path);

        expect(workspace.libs.length).toBe(3);
        expect(workspace.libs).toEqual(['lib-a', 'lib-b', 'lib-c']);

        // Verify each library exists
        for (const lib of workspace.libs) {
          const libPath = join(workspace.path, lib);
          expect(existsSync(libPath)).toBe(true);

          const libSrcPath = join(libPath, 'src', 'index.ts');
          expect(existsSync(libSrcPath)).toBe(true);
        }
      },
      120000,
    );

    it(
      'should create a workspace with an application',
      async () => {
        const workspace = await createWorkspace({
          libs: 1,
          includeApp: true,
          baseDir: testBaseDir,
        });
        createdWorkspaces.push(workspace.path);

        expect(workspace.app).toBe('app-main');

        // Verify application exists
        const appPath = join(workspace.path, workspace.app);
        expect(existsSync(appPath)).toBe(true);

        const appSrcPath = join(appPath, 'src', 'main.ts');
        expect(existsSync(appSrcPath)).toBe(true);
      },
      120000,
    );

    it(
      'should generate libraries with deterministic names',
      async () => {
        const workspace = await createWorkspace({
          libs: 5,
          baseDir: testBaseDir,
        });
        createdWorkspaces.push(workspace.path);

        expect(workspace.libs).toEqual([
          'lib-a',
          'lib-b',
          'lib-c',
          'lib-d',
          'lib-e',
        ]);
      },
      120000,
    );

    it(
      'should create workspace with short path to avoid OS limits',
      async () => {
        const workspace = await createWorkspace({ baseDir: testBaseDir });
        createdWorkspaces.push(workspace.path);

        // Verify the workspace path is reasonably short
        // Using uniqueId with 8 bytes (16 hex chars) keeps paths short
        expect(workspace.path.length).toBeLessThan(200);
      },
      120000,
    );
  });

  describe('addSourceFile', () => {
    it(
      'should add a source file to a project',
      async () => {
        const workspace = await createWorkspace({
          libs: 1,
          baseDir: testBaseDir,
        });
        createdWorkspaces.push(workspace.path);

        const fileContents = 'export function myUtil() { return "test"; }';
        await addSourceFile({
          workspacePath: workspace.path,
          project: workspace.libs[0],
          relativePath: 'src/lib/my-util.ts',
          contents: fileContents,
        });

        const filePath = join(
          workspace.path,
          workspace.libs[0],
          'src',
          'lib',
          'my-util.ts',
        );
        expect(existsSync(filePath)).toBe(true);

        const actualContents = readFileSync(filePath, 'utf-8');
        expect(actualContents).toBe(fileContents);
      },
      120000,
    );

    it(
      'should create nested directories if they do not exist',
      async () => {
        const workspace = await createWorkspace({
          libs: 1,
          baseDir: testBaseDir,
        });
        createdWorkspaces.push(workspace.path);

        await addSourceFile({
          workspacePath: workspace.path,
          project: workspace.libs[0],
          relativePath: 'src/lib/nested/deep/util.ts',
          contents: 'export const value = 42;',
        });

        const filePath = join(
          workspace.path,
          workspace.libs[0],
          'src',
          'lib',
          'nested',
          'deep',
          'util.ts',
        );
        expect(existsSync(filePath)).toBe(true);
      },
      120000,
    );

    it(
      'should handle multiple files in the same project',
      async () => {
        const workspace = await createWorkspace({
          libs: 1,
          baseDir: testBaseDir,
        });
        createdWorkspaces.push(workspace.path);

        await addSourceFile({
          workspacePath: workspace.path,
          project: workspace.libs[0],
          relativePath: 'src/lib/file1.ts',
          contents: 'export const file1 = 1;',
        });

        await addSourceFile({
          workspacePath: workspace.path,
          project: workspace.libs[0],
          relativePath: 'src/lib/file2.ts',
          contents: 'export const file2 = 2;',
        });

        const file1Path = join(
          workspace.path,
          workspace.libs[0],
          'src',
          'lib',
          'file1.ts',
        );
        const file2Path = join(
          workspace.path,
          workspace.libs[0],
          'src',
          'lib',
          'file2.ts',
        );

        expect(existsSync(file1Path)).toBe(true);
        expect(existsSync(file2Path)).toBe(true);
      },
      120000,
    );
  });

  describe('getProjectImportAlias', () => {
    it(
      'should get the import alias for a library',
      async () => {
        const workspace = await createWorkspace({
          libs: 2,
          baseDir: testBaseDir,
        });
        createdWorkspaces.push(workspace.path);

        const alias = getProjectImportAlias(workspace.path, workspace.libs[0]);

        // The alias should follow the pattern @{workspace-name}/{lib-name}
        expect(alias).toMatch(/^@.*\/lib-a$/);
      },
      120000,
    );

    it(
      'should throw if project is not found',
      async () => {
        const workspace = await createWorkspace({
          libs: 1,
          baseDir: testBaseDir,
        });
        createdWorkspaces.push(workspace.path);

        expect(() =>
          getProjectImportAlias(workspace.path, 'non-existent-project'),
        ).toThrow(/Could not determine import alias/);
      },
      120000,
    );
  });
});
