import {
  formatFiles,
  getProjects,
  ProjectConfiguration,
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
      sourceProjectName,
      sourceImportPath,
      targetImportPath,
    );
  } else {
    // File is not exported, only update imports within source project
    logger.info(`File is not exported, updating imports within source project`);
    updateImportPathsInProject(
      tree,
      sourceProject,
      normalizedSource,
      targetImportPath || normalizedTarget,
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
        pathStr: (Array.isArray(pathArray) ? pathArray[0] : pathArray) as string,
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
  sourceProjectName: string,
  sourceImportPath: string,
  targetImportPath: string,
): Promise<void> {
  // Get the project graph to find dependent projects
  const projectGraph = await createProjectGraphAsync();
  const projects = getProjects(tree);

  // Find all projects that have sourceProjectName as a dependency
  Array.from(projects.entries())
    .map(([projectName, project]) => ({
      project,
      projectDependencies: projectGraph.dependencies[projectName] || [],
      projectName,
    }))
    .filter(({ projectDependencies }) =>
      projectDependencies.some(
        (dependency) => dependency.target === sourceProjectName,
      ),
    )
    .forEach(({ project, projectName }) => {
      logger.info(`Checking project ${projectName} for imports`);
      // Visit all TypeScript/JavaScript files in the project
      visitNotIgnoredFiles(tree, project.root, (filePath) => {
        const fileExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'];
        if (fileExtensions.some((ext) => filePath.endsWith(ext))) {
          updateImportsInFile(
            tree,
            filePath,
            sourceImportPath,
            targetImportPath,
          );
        }
      });
    });
}

/**
 * Updates import paths within a single project
 */
function updateImportPathsInProject(
  tree: Tree,
  project: ProjectConfiguration,
  sourceFilePath: string,
  targetReference: string,
): void {
  const fileExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'];

  visitNotIgnoredFiles(tree, project.root, (filePath) => {
    if (
      fileExtensions.some((ext) => filePath.endsWith(ext)) &&
      filePath !== sourceFilePath &&
      filePath !== targetReference
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

      if (importPattern.test(content)) {
        // Determine what to replace with
        let replacementImport: string;

        // Check if targetReference is a TypeScript path alias or a file path
        // TypeScript aliases can be anything (not just starting with @)
        // Check if it's a file path by looking for file extensions or typical directory patterns
        const hasFileExtension = fileExtensions.some((ext) =>
          targetReference.includes(ext),
        );
        const looksLikeFilePath =
          targetReference.includes('/') &&
          (hasFileExtension ||
            targetReference.match(/^(packages|libs|apps|modules)\//));

        // If it looks like a file path, calculate relative path
        if (looksLikeFilePath) {
          const fileDir = path.dirname(filePath);
          let relativePath = path.relative(fileDir, targetReference);

          // Ensure relative path starts with ./ or ../
          if (!relativePath.startsWith('.')) {
            relativePath = './' + relativePath;
          }

          // Remove file extension for import
          relativePath = relativePath.replace(
            /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/,
            '',
          );
          replacementImport = relativePath;
        } else {
          // It's an import path (TypeScript alias)
          replacementImport = targetReference;
        }

        // Update to use target reference (import path or relative path)
        const updatedContent = content.replace(
          importPattern,
          `from '${replacementImport}'`,
        );
        tree.write(filePath, updatedContent);
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
        // Calculate relative path from this file to the target file
        const fileDir = path.dirname(filePath);
        const projectRoot = project.sourceRoot || project.root;
        const targetFilePath = path.join(projectRoot, targetRelativePath);
        let relativePath = path.relative(fileDir, targetFilePath);

        // Ensure relative path starts with ./ or ../
        if (!relativePath.startsWith('.')) {
          relativePath = './' + relativePath;
        }

        // Remove file extension for import
        relativePath = relativePath.replace(
          /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/,
          '',
        );

        const updatedContent = content.replace(
          importPattern,
          `from '${relativePath}'`,
        );
        tree.write(filePath, updatedContent);
        logger.info(`Updated imports to relative path in ${filePath}`);
      }
    }
  });
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

export default moveFileGenerator;
