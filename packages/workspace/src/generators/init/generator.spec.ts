import { Tree, addDependenciesToPackageJson, formatFiles } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { initGenerator } from './generator';
import { InitGeneratorSchema } from './schema';

// Mock @nx/devkit functions
jest.mock('@nx/devkit', () => {
  const actual = jest.requireActual('@nx/devkit');
  return {
    ...actual,
    formatFiles: jest.fn(),
    addDependenciesToPackageJson: jest.fn(() => jest.fn()),
    runTasksInSerial: jest.fn((...tasks) => async () => {
      for (const task of tasks) {
        await task();
      }
    }),
    NX_VERSION: '19.8.14',
  };
});

const formatFilesMock = jest.mocked(formatFiles);
const addDependenciesToPackageJsonMock = jest.mocked(
  addDependenciesToPackageJson,
);

describe('init generator', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    jest.clearAllMocks();
  });

  it('should add @nx/devkit and @nx/workspace as devDependencies', async () => {
    const options: InitGeneratorSchema = {
      skipFormat: true,
    };

    await initGenerator(tree, options);

    expect(addDependenciesToPackageJsonMock).toHaveBeenCalledWith(
      tree,
      {},
      {
        '@nx/devkit': '19.8.14',
        '@nx/workspace': '19.8.14',
      },
      undefined,
      true,
    );
    expect(formatFilesMock).not.toHaveBeenCalled();
  });

  it('should pass keepExistingVersions: true to prevent version mismatches', async () => {
    const options: InitGeneratorSchema = {
      skipFormat: true,
    };

    await initGenerator(tree, options);

    expect(addDependenciesToPackageJsonMock).toHaveBeenCalledWith(
      tree,
      {},
      {
        '@nx/devkit': '19.8.14',
        '@nx/workspace': '19.8.14',
      },
      undefined,
      true,
    );
  });

  it('should respect skipPackageJson option', async () => {
    const options: InitGeneratorSchema = {
      skipFormat: true,
      skipPackageJson: true,
    };

    await initGenerator(tree, options);

    expect(addDependenciesToPackageJsonMock).not.toHaveBeenCalled();
  });

  it('should call formatFiles when skipFormat is false', async () => {
    const options: InitGeneratorSchema = {
      skipFormat: false,
    };

    await initGenerator(tree, options);

    expect(formatFilesMock).toHaveBeenCalledWith(tree);
  });

  it('should use nx package version as fallback when NX_VERSION is not available', async () => {
    // Mock NX_VERSION as undefined
    const actualDevkit = jest.requireActual('@nx/devkit');
    jest.resetModules();
    jest.doMock('@nx/devkit', () => ({
      ...actualDevkit,
      formatFiles: jest.fn(),
      addDependenciesToPackageJson: jest.fn(() => jest.fn()),
      runTasksInSerial: jest.fn((...tasks) => async () => {
        for (const task of tasks) {
          await task();
        }
      }),
      NX_VERSION: undefined,
    }));

    // Add nx package to package.json
    const packageJson = JSON.parse(tree.read('package.json', 'utf-8') || '{}');
    packageJson.devDependencies = packageJson.devDependencies || {};
    packageJson.devDependencies['nx'] = '21.0.0';
    tree.write('package.json', JSON.stringify(packageJson, null, 2));

    // Re-import the generator
    const { initGenerator: initGen } = await import('./generator');
    const { addDependenciesToPackageJson: addDepsMock } = await import(
      '@nx/devkit'
    );

    const options: InitGeneratorSchema = {
      skipFormat: true,
    };

    await initGen(tree, options);

    expect(addDepsMock).toHaveBeenCalledWith(
      tree,
      {},
      {
        '@nx/devkit': '21.0.0',
        '@nx/workspace': '21.0.0',
      },
      undefined,
      true,
    );

    // Restore mocks
    jest.resetModules();
  });

  it('should throw error when NX_VERSION is not available and nx is not installed', async () => {
    // Mock NX_VERSION as undefined
    const actualDevkit = jest.requireActual('@nx/devkit');
    jest.resetModules();
    jest.doMock('@nx/devkit', () => ({
      ...actualDevkit,
      formatFiles: jest.fn(),
      addDependenciesToPackageJson: jest.fn(() => jest.fn()),
      runTasksInSerial: jest.fn((...tasks) => async () => {
        for (const task of tasks) {
          await task();
        }
      }),
      NX_VERSION: undefined,
    }));

    // Re-import the generator
    const { initGenerator: initGen } = await import('./generator');

    const options: InitGeneratorSchema = {
      skipFormat: true,
    };

    await expect(initGen(tree, options)).rejects.toThrow(
      'Could not determine Nx version. Please ensure nx is installed in your workspace.',
    );

    // Restore mocks
    jest.resetModules();
  });
});
