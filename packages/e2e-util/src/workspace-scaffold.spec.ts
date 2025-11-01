/**
 * Unit tests for Workspace Scaffold Helper
 */

import { createWorkspace, addSourceFile } from './workspace-scaffold';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { uniqueId } from '@internal/test-util';
import { EventEmitter } from 'node:events';

// Mock node modules
jest.mock('node:child_process');
jest.mock('node:fs');
jest.mock('@internal/test-util');
jest.mock('@nx/devkit', () => ({
  logger: {
    verbose: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
const mockMkdirSync = mkdirSync as jest.MockedFunction<typeof mkdirSync>;
const mockWriteFileSync = writeFileSync as jest.MockedFunction<
  typeof writeFileSync
>;
const mockReadFileSync = readFileSync as jest.MockedFunction<
  typeof readFileSync
>;
const mockUniqueId = uniqueId as jest.MockedFunction<typeof uniqueId>;

describe('Workspace Scaffold Helper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUniqueId.mockReturnValue('test-id-12345');
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        devDependencies: {
          nx: '^19.0.0',
        },
      }),
    );

    // Mock spawn to return a mock child process that immediately succeeds
    mockSpawn.mockImplementation(() => {
      const mockChild = new EventEmitter() as unknown as ChildProcess;
      mockChild.stdout =
        new EventEmitter() as unknown as ChildProcess['stdout'];
      mockChild.stderr =
        new EventEmitter() as unknown as ChildProcess['stderr'];

      // Simulate successful command execution
      process.nextTick(() => {
        mockChild.emit('close', 0);
      });

      return mockChild;
    });
  });

  describe('createWorkspace', () => {
    it('should create workspace with default configuration', async () => {
      const workspace = await createWorkspace();

      expect(workspace.name).toContain('test-workspace-');
      expect(workspace.libs).toHaveLength(2);
      expect(workspace.libs).toEqual(['lib-a', 'lib-b']);
      expect(workspace.app).toBeUndefined();
      expect(mockExecSync).toHaveBeenCalled();
    });

    it('should create workspace with custom number of libraries', async () => {
      const workspace = await createWorkspace({ libs: 3 });

      expect(workspace.libs).toHaveLength(3);
      expect(workspace.libs).toEqual(['lib-a', 'lib-b', 'lib-c']);
    });

    it('should create workspace with application when requested', async () => {
      const workspace = await createWorkspace({ includeApp: true });

      expect(workspace.app).toBe('app-main');
      expect(workspace.libs).toHaveLength(2);
    });

    it('should create workspace with custom name', async () => {
      const customName = 'my-custom-workspace';
      const workspace = await createWorkspace({ name: customName });

      expect(workspace.name).toBe(customName);
    });

    it('should create workspace with specified Nx version', async () => {
      await createWorkspace({ nxVersion: 20 });

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('create-nx-workspace@^20.0.0'),
        expect.any(Object),
      );
    });

    it('should use workspace Nx version when nxVersion not specified', async () => {
      await createWorkspace();

      expect(mockReadFileSync).toHaveBeenCalledWith(
        expect.stringContaining('package.json'),
        'utf-8',
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('create-nx-workspace@^19.0.0'),
        expect.any(Object),
      );
    });

    it('should create workspace in custom base directory', async () => {
      const workspace = await createWorkspace({ baseDir: './custom-tmp' });

      expect(workspace.path).toContain('custom-tmp');
    });

    it('should throw error if workspace Nx version cannot be determined', async () => {
      mockReadFileSync.mockReturnValueOnce(
        JSON.stringify({ dependencies: {} }),
      );

      await expect(createWorkspace()).rejects.toThrow(
        'Could not determine workspace Nx version',
      );
    });

    it('should generate libraries with deterministic names', async () => {
      const workspace5 = await createWorkspace({ libs: 5 });
      expect(workspace5.libs).toEqual([
        'lib-a',
        'lib-b',
        'lib-c',
        'lib-d',
        'lib-e',
      ]);

      const workspace10 = await createWorkspace({ libs: 10 });
      expect(workspace10.libs).toEqual([
        'lib-a',
        'lib-b',
        'lib-c',
        'lib-d',
        'lib-e',
        'lib-f',
        'lib-g',
        'lib-h',
        'lib-i',
        'lib-j',
      ]);
    });

    it('should handle more than 26 libraries by adding numeric suffixes', async () => {
      const workspace30 = await createWorkspace({ libs: 30 });
      expect(workspace30.libs).toHaveLength(30);
      expect(workspace30.libs[26]).toBe('lib-a1'); // 27th library
      expect(workspace30.libs[27]).toBe('lib-b1'); // 28th library
    });

    it('should create parent directory if it does not exist', async () => {
      await createWorkspace();

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ recursive: true }),
      );
    });

    it('should pass correct options to create-nx-workspace', async () => {
      await createWorkspace();

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--preset apps'),
        expect.any(Object),
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--nxCloud=skip'),
        expect.any(Object),
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--no-interactive'),
        expect.any(Object),
      );
    });

    it('should pass correct options to library generator', async () => {
      await createWorkspace({ libs: 1 });

      // Library generation now uses spawn (via execAsync) instead of execSync
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('nx generate @nx/js:library lib-a'),
        expect.objectContaining({
          shell: true,
          stdio: 'pipe',
        }),
      );
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('--unitTestRunner=none'),
        expect.any(Object),
      );
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('--bundler=none'),
        expect.any(Object),
      );
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('--no-interactive'),
        expect.any(Object),
      );
    });

    it('should pass correct options to app generator when includeApp is true', async () => {
      await createWorkspace({ includeApp: true, libs: 0 });

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('nx generate @nx/node:application app-main'),
        expect.any(Object),
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--unitTestRunner=none'),
        expect.any(Object),
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--bundler=esbuild'),
        expect.any(Object),
      );
    });
  });

  describe('addSourceFile', () => {
    const mockWorkspace = {
      path: '/test/workspace',
      name: 'test-workspace',
      libs: ['lib-a', 'lib-b'],
    };

    it('should add source file to project', async () => {
      await addSourceFile(
        mockWorkspace,
        'lib-a',
        'src/lib/util.ts',
        'export const util = () => 42;',
      );

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('lib-a'),
        expect.objectContaining({ recursive: true }),
      );
      // Implementation uses posix paths, so we expect forward slashes in absolute paths
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/lib-a\/src\/lib\/util\.ts$/),
        'export const util = () => 42;',
        'utf-8',
      );
    });

    it('should create directory structure if it does not exist', async () => {
      await addSourceFile(
        mockWorkspace,
        'lib-a',
        'src/lib/deep/nested/file.ts',
        'export const test = true;',
      );

      // Implementation uses posix paths, so we expect forward slashes
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringMatching(/deep\/nested$/),
        expect.objectContaining({ recursive: true }),
      );
    });

    it('should handle different file types', async () => {
      // TypeScript
      await addSourceFile(
        mockWorkspace,
        'lib-a',
        'src/lib/test.ts',
        'export const test = 1;',
      );
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.any(String),
        'export const test = 1;',
        'utf-8',
      );

      // JavaScript
      await addSourceFile(
        mockWorkspace,
        'lib-a',
        'src/lib/test.js',
        'export const test = 2;',
      );
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.any(String),
        'export const test = 2;',
        'utf-8',
      );

      // JSON
      await addSourceFile(
        mockWorkspace,
        'lib-a',
        'config.json',
        '{"test": true}',
      );
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.any(String),
        '{"test": true}',
        'utf-8',
      );
    });

    it('should handle adding files to application projects', async () => {
      const workspaceWithApp = {
        ...mockWorkspace,
        app: 'app-main',
      };

      await addSourceFile(
        workspaceWithApp,
        'app-main',
        'src/main.ts',
        'console.log("Hello");',
      );

      // Implementation uses posix paths, so we expect forward slashes
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/app-main\/src\/main\.ts$/),
        'console.log("Hello");',
        'utf-8',
      );
    });
  });
});
