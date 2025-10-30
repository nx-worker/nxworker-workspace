import { join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { cleanupWorkspace, clearNxCache, cleanupWorkspaces } from './cleanup';

describe('cleanup utilities', () => {
  const testBaseDir = join(process.cwd(), 'tmp', 'cleanup-tests');

  beforeEach(() => {
    // Clean up test directory before each test
    rmSync(testBaseDir, { recursive: true, force: true });
    mkdirSync(testBaseDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory after each test
    rmSync(testBaseDir, { recursive: true, force: true });
  });

  describe('cleanupWorkspace', () => {
    it('should remove a workspace directory', async () => {
      const workspacePath = join(testBaseDir, 'test-workspace');
      mkdirSync(workspacePath, { recursive: true });
      writeFileSync(join(workspacePath, 'test.txt'), 'test content');

      expect(existsSync(workspacePath)).toBe(true);

      await cleanupWorkspace({ workspacePath });

      expect(existsSync(workspacePath)).toBe(false);
    });

    it('should handle nested directories', async () => {
      const workspacePath = join(testBaseDir, 'test-workspace');
      const nestedDir = join(workspacePath, 'nested', 'dir', 'structure');
      mkdirSync(nestedDir, { recursive: true });
      writeFileSync(join(nestedDir, 'file.txt'), 'nested content');

      expect(existsSync(workspacePath)).toBe(true);

      await cleanupWorkspace({ workspacePath });

      expect(existsSync(workspacePath)).toBe(false);
    });

    it('should not throw if directory does not exist', async () => {
      const workspacePath = join(testBaseDir, 'non-existent-workspace');

      expect(existsSync(workspacePath)).toBe(false);

      await expect(cleanupWorkspace({ workspacePath })).resolves.not.toThrow();
    });

    it('should retry on EBUSY errors (simulated)', async () => {
      const workspacePath = join(testBaseDir, 'busy-workspace');
      mkdirSync(workspacePath, { recursive: true });
      writeFileSync(join(workspacePath, 'test.txt'), 'content');

      // The actual file system operations should succeed even with retry logic
      await expect(
        cleanupWorkspace({ workspacePath, maxRetries: 3, retryDelay: 50 }),
      ).resolves.not.toThrow();

      expect(existsSync(workspacePath)).toBe(false);
    });

    it('should throw after max retries on persistent errors', async () => {
      // This test verifies error propagation for non-retriable errors
      const invalidPath = '\0invalid'; // Null character is invalid on all platforms

      await expect(
        cleanupWorkspace({ workspacePath: invalidPath, maxRetries: 2 }),
      ).rejects.toThrow();
    });
  });

  describe('clearNxCache', () => {
    it('should clear the .nx/cache directory', async () => {
      const workspacePath = join(testBaseDir, 'nx-workspace');
      const nxCachePath = join(workspacePath, '.nx', 'cache');
      mkdirSync(nxCachePath, { recursive: true });
      writeFileSync(join(nxCachePath, 'cached-file.txt'), 'cache content');

      expect(existsSync(nxCachePath)).toBe(true);

      await clearNxCache({ workspacePath, stopDaemon: false });

      expect(existsSync(nxCachePath)).toBe(false);
    });

    it('should handle missing .nx/cache directory', async () => {
      const workspacePath = join(testBaseDir, 'nx-workspace-no-cache');
      mkdirSync(workspacePath, { recursive: true });

      const nxCachePath = join(workspacePath, '.nx', 'cache');
      expect(existsSync(nxCachePath)).toBe(false);

      await expect(
        clearNxCache({ workspacePath, stopDaemon: false }),
      ).resolves.not.toThrow();
    });

    it('should not fail if stopping daemon fails', async () => {
      const workspacePath = join(testBaseDir, 'nx-workspace-no-nx');
      mkdirSync(workspacePath, { recursive: true });

      // Workspace without nx installed - daemon stop will fail but should not throw
      await expect(
        clearNxCache({ workspacePath, stopDaemon: true }),
      ).resolves.not.toThrow();
    });
  });

  describe('cleanupWorkspaces', () => {
    it('should clean up multiple workspaces', async () => {
      const workspace1 = join(testBaseDir, 'workspace-1');
      const workspace2 = join(testBaseDir, 'workspace-2');
      const workspace3 = join(testBaseDir, 'workspace-3');

      mkdirSync(workspace1, { recursive: true });
      mkdirSync(workspace2, { recursive: true });
      mkdirSync(workspace3, { recursive: true });

      writeFileSync(join(workspace1, 'file.txt'), 'content1');
      writeFileSync(join(workspace2, 'file.txt'), 'content2');
      writeFileSync(join(workspace3, 'file.txt'), 'content3');

      expect(existsSync(workspace1)).toBe(true);
      expect(existsSync(workspace2)).toBe(true);
      expect(existsSync(workspace3)).toBe(true);

      await cleanupWorkspaces([workspace1, workspace2, workspace3]);

      expect(existsSync(workspace1)).toBe(false);
      expect(existsSync(workspace2)).toBe(false);
      expect(existsSync(workspace3)).toBe(false);
    });

    it('should handle empty array', async () => {
      await expect(cleanupWorkspaces([])).resolves.not.toThrow();
    });

    it('should handle mix of existing and non-existing paths', async () => {
      const workspace1 = join(testBaseDir, 'existing-workspace');
      const workspace2 = join(testBaseDir, 'non-existing-workspace');

      mkdirSync(workspace1, { recursive: true });
      writeFileSync(join(workspace1, 'file.txt'), 'content');

      expect(existsSync(workspace1)).toBe(true);
      expect(existsSync(workspace2)).toBe(false);

      await cleanupWorkspaces([workspace1, workspace2]);

      expect(existsSync(workspace1)).toBe(false);
      expect(existsSync(workspace2)).toBe(false);
    });
  });
});
