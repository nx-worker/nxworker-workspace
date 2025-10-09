import {
  addDependenciesToPackageJson,
  formatFiles,
  NX_VERSION,
  readJson,
  runTasksInSerial,
  Tree,
} from '@nx/devkit';
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

  // Add dependencies to package.json
  // addDependenciesToPackageJson is a no-op if packages are already installed
  // We pass keepExistingVersions: true to prevent version mismatches
  if (!options.skipPackageJson) {
    const installTask = addDependenciesToPackageJson(
      tree,
      {},
      {
        '@nx/devkit': nxVersion,
        '@nx/workspace': nxVersion,
      },
      undefined,
      true,
    );
    tasks.push(installTask);
  }

  // Format files unless skipFormat is true
  if (!options.skipFormat) {
    await formatFiles(tree);
  }

  return runTasksInSerial(...tasks);
}

export default initGenerator;
