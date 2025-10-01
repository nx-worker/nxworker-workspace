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
 * Generator to move a file from one Nx project to another
 * and update import paths throughout the workspace.
 *
 * @param tree - The virtual file system tree
 * @param options - Generator options including file path, source and target projects
 * @returns A promise that resolves when the generator completes
 */
export async function moveFileGenerator(
  tree: Tree,
  options: MoveFileGeneratorSchema,
) {
  const projects = getProjects(tree);

  // Validate source and target projects exist
  const sourceProject = projects.get(options.project);
  const targetProject = projects.get(options.targetProject);

  if (!sourceProject) {
    throw new Error(`Source project "${options.project}" not found`);
  }

  if (!targetProject) {
    throw new Error(`Target project "${options.targetProject}" not found`);
  }

  // Normalize file path
  const normalizedFile = options.file.replace(/^\//, '');

  // Get source and target paths
  const sourceRoot = sourceProject.sourceRoot || sourceProject.root;
  const targetRoot = targetProject.sourceRoot || targetProject.root;

  const sourceFilePath = path.join(sourceRoot, normalizedFile);
  const targetFilePath = path.join(targetRoot, normalizedFile);

  // Verify source file exists
  if (!tree.exists(sourceFilePath)) {
    throw new Error(`Source file "${sourceFilePath}" not found`);
  }

  logger.info(`Moving ${sourceFilePath} to ${targetFilePath}`);

  // Read the file content
  const fileContent = tree.read(sourceFilePath, 'utf-8');
  if (!fileContent) {
    throw new Error(`Could not read file "${sourceFilePath}"`);
  }

  // Create target file
  tree.write(targetFilePath, fileContent);

  // Check if file is exported from source project entrypoint
  const isExported = isFileExported(
    tree,
    sourceProject,
    normalizedFile,
  );

  // Get import paths for both projects
  const sourceImportPath = getProjectImportPath(
    tree,
    options.project,
    sourceProject,
  );
  const targetImportPath = getProjectImportPath(
    tree,
    options.targetProject,
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
      options.project,
      sourceImportPath,
      targetImportPath,
    );
  } else {
    // File is not exported, only update imports within source project
    logger.info(`File is not exported, updating imports within source project`);
    updateImportPathsInProject(
      tree,
      sourceProject,
      sourceFilePath,
      targetImportPath || targetFilePath,
    );
  }

  // Export the file from target project entrypoint if it was exported from source
  if (isExported && targetImportPath) {
    ensureFileExported(tree, targetProject, normalizedFile);
  }

  // Delete source file
  tree.delete(sourceFilePath);

  await formatFiles(tree);
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
        const exportPattern = new RegExp(
          `export.*from\\s+['"]\\.?\\.?/.*${fileWithoutExt.replace(/\//g, '\\/')}['"]`,
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

      // Get file name without extension
      const sourceFileName = path
        .basename(sourceFilePath, path.extname(sourceFilePath))
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

  // Replace imports from source path to target path
  const importPattern = new RegExp(
    `from\\s+['"]${sourceImportPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`,
    'g',
  );

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
