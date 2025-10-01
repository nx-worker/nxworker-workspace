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

/**
 * Sanitizes a file path by normalizing and validating it
 * Prevents path traversal attacks by ensuring the path doesn't escape the workspace
 */
function sanitizePath(filePath: string): string {
  // Remove leading slash
  let normalized = filePath.replace(/^\//, '');

  // Normalize the path to resolve '..' and '.'
  normalized = path.normalize(normalized);

  // Ensure the path doesn't try to escape using '..'
  if (normalized.startsWith('..') || normalized.includes(path.sep + '..')) {
    throw new Error(`Invalid path: path traversal detected in "${filePath}"`);
  }

  return normalized;
}

/**
 * Generator to move a file from one Nx project to another
 * and update import paths throughout the workspace.
 *
 * @param tree - The virtual file system tree
 * @param options - Generator options including source and target file paths
 * @returns A promise that resolves when the generator completes
 */
export async function moveFileGenerator(
  tree: Tree,
  options: MoveFileGeneratorSchema,
) {
  const projects = getProjects(tree);

  // Sanitize and normalize file paths
  const normalizedSource = sanitizePath(options.source);
  const normalizedTarget = sanitizePath(options.target);

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

  if (isExported && sourceImportPath && targetImportPath) {
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

  // Export the file from target project entrypoint if it was exported from source
  if (isExported && targetImportPath) {
    const targetRoot = targetProject.sourceRoot || targetProject.root;
    const relativeFilePathInTarget = path.relative(
      targetRoot,
      normalizedTarget,
    );
    ensureFileExported(tree, targetProject, relativeFilePathInTarget);
  }

  // Delete source file
  tree.delete(normalizedSource);

  await formatFiles(tree);
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
 * Escapes special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

      if (importPattern.test(content)) {
        // Update to use target reference (import path or relative path)
        const updatedContent = content.replace(
          importPattern,
          `from '${targetReference}'`,
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
