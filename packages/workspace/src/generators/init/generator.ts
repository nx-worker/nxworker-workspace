import {
  addDependenciesToPackageJson,
  formatFiles,
  readJson,
  Tree,
} from '@nx/devkit';
import { NX_VERSION } from '@nx/devkit/src/utils/package-json';
import { InitGeneratorSchema } from './schema';

/**
 * Gets the installed version of a package from package.json
 */
function getInstalledPackageVersion(
  tree: Tree,
  packageName: string,
): string | null {
  const packageJson = readJson(tree, 'package.json');
  return (
    packageJson.devDependencies?.[packageName] ||
    packageJson.dependencies?.[packageName] ||
    null
  );
}

/**
 * Initialize @nxworker/workspace plugin by installing required peer dependencies
 */
export async function initGenerator(
  tree: Tree,
  options: InitGeneratorSchema,
): Promise<() => void> {
  const tasks: (() => void | Promise<void>)[] = [];

  // Determine the version to use for @nx/devkit and @nx/workspace
  // Use NX_VERSION from @nx/devkit or fallback to the installed nx package version
  let nxVersion = NX_VERSION;
  
  if (!nxVersion) {
    const installedNxVersion = getInstalledPackageVersion(tree, 'nx');
    if (!installedNxVersion) {
      throw new Error(
        'Could not determine Nx version. Please ensure nx is installed in your workspace.',
      );
    }
    nxVersion = installedNxVersion;
  }

  const devDependencies: Record<string, string> = {};

  // Only add @nx/devkit if not already installed
  const installedDevkitVersion = getInstalledPackageVersion(tree, '@nx/devkit');
  if (!installedDevkitVersion) {
    devDependencies['@nx/devkit'] = nxVersion;
  }

  // Only add @nx/workspace if not already installed
  const installedWorkspaceVersion = getInstalledPackageVersion(
    tree,
    '@nx/workspace',
  );
  if (!installedWorkspaceVersion) {
    devDependencies['@nx/workspace'] = nxVersion;
  }

  // Add dependencies to package.json if there are any to add
  if (Object.keys(devDependencies).length > 0 && !options.skipPackageJson) {
    const installTask = addDependenciesToPackageJson(
      tree,
      {},
      devDependencies,
      undefined,
      options.keepExistingVersions,
    );
    tasks.push(installTask);
  }

  // Format files unless skipFormat is true
  if (!options.skipFormat) {
    await formatFiles(tree);
  }

  return async () => {
    for (const task of tasks) {
      await task();
    }
  };
}

export default initGenerator;
