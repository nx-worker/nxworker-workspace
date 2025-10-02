import {
  formatFiles,
  getProjects,
  ProjectConfiguration,
  ProjectGraph,
  Tree,
  visitNotIgnoredFiles,
  logger,
  createProjectGraphAsync,
} from '@nx/devkit';
import { posix as path } from 'path';
import { MoveFileGeneratorSchema } from './schema';
import { sanitizePath, escapeRegex } from './security-utils';

/**
 * Generator to move a file from one Nx project to another
 * and update import paths throughout the workspace.
 *
 * @param tree - The virtual file system tree
 * @param options - Generator options including from and to file paths
 * @returns A promise that resolves when the generator completes
 */
export async function moveFileGenerator(
  tree: Tree,
  options: MoveFileGeneratorSchema,
) {
  const projects = getProjects(tree);
  const projectGraph = await createProjectGraphAsync();

  // Sanitize and normalize file paths
  const normalizedSource = sanitizePath(options.from);
  const normalizedTarget = sanitizePath(options.to);

  // Verify source file exists
  if (!tree.exists(normalizedSource)) {
    throw new Error(`Source file "${normalizedSource}" not found`);
  }

  // Find which project the source file belongs to
  const sourceProjectInfo = findProjectForFile(projects, normalizedSource);

  if (!sourceProjectInfo) {
    throw new Error(
      `Could not determine source project for file "${normalizedSource}"`,
    );
  }

  const { project: sourceProject, name: sourceProjectName } = sourceProjectInfo;

  // Find which project the target file should belong to
  const targetProjectInfo = findProjectForFile(projects, normalizedTarget);

  if (!targetProjectInfo) {
    throw new Error(
      `Could not determine target project for file "${normalizedTarget}"`,
    );
  }

  const { project: targetProject, name: targetProjectName } = targetProjectInfo;

  logger.info(
    `Moving ${normalizedSource} (project: ${sourceProjectName}) to ${normalizedTarget} (project: ${targetProjectName})`,
  );

  // Read the file content
  const fileContent = tree.read(normalizedSource, 'utf-8');
  if (!fileContent) {
    throw new Error(`Could not read file "${normalizedSource}"`);
  }

  // Create target file
  tree.write(normalizedTarget, fileContent);

  // Get the relative path within the source project to check if it's exported
  const sourceRoot = sourceProject.sourceRoot || sourceProject.root;
  const relativeFilePathInSource = path.relative(sourceRoot, normalizedSource);

  // Check if file is exported from source project entrypoint
  const isExported = isFileExported(
    tree,
    sourceProject,
    relativeFilePathInSource,
  );

  // Get import paths for both projects
  const sourceImportPath = getProjectImportPath(
    tree,
    sourceProjectName,
    sourceProject,
  );
  const targetImportPath = getProjectImportPath(
    tree,
    targetProjectName,
    targetProject,
  );

  // Check if target project already has imports to this file
  const hasImportsInTarget =
    targetImportPath &&
    checkForImportsInProject(
      tree,
      targetProject,
      sourceImportPath || normalizedSource,
    );

  // Check if moving within the same project
  const isSameProject = sourceProjectName === targetProjectName;

  if (isSameProject) {
    // Moving within same project - update to relative imports
    logger.info(
      `Moving within same project, updating imports to relative paths`,
    );
    updateImportPathsInProject(
      tree,
      sourceProject,
      normalizedSource,
      normalizedTarget,
    );
  } else if (isExported && sourceImportPath && targetImportPath) {
    // File is exported, need to update all dependent projects
    logger.info(
      `File is exported from ${sourceImportPath}, updating dependent projects`,
    );
    await updateImportPathsInDependentProjects(
      tree,
      projectGraph,
      projects,
      sourceProjectName,
      sourceImportPath,
      targetImportPath,
    );

    // Also update imports within the source project to use target import path
    updateImportPathsToPackageAlias(
      tree,
      sourceProject,
      normalizedSource,
      targetImportPath,
    );

    // Remove export from source project's index
    removeFileExport(tree, sourceProject, relativeFilePathInSource);
  } else if (!isSameProject && targetImportPath) {
    // File is not exported but moving to different project
    // Update imports in source project to use target import path
    logger.info(
      `File is not exported, updating imports within source project to use target import path`,
    );
    updateImportPathsToPackageAlias(
      tree,
      sourceProject,
      normalizedSource,
      targetImportPath,
    );
  } else {
    // Fallback: update to relative paths if no import path available
    logger.info(`Updating imports within source project to relative paths`);
    updateImportPathsInProject(
      tree,
      sourceProject,
      normalizedSource,
      normalizedTarget,
    );
  }

  // Update imports in target project to relative imports if they exist
  // (skip if moving within same project)
  if (!isSameProject && hasImportsInTarget && targetImportPath) {
    logger.info(`Updating imports in target project to relative imports`);
    const targetRoot = targetProject.sourceRoot || targetProject.root;
    const relativeFilePathInTarget = path.relative(
      targetRoot,
      normalizedTarget,
    );
    updateImportsToRelative(
      tree,
      targetProject,
      sourceImportPath || normalizedSource,
      relativeFilePathInTarget,
    );
  }

  // Export the file from target project entrypoint if:
  // - It was exported from source, OR
  // - Target project has imports to it, OR
  // - skipExport is not set
  // (skip if moving within same project unless it was already exported)
  const shouldExport =
    (!isSameProject &&
      (isExported || hasImportsInTarget) &&
      !options.skipExport) ||
    (isSameProject && isExported && !options.skipExport);

  if (shouldExport && targetImportPath) {
    const targetRoot = targetProject.sourceRoot || targetProject.root;
    const relativeFilePathInTarget = path.relative(
      targetRoot,
      normalizedTarget,
    );
    ensureFileExported(tree, targetProject, relativeFilePathInTarget);
  }

  // Delete source file
  tree.delete(normalizedSource);

  if (!options.skipFormat) {
    await formatFiles(tree);
  }
}

/**
 * Finds the project that contains the given file path
 *
 * @param projects - Map of all projects in the workspace
 * @param filePath - File path relative to workspace root
 * @returns Project configuration and name, or null if not found
 */
function findProjectForFile(
  projects: Map<string, ProjectConfiguration>,
  filePath: string,
): { project: ProjectConfiguration; name: string } | null {
  const entry = Array.from(projects.entries()).find(([, project]) => {
    const projectRoot = project.root;
    const sourceRoot = project.sourceRoot || project.root;

    // Check if file is within project's source root or project root
    return (
      filePath.startsWith(sourceRoot + '/') ||
      filePath.startsWith(projectRoot + '/')
    );
  });

  return entry ? { project: entry[1], name: entry[0] } : null;
}

/**
 * Checks if a file is exported from the project's entrypoint
 */
function isFileExported(
  tree: Tree,
  project: ProjectConfiguration,
  file: string,
): boolean {
  const indexPaths = [
    path.join(project.sourceRoot || project.root, 'index.ts'),
    path.join(project.sourceRoot || project.root, 'index.mts'),
    path.join(project.sourceRoot || project.root, 'index.mjs'),
    path.join(project.sourceRoot || project.root, 'index.js'),
    path.join(project.root, 'src', 'index.ts'),
    path.join(project.root, 'src', 'index.mts'),
  ];

  const fileWithoutExt = file.replace(/\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/, '');
  const escapedFile = escapeRegex(fileWithoutExt);

  return indexPaths.some((indexPath) => {
    if (!tree.exists(indexPath)) {
      return false;
    }
    const content = tree.read(indexPath, 'utf-8');
    if (!content) {
      return false;
    }
    // Support: export ... from "path"
    // Support: export * from "path"
    // Support: export { Something } from "path"
    const exportPattern = new RegExp(
      `export\\s+(?:\\*|\\{[^}]+\\}|.+)\\s+from\\s+['"]\\.?\\.?/.*${escapedFile}['"]`,
    );
    return exportPattern.test(content);
  });
}

/**
 * Gets the TypeScript import path for a project from tsconfig.base.json
 */
function getProjectImportPath(
  tree: Tree,
  projectName: string,
  project: ProjectConfiguration,
): string | null {
  const tsconfigPath = 'tsconfig.base.json';
  if (!tree.exists(tsconfigPath)) {
    return null;
  }

  try {
    const tsconfigContent = tree.read(tsconfigPath, 'utf-8');
    if (!tsconfigContent) {
      return null;
    }

    const tsconfig = JSON.parse(tsconfigContent);
    const paths = tsconfig.compilerOptions?.paths || {};
    const sourceRoot = project.sourceRoot || project.root;

    const isIndexFile = (pathStr: string): boolean =>
      pathStr.endsWith('index.ts') ||
      pathStr.endsWith('index.mts') ||
      pathStr.endsWith('src/index.ts');

    // Look for path alias that matches this project
    const matchingAlias = Object.entries(paths)
      .map(([alias, pathArray]) => ({
        alias,
        pathStr: (Array.isArray(pathArray)
          ? pathArray[0]
          : pathArray) as string,
      }))
      .filter(({ pathStr }) => typeof pathStr === 'string')
      .find(({ alias, pathStr }) => {
        // Check if path points to this project's index
        if (!pathStr.includes(sourceRoot) || !isIndexFile(pathStr)) {
          return false;
        }

        // Handle wildcard aliases (e.g., "@scope/*": ["packages/*/src/index.ts"])
        if (alias.includes('*') && pathStr.includes('*')) {
          return true;
        }

        // Non-wildcard alias
        return true;
      });

    if (!matchingAlias) {
      return null;
    }

    const { alias, pathStr } = matchingAlias;

    // Extract project-specific alias for wildcard patterns
    if (alias.includes('*') && pathStr.includes('*')) {
      const projectDirName = sourceRoot.split('/').pop();
      return alias.replace('*', projectDirName || projectName);
    }

    return alias;
  } catch (error) {
    logger.warn(`Could not parse tsconfig.base.json: ${error}`);
  }

  return null;
}

/**
 * Updates import paths in all projects that depend on the source project
 */
async function updateImportPathsInDependentProjects(
  tree: Tree,
  projectGraph: ProjectGraph,
  projects: Map<string, ProjectConfiguration>,
  sourceProjectName: string,
  sourceImportPath: string,
  targetImportPath: string,
): Promise<void> {
  const dependentProjectNames = getDependentProjectNames(
    projectGraph,
    sourceProjectName,
  );

  const candidates = dependentProjectNames.length
    ? dependentProjectNames
    : Array.from(projects.entries())
        .filter(([, project]) =>
          checkForImportsInProject(tree, project, sourceImportPath),
        )
        .map(([name]) => name);

  candidates.forEach((dependentName) => {
    const dependentProject = projects.get(dependentName);
    if (!dependentProject) {
      return;
    }

    logger.info(`Checking project ${dependentName} for imports`);
    updateImportsByAliasInProject(
      tree,
      dependentProject,
      sourceImportPath,
      targetImportPath,
    );
  });
}

/**
 * Updates import paths within a single project to use a package alias
 */
function updateImportPathsToPackageAlias(
  tree: Tree,
  project: ProjectConfiguration,
  sourceFilePath: string,
  targetPackageAlias: string,
): void {
  const fileExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'];

  visitNotIgnoredFiles(tree, project.root, (filePath) => {
    if (
      fileExtensions.some((ext) => filePath.endsWith(ext)) &&
      filePath !== sourceFilePath
    ) {
      const content = tree.read(filePath, 'utf-8');
      if (!content) return;

      // Get file name without extension and escape for regex
      const sourceFileName = escapeRegex(
        path.basename(sourceFilePath, path.extname(sourceFilePath)),
      );

      // Check if this file imports the source file using relative imports
      const importPattern = new RegExp(
        `from\\s+['"](\\.{1,2}/[^'"]*${sourceFileName})['"]`,
        'g',
      );

      // Test if pattern exists before replacing
      if (importPattern.test(content)) {
        // Reset regex lastIndex after test
        importPattern.lastIndex = 0;

        // Update all occurrences to use the package alias
        const updatedContent = content.replace(
          importPattern,
          `from '${targetPackageAlias}'`,
        );
        tree.write(filePath, updatedContent);
        logger.info(`Updated imports to use package alias in ${filePath}`);
      }
    }
  });
}

/**
 * Updates import paths within a single project
 */
function updateImportPathsInProject(
  tree: Tree,
  project: ProjectConfiguration,
  sourceFilePath: string,
  targetFilePath: string,
): void {
  const fileExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'];

  visitNotIgnoredFiles(tree, project.root, (filePath) => {
    if (
      fileExtensions.some((ext) => filePath.endsWith(ext)) &&
      filePath !== sourceFilePath &&
      filePath !== targetFilePath
    ) {
      const content = tree.read(filePath, 'utf-8');
      if (!content) return;

      // Get file name without extension and escape for regex
      const sourceFileName = escapeRegex(
        path.basename(sourceFilePath, path.extname(sourceFilePath)),
      );

      // Check if this file imports the source file using relative imports
      const importPattern = new RegExp(
        `from\\s+['"](\\.{1,2}/[^'"]*${sourceFileName})['"]`,
        'g',
      );

      // Test if pattern exists before replacing
      if (importPattern.test(content)) {
        // Reset regex lastIndex after test
        importPattern.lastIndex = 0;

        const relativeSpecifier = getRelativeImportSpecifier(
          filePath,
          targetFilePath,
        );

        // Update all occurrences
        const updatedContent = content.replace(
          importPattern,
          `from '${relativeSpecifier}'`,
        );
        tree.write(filePath, updatedContent);
        logger.info(`Updated relative imports in ${filePath}`);
      }
    }
  });
}

/**
 * Updates imports in a single file
 */
function updateImportsInFile(
  tree: Tree,
  filePath: string,
  sourceImportPath: string,
  targetImportPath: string,
): void {
  const content = tree.read(filePath, 'utf-8');
  if (!content) return;

  // Replace imports from source path to target path (escape regex special chars)
  const escapedSourcePath = escapeRegex(sourceImportPath);
  const importPattern = new RegExp(`from\\s+['"]${escapedSourcePath}['"]`, 'g');

  if (importPattern.test(content)) {
    const updatedContent = content.replace(
      importPattern,
      `from '${targetImportPath}'`,
    );
    tree.write(filePath, updatedContent);
    logger.info(`Updated imports in ${filePath}`);
  }
}

/**
 * Checks if a project has imports to a given file/path
 */
function checkForImportsInProject(
  tree: Tree,
  project: ProjectConfiguration,
  importPath: string,
): boolean {
  const fileExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'];
  let hasImports = false;

  visitNotIgnoredFiles(tree, project.root, (filePath) => {
    if (hasImports) return; // Short-circuit if we already found imports

    if (fileExtensions.some((ext) => filePath.endsWith(ext))) {
      const content = tree.read(filePath, 'utf-8');
      if (!content) return;

      const escapedPath = escapeRegex(importPath);
      const importPattern = new RegExp(`from\\s+['"]${escapedPath}['"]`);

      if (importPattern.test(content)) {
        hasImports = true;
      }
    }
  });

  return hasImports;
}

/**
 * Updates imports in target project from absolute import path to relative imports
 */
function updateImportsToRelative(
  tree: Tree,
  project: ProjectConfiguration,
  sourceImportPath: string,
  targetRelativePath: string,
): void {
  const fileExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'];

  visitNotIgnoredFiles(tree, project.root, (filePath) => {
    if (fileExtensions.some((ext) => filePath.endsWith(ext))) {
      const content = tree.read(filePath, 'utf-8');
      if (!content) return;

      const escapedSourcePath = escapeRegex(sourceImportPath);
      const importPattern = new RegExp(
        `from\\s+['"]${escapedSourcePath}['"]`,
        'g',
      );

      if (importPattern.test(content)) {
        const projectRoot = project.sourceRoot || project.root;
        const targetFilePath = path.join(projectRoot, targetRelativePath);
        const relativeSpecifier = getRelativeImportSpecifier(
          filePath,
          targetFilePath,
        );

        const updatedContent = content.replace(
          importPattern,
          `from '${relativeSpecifier}'`,
        );
        tree.write(filePath, updatedContent);
        logger.info(`Updated imports to relative path in ${filePath}`);
      }
    }
  });
}

function updateImportsByAliasInProject(
  tree: Tree,
  project: ProjectConfiguration,
  sourceImportPath: string,
  targetImportPath: string,
): void {
  const fileExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'];
  const escapedSourcePath = escapeRegex(sourceImportPath);
  const replacementPatterns: Array<{ pattern: RegExp; replacement: string }> = [
    {
      pattern: new RegExp(`from\\s+['"]${escapedSourcePath}['"]`, 'g'),
      replacement: `from '${targetImportPath}'`,
    },
    {
      pattern: new RegExp(
        `import\\s*\\(\\s*['"]${escapedSourcePath}['"]\\s*\\)`,
        'g',
      ),
      replacement: `import('${targetImportPath}')`,
    },
    {
      pattern: new RegExp(
        `require\\(\\s*['"]${escapedSourcePath}['"]\\s*\\)`,
        'g',
      ),
      replacement: `require('${targetImportPath}')`,
    },
  ];

  visitNotIgnoredFiles(tree, project.root, (filePath) => {
    if (fileExtensions.some((ext) => filePath.endsWith(ext))) {
      const originalContent = tree.read(filePath, 'utf-8');
      if (!originalContent) {
        return;
      }

      let updatedContent = originalContent;
      let hasChanges = false;

      replacementPatterns.forEach(({ pattern, replacement }) => {
        const replacedContent = updatedContent.replace(pattern, replacement);
        if (replacedContent !== updatedContent) {
          updatedContent = replacedContent;
          hasChanges = true;
        }
      });

      if (hasChanges && updatedContent !== originalContent) {
        tree.write(filePath, updatedContent);
        logger.info(`Updated imports in ${filePath}`);
      }
    }
  });
}

function buildReverseDependencyMap(
  projectGraph: ProjectGraph,
): Map<string, Set<string>> {
  const reverse = new Map<string, Set<string>>();

  Object.entries(projectGraph.dependencies || {}).forEach(
    ([source, dependencies]) => {
      dependencies.forEach((dependency) => {
        const dependents = reverse.get(dependency.target);
        if (dependents) {
          dependents.add(source);
        } else {
          reverse.set(dependency.target, new Set([source]));
        }
      });
    },
  );

  return reverse;
}

function getDependentProjectNames(
  projectGraph: ProjectGraph,
  projectName: string,
): string[] {
  const reverseMap = buildReverseDependencyMap(projectGraph);
  const dependents = new Set<string>();
  const queue: string[] = [projectName];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    const directDependents = reverseMap.get(current);
    if (!directDependents) {
      continue;
    }

    directDependents.forEach((dependent) => {
      if (!dependents.has(dependent)) {
        dependents.add(dependent);
        queue.push(dependent);
      }
    });
  }

  dependents.delete(projectName);
  return Array.from(dependents);
}

function toAbsoluteWorkspacePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return path.join('/', normalized);
}

function stripFileExtension(importPath: string): string {
  return importPath.replace(/\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/, '');
}

function getRelativeImportSpecifier(
  fromFilePath: string,
  toFilePath: string,
): string {
  const normalizedFrom = fromFilePath.replace(/\\/g, '/');
  const normalizedTo = toFilePath.replace(/\\/g, '/');
  const absoluteFromDir = path.dirname(toAbsoluteWorkspacePath(normalizedFrom));
  const absoluteTarget = toAbsoluteWorkspacePath(normalizedTo);
  let relativePath = path.relative(absoluteFromDir, absoluteTarget);

  if (!relativePath.startsWith('.')) {
    relativePath = `./${relativePath}`;
  }

  relativePath = relativePath.replace(/\\/g, '/');
  return stripFileExtension(relativePath);
}

/**
 * Ensures the file is exported from the target project's entrypoint
 */
function ensureFileExported(
  tree: Tree,
  project: ProjectConfiguration,
  file: string,
): void {
  const indexPaths = [
    path.join(project.sourceRoot || project.root, 'index.ts'),
    path.join(project.sourceRoot || project.root, 'index.mts'),
    path.join(project.root, 'src', 'index.ts'),
    path.join(project.root, 'src', 'index.mts'),
  ];

  // Find the first existing index file
  const indexPath = indexPaths.find((p) => tree.exists(p)) || indexPaths[0];

  let content = '';
  if (tree.exists(indexPath)) {
    content = tree.read(indexPath, 'utf-8') || '';
  }

  // Add export for the moved file
  const fileWithoutExt = file.replace(/\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/, '');
  const exportStatement = `export * from './${fileWithoutExt}';\n`;

  // Check if export already exists
  if (!content.includes(exportStatement.trim())) {
    content += exportStatement;
    tree.write(indexPath, content);
    logger.info(`Added export to ${indexPath}`);
  }
}

/**
 * Removes the export for a file from the project's entrypoint
 */
function removeFileExport(
  tree: Tree,
  project: ProjectConfiguration,
  file: string,
): void {
  const indexPaths = [
    path.join(project.sourceRoot || project.root, 'index.ts'),
    path.join(project.sourceRoot || project.root, 'index.mts'),
    path.join(project.root, 'src', 'index.ts'),
    path.join(project.root, 'src', 'index.mts'),
  ];

  // Find existing index files
  indexPaths.forEach((indexPath) => {
    if (!tree.exists(indexPath)) {
      return;
    }

    const content = tree.read(indexPath, 'utf-8');
    if (!content) {
      return;
    }

    // Remove export for the file
    const fileWithoutExt = file.replace(
      /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/,
      '',
    );
    const escapedFile = escapeRegex(fileWithoutExt);

    // Match various export patterns
    const exportPatterns = [
      new RegExp(
        `export\\s+\\*\\s+from\\s+['"]\\.\\.?/${escapedFile}['"];?\\s*\\n?`,
        'g',
      ),
      new RegExp(
        `export\\s+\\{[^}]+\\}\\s+from\\s+['"]\\.\\.?/${escapedFile}['"];?\\s*\\n?`,
        'g',
      ),
    ];

    let updatedContent = content;
    exportPatterns.forEach((pattern) => {
      updatedContent = updatedContent.replace(pattern, '');
    });

    if (updatedContent !== content) {
      tree.write(indexPath, updatedContent);
      logger.info(`Removed export from ${indexPath}`);
    }
  });
}

export default moveFileGenerator;
