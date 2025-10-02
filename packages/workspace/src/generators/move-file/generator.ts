import {
  formatFiles,
  getProjects,
  ProjectConfiguration,
  Tree,
  visitNotIgnoredFiles,
  logger,
} from '@nx/devkit';
import * as path from 'path';
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
    updateImportPathsInDependentProjects(
      tree,
      projects,
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
  for (const [name, project] of projects.entries()) {
    const projectRoot = project.root;
    const sourceRoot = project.sourceRoot || project.root;

    // Check if file is within project's source root or project root
    if (
      filePath.startsWith(sourceRoot + '/') ||
      filePath.startsWith(projectRoot + '/')
    ) {
      return { project, name };
    }
  }

  return null;
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
    path.join(project.root, 'src', 'index.ts'),
  ];

  for (const indexPath of indexPaths) {
    if (tree.exists(indexPath)) {
      const content = tree.read(indexPath, 'utf-8');
      if (content) {
        // Check if file is exported (with or without extension)
        const fileWithoutExt = file.replace(/\.(ts|tsx|js|jsx)$/, '');
        const escapedFile = escapeRegex(fileWithoutExt);
        const exportPattern = new RegExp(
          `export.*from\\s+['"]\\.?\\.?/.*${escapedFile}['"]`,
        );
        if (exportPattern.test(content)) {
          return true;
        }
      }
    }
  }

  return false;
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

    // Look for path alias that matches this project
    for (const [alias, pathArray] of Object.entries(paths)) {
      const pathStr = Array.isArray(pathArray) ? pathArray[0] : pathArray;
      if (typeof pathStr === 'string') {
        // Check if path points to this project's index
        const sourceRoot = project.sourceRoot || project.root;
        if (
          pathStr.includes(sourceRoot) &&
          (pathStr.endsWith('index.ts') || pathStr.endsWith('src/index.ts'))
        ) {
          return alias;
        }
      }
    }
  } catch (error) {
    logger.warn(`Could not parse tsconfig.base.json: ${error}`);
  }

  return null;
}

/**
 * Updates import paths in all projects that depend on the source project
 */
function updateImportPathsInDependentProjects(
  tree: Tree,
  projects: Map<string, ProjectConfiguration>,
  sourceProjectName: string,
  sourceImportPath: string,
  targetImportPath: string,
): void {
  // For each project, check if it depends on source project
  projects.forEach((project, projectName) => {
    if (projectName === sourceProjectName) {
      return; // Skip source project
    }

    // Visit all TypeScript files in the project
    visitNotIgnoredFiles(tree, project.root, (filePath) => {
      if (
        filePath.endsWith('.ts') ||
        filePath.endsWith('.tsx') ||
        filePath.endsWith('.js') ||
        filePath.endsWith('.jsx')
      ) {
        updateImportsInFile(tree, filePath, sourceImportPath, targetImportPath);
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
  visitNotIgnoredFiles(tree, project.root, (filePath) => {
    if (
      (filePath.endsWith('.ts') ||
        filePath.endsWith('.tsx') ||
        filePath.endsWith('.js') ||
        filePath.endsWith('.jsx')) &&
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

        // If targetReference is an absolute file path (doesn't start with @ and contains extension or is a full path),
        // calculate relative path. Otherwise it's a TypeScript alias/import path.
        const isFilePath =
          !targetReference.startsWith('@') &&
          (targetReference.includes('.ts') ||
            targetReference.includes('.tsx') ||
            targetReference.includes('.js') ||
            targetReference.includes('.jsx') ||
            targetReference.startsWith('packages/'));

        if (isFilePath) {
          const fileDir = path.dirname(filePath);
          let relativePath = path.relative(fileDir, targetReference);

          // Ensure relative path starts with ./ or ../
          if (!relativePath.startsWith('.')) {
            relativePath = './' + relativePath;
          }

          // Remove file extension for import
          relativePath = relativePath.replace(/\.(ts|tsx|js|jsx)$/, '');
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
  let hasImports = false;

  visitNotIgnoredFiles(tree, project.root, (filePath) => {
    if (hasImports) return; // Short-circuit if we already found imports

    if (
      filePath.endsWith('.ts') ||
      filePath.endsWith('.tsx') ||
      filePath.endsWith('.js') ||
      filePath.endsWith('.jsx')
    ) {
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
  visitNotIgnoredFiles(tree, project.root, (filePath) => {
    if (
      filePath.endsWith('.ts') ||
      filePath.endsWith('.tsx') ||
      filePath.endsWith('.js') ||
      filePath.endsWith('.jsx')
    ) {
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
        relativePath = relativePath.replace(/\.(ts|tsx|js|jsx)$/, '');

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
  const indexPath =
    path.join(project.sourceRoot || project.root, 'index.ts') ||
    path.join(project.root, 'src', 'index.ts');

  let content = '';
  if (tree.exists(indexPath)) {
    content = tree.read(indexPath, 'utf-8') || '';
  }

  // Add export for the moved file
  const fileWithoutExt = file.replace(/\.(ts|tsx|js|jsx)$/, '');
  const exportStatement = `export * from './${fileWithoutExt}';\n`;

  // Check if export already exists
  if (!content.includes(exportStatement.trim())) {
    content += exportStatement;
    tree.write(indexPath, content);
    logger.info(`Added export to ${indexPath}`);
  }
}

export default moveFileGenerator;
