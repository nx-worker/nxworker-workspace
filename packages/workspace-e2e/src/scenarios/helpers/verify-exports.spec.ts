/**
 * Unit tests for export verification helpers
 */

import { verifyExportInIndex } from './verify-exports';
import { join } from 'node:path/posix';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

describe('verifyExportInIndex', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = join(tmpdir(), `verify-exports-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should pass when export is found in index.ts', () => {
    // Arrange
    const libName = 'lib-a';
    const libPath = join(testDir, libName, 'src');
    mkdirSync(libPath, { recursive: true });

    const indexContent = `export * from './lib/helper';\n`;
    writeFileSync(join(libPath, 'index.ts'), indexContent, 'utf-8');

    // Act & Assert
    expect(() => {
      verifyExportInIndex(testDir, libName, 'helper');
    }).not.toThrow();
  });

  it('should throw when export is not found in index.ts', () => {
    // Arrange
    const libName = 'lib-a';
    const libPath = join(testDir, libName, 'src');
    mkdirSync(libPath, { recursive: true });

    const indexContent = `export * from './lib/util';\n`;
    writeFileSync(join(libPath, 'index.ts'), indexContent, 'utf-8');

    // Act & Assert
    expect(() => {
      verifyExportInIndex(testDir, libName, 'helper');
    }).toThrow(/does not export 'helper'/);
  });

  it('should include index content in error message', () => {
    // Arrange
    const libName = 'lib-a';
    const libPath = join(testDir, libName, 'src');
    mkdirSync(libPath, { recursive: true });

    const indexContent = `export * from './lib/util';\n`;
    writeFileSync(join(libPath, 'index.ts'), indexContent, 'utf-8');

    // Act & Assert
    expect(() => {
      verifyExportInIndex(testDir, libName, 'helper');
    }).toThrow(/Content:.*export.*util/s);
  });

  it('should work with named exports', () => {
    // Arrange
    const libName = 'lib-a';
    const libPath = join(testDir, libName, 'src');
    mkdirSync(libPath, { recursive: true });

    const indexContent = `export { helper } from './lib/helper';\n`;
    writeFileSync(join(libPath, 'index.ts'), indexContent, 'utf-8');

    // Act & Assert
    expect(() => {
      verifyExportInIndex(testDir, libName, 'helper');
    }).not.toThrow();
  });

  it('should work with barrel exports', () => {
    // Arrange
    const libName = 'lib-a';
    const libPath = join(testDir, libName, 'src');
    mkdirSync(libPath, { recursive: true });

    const indexContent = `export * from './lib/helper';\nexport * from './lib/util';\n`;
    writeFileSync(join(libPath, 'index.ts'), indexContent, 'utf-8');

    // Act & Assert
    expect(() => {
      verifyExportInIndex(testDir, libName, 'helper');
    }).not.toThrow();

    expect(() => {
      verifyExportInIndex(testDir, libName, 'util');
    }).not.toThrow();
  });
});
