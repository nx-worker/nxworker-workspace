import {
  formatFiles,
  getProjects,
  ProjectConfiguration,
  ProjectGraph,
  Tree,
  visitNotIgnoredFiles,
  logger,
  createProjectGraphAsync,
  normalizePath,
  glob,
} from '@nx/devkit';
import { removeGenerator } from '@nx/workspace';
import { posix as path } from 'node:path';
import { MoveFileGeneratorSchema } from './schema';
import { sanitizePath } from './security-utils/sanitize-path';
import { escapeRegex } from './security-utils/escape-regex';
import { isValidPathInput } from './security-utils/is-valid-path-input';

/**
 * Generator to move a file from one Nx project to another
 * and update import paths throughout the workspace.
 *
 * @param tree - The virtual file system tree
 * @param options - Generator options including source file path and target project
 * @returns A promise that resolves when the generator completes
 */
export async function moveFileGenerator(
  tree: Tree,
  options: MoveFileGeneratorSchema,
) {
  const projects = getProjects(tree);
  const projectGraph = await createProjectGraphAsync();

  // Support comma-separated file paths and glob patterns
  // We need to be careful about commas inside brace expansions like {ts,js}
  const patterns = splitPatterns(options.file);

  if (patterns.length === 0) {
    throw new Error('At least one file path or glob pattern must be provided');
  }

  // Expand glob patterns to actual file paths
  const filePaths: string[] = [];
  for (const pattern of patterns) {
    // Check if pattern contains glob characters
    const isGlobPattern = /[*?[\]{}]/.test(pattern);
    
    if (isGlobPattern) {
      // Use glob to find matching files
      const matches = glob(tree, [pattern]);
      if (matches.length === 0) {
        throw new Error(`No files found matching glob pattern: "${pattern}"`);
      }
      filePaths.push(...matches);
    } else {
      // Direct file path
      filePaths.push(pattern);
    }
  }

  // Remove duplicates (in case multiple patterns match the same file)
  const uniqueFilePaths = Array.from(new Set(filePaths));

  if (uniqueFilePaths.length === 0) {
    throw new Error('At least one file path must be provided');
  }

  // Validate and resolve all files upfront
  const contexts = uniqueFilePaths.map((filePath) => {
    const fileOptions = { ...options, file: filePath };
    return resolveAndValidate(tree, fileOptions, projects);
  });

  // Track unique source projects for removal check
  const sourceProjectNames = new Set<string>();
  contexts.forEach((ctx) => {
    sourceProjectNames.add(ctx.sourceProjectName);
  });

  // Execute all moves without deleting sources yet
  for (let i = 0; i < contexts.length; i++) {
    const ctx = contexts[i];
    const fileOptions = { ...options, file: uniqueFilePaths[i] };
    await executeMove(tree, fileOptions, projects, projectGraph, ctx, true);
  }

  // Delete all source files after all moves are complete
  for (const ctx of contexts) {
    tree.delete(ctx.normalizedSource);
  }

  // Check if any source projects should be removed
  if (options.removeEmptyProject) {
    for (const projectName of sourceProjectNames) {
      const project = projects.get(projectName);
      if (project && isProjectEmpty(tree, project)) {
        logger.debug(`Project ${projectName} is empty, removing it`);
        try {
          await removeGenerator(tree, {
            projectName,
            skipFormat: true,
            forceRemove: false,
          });
        } catch (error) {
          logger.error(
            `Failed to remove empty project ${projectName}: ${error}`,
          );
        }
      }
    }
  }

  // Format files once at the end
  if (!options.skipFormat) {
    await formatFiles(tree);
  }
}

/**
 * Split a string by commas, but ignore commas inside brace expansions.
 * For example: "file1.ts,file.{ts,js}" => ["file1.ts", "file.{ts,js}"]
 */
function splitPatterns(input: string): string[] {
  const patterns: string[] = [];
  let current = '';
  let braceDepth = 0;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (char === '{') {
      braceDepth++;
      current += char;
    } else if (char === '}') {
      braceDepth--;
      current += char;
    } else if (char === ',' && braceDepth === 0) {
      // This is a separator comma, not part of a brace expansion
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        patterns.push(trimmed);
      }
      current = '';
    } else {
      current += char;
    }
  }

  // Don't forget the last pattern
  const trimmed = current.trim();
  if (trimmed.length > 0) {
    patterns.push(trimmed);
  }

  return patterns;
}

/**
 * Builds the target file path from the target project and optional directory.
 *
 * @param targetProject - Target project configuration.
 * @param sourceFilePath - Original source file path (used to extract filename).
 * @param projectDirectory - Optional directory within the target project, appended to base directory.
 * @returns The full target file path.
 */
function buildTargetPath(
  targetProject: ProjectConfiguration,
  sourceFilePath: string,
  projectDirectory?: string,
): string {
  const fileName = path.basename(sourceFilePath);

  // Determine base directory
  const baseRoot =
    targetProject.sourceRoot || path.join(targetProject.root, 'src');

  // Use 'app' for application projects, 'lib' for library projects
  const baseDir = targetProject.projectType === 'application' ? 'app' : 'lib';

  // If projectDirectory is specified, append it to the base directory
  const targetDir = projectDirectory
    ? path.join(baseDir, projectDirectory)
    : baseDir;

  return normalizePath(path.join(baseRoot, targetDir, fileName));
}

/**
 * Normalizes, validates, and gathers metadata about the source and target files.
 *
 * @param tree - The virtual file system tree.
 * @param options - Raw options supplied to the generator.
 * @param projects - Map of all projects in the workspace.
 * @returns Resolved context data describing the move operation.
 */
function resolveAndValidate(
  tree: Tree,
  options: MoveFileGeneratorSchema,
  projects: Map<string, ProjectConfiguration>,
) {
  // Check if the file input contains glob characters
  const isGlobPattern = /[*?[\]{}]/.test(options.file);
  
  // Validate user input to avoid accepting regex-like patterns or dangerous characters
  if (
    !isValidPathInput(options.file, {
      allowUnicode: !!options.allowUnicode,
      allowGlobPatterns: isGlobPattern,
    })
  ) {
    throw new Error(
      `Invalid path input for 'file': contains disallowed characters: "${options.file}"`,
    );
  }

  // Validate project name
  if (
    !isValidPathInput(options.project, {
      allowUnicode: !!options.allowUnicode,
    })
  ) {
    throw new Error(
      `Invalid project name: contains disallowed characters: "${options.project}"`,
    );
  }

  // Validate project name exists
  const targetProject = projects.get(options.project);
  if (!targetProject) {
    throw new Error(
      `Target project "${options.project}" not found in workspace`,
    );
  }

  // Validate projectDirectory if provided
  if (
    options.projectDirectory &&
    !isValidPathInput(options.projectDirectory, {
      allowUnicode: !!options.allowUnicode,
    })
  ) {
    throw new Error(
      `Invalid path input for 'projectDirectory': contains disallowed characters: "${options.projectDirectory}"`,
    );
  }

  const normalizedSource = sanitizePath(options.file);

  // Sanitize projectDirectory to prevent path traversal
  const sanitizedProjectDirectory = options.projectDirectory
    ? sanitizePath(options.projectDirectory)
    : undefined;

  // Construct target path from project and optional directory
  const normalizedTarget = buildTargetPath(
    targetProject,
    normalizedSource,
    sanitizedProjectDirectory,
  );

  // Verify source file exists
  if (!tree.exists(normalizedSource)) {
    throw new Error(`Source file "${normalizedSource}" not found`);
  }

  // Verify target file does not exist
  if (tree.exists(normalizedTarget)) {
    throw new Error(`Target file "${normalizedTarget}" already exists`);
  }

  // Find which project the source file belongs to
  const sourceProjectInfo = findProjectForFile(projects, normalizedSource);

  if (!sourceProjectInfo) {
    throw new Error(
      `Could not determine source project for file "${normalizedSource}"`,
    );
  }

  const { project: sourceProject, name: sourceProjectName } = sourceProjectInfo;

  const targetProjectName = options.project;

  // Read the file content
  const fileContent = tree.read(normalizedSource, 'utf-8');
  if (!fileContent) {
    throw new Error(`Could not read file "${normalizedSource}"`);
  }

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

  return {
    normalizedSource,
    normalizedTarget,
    sourceProject,
    sourceProjectName,
    targetProject,
    targetProjectName,
    fileContent,
    sourceRoot,
    relativeFilePathInSource,
    isExported,
    sourceImportPath,
    targetImportPath,
    hasImportsInTarget,
    isSameProject,
  };
}

type MoveContext = ReturnType<typeof resolveAndValidate>;

/**
 * Coordinates the move workflow by executing the individual move steps in order.
 *
 * @param tree - The virtual file system tree.
 * @param options - Generator options controlling the move.
 * @param projects - Map of all projects in the workspace.
 * @param projectGraph - Dependency graph for the workspace.
 * @param ctx - Precomputed move context produced by {@link resolveAndValidate}.
 * @param skipFinalization - Skip deletion and formatting (for batch operations).
 */
async function executeMove(
  tree: Tree,
  options: MoveFileGeneratorSchema,
  projects: Map<string, ProjectConfiguration>,
  projectGraph: ProjectGraph,
  ctx: MoveContext,
  skipFinalization = false,
) {
  const {
    normalizedSource,
    normalizedTarget,
    sourceProjectName,
    targetProjectName,
    fileContent,
    sourceImportPath,
  } = ctx;

  logger.debug(
    `Moving ${normalizedSource} (project: ${sourceProjectName}) to ${normalizedTarget} (project: ${targetProjectName})`,
  );

  createTargetFile(tree, normalizedTarget, fileContent);

  updateMovedFileImportsIfNeeded(tree, ctx);

  await handleMoveStrategy(tree, projectGraph, projects, ctx);

  const sourceIdentifier = sourceImportPath || normalizedSource;
  updateTargetProjectImportsIfNeeded(tree, ctx, sourceIdentifier);

  ensureExportIfNeeded(tree, ctx, options);

  if (!skipFinalization) {
    await finalizeMove(tree, normalizedSource, options);
  }
}

function createTargetFile(
  tree: Tree,
  normalizedTarget: string,
  fileContent: string,
): void {
  tree.write(normalizedTarget, fileContent);
}

/**
 * Updates relative imports within the moved file to use alias imports to the source project.
 *
 * @param tree - The virtual file system tree.
 * @param ctx - Resolved move context.
 */
function updateMovedFileImportsIfNeeded(tree: Tree, ctx: MoveContext): void {
  const {
    isSameProject,
    normalizedSource,
    normalizedTarget,
    sourceProject,
    sourceImportPath,
  } = ctx;

  if (isSameProject) {
    // For same-project moves, update relative imports to maintain correct paths
    updateRelativeImportsInMovedFile(tree, normalizedSource, normalizedTarget);
  } else if (sourceImportPath) {
    // For cross-project moves, convert relative imports to the source project to alias imports
    updateRelativeImportsToAliasInMovedFile(
      tree,
      normalizedSource,
      normalizedTarget,
      sourceProject,
      sourceImportPath,
    );
  }
}

/**
 * Updates relative imports within the moved file when moving within the same project.
 *
 * @param tree - The virtual file system tree.
 * @param normalizedSource - Original file path.
 * @param normalizedTarget - New file path.
 */
function updateRelativeImportsInMovedFile(
  tree: Tree,
  normalizedSource: string,
  normalizedTarget: string,
): void {
  const content = tree.read(normalizedTarget, 'utf-8');
  if (!content) {
    return;
  }

  logger.debug(
    `Updating relative imports in moved file to maintain correct paths`,
  );

  // Pattern to match relative imports (./something or ../something)
  const relativeImportPattern = /from\s+['"](\.\.?\/[^'"]+)['"]/g;
  const dynamicRelativeImportPattern =
    /import\s*\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g;

  let updatedContent = content;
  let hasChanges = false;

  // Replace static imports
  updatedContent = updatedContent.replace(
    relativeImportPattern,
    (match, importPath: string) => {
      // Calculate the new relative path from target to the imported file
      const sourceDir = path.dirname(normalizedSource);

      // Resolve the import path relative to the original location
      const absoluteImportPath = path.join(sourceDir, importPath);

      // Calculate the new relative path from the target location
      const newRelativePath = getRelativeImportSpecifier(
        normalizedTarget,
        absoluteImportPath,
      );

      if (newRelativePath !== importPath) {
        hasChanges = true;
        return `from '${newRelativePath}'`;
      }

      return match;
    },
  );

  // Replace dynamic imports
  updatedContent = updatedContent.replace(
    dynamicRelativeImportPattern,
    (match, importPath: string) => {
      // Calculate the new relative path from target to the imported file
      const sourceDir = path.dirname(normalizedSource);

      // Resolve the import path relative to the original location
      const absoluteImportPath = path.join(sourceDir, importPath);

      // Calculate the new relative path from the target location
      const newRelativePath = getRelativeImportSpecifier(
        normalizedTarget,
        absoluteImportPath,
      );

      if (newRelativePath !== importPath) {
        hasChanges = true;
        return `import('${newRelativePath}')`;
      }

      return match;
    },
  );

  if (hasChanges) {
    tree.write(normalizedTarget, updatedContent);
    logger.info(`Updated relative imports in moved file`);
  }
}

/**
 * Updates relative imports within the moved file to use alias imports when moving across projects.
 *
 * @param tree - The virtual file system tree.
 * @param normalizedSource - Original file path.
 * @param normalizedTarget - New file path.
 * @param sourceProject - Source project configuration.
 * @param sourceImportPath - Import alias for the source project.
 */
function updateRelativeImportsToAliasInMovedFile(
  tree: Tree,
  normalizedSource: string,
  normalizedTarget: string,
  sourceProject: ProjectConfiguration,
  sourceImportPath: string,
): void {
  const content = tree.read(normalizedTarget, 'utf-8');
  if (!content) {
    return;
  }

  logger.debug(
    `Updating relative imports in moved file to use alias imports to source project`,
  );

  const sourceRoot = sourceProject.sourceRoot || sourceProject.root;

  // Pattern to match relative imports (./something or ../something)
  const relativeImportPattern = /from\s+['"](\.\.?\/[^'"]+)['"]/g;
  const dynamicRelativeImportPattern =
    /import\s*\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g;

  let updatedContent = content;
  let hasChanges = false;

  // Replace static imports
  updatedContent = updatedContent.replace(
    relativeImportPattern,
    (match, importPath: string) => {
      // Resolve the import path relative to the ORIGINAL (source) file location
      const sourceDir = path.dirname(normalizedSource);
      const resolvedPath = path.join(sourceDir, importPath);

      // Check if this import points to a file in the source project
      if (resolvedPath.startsWith(sourceRoot + '/')) {
        // Check if the resolved file is exported from the source project's entrypoint
        const relativeFilePathInSource = path.relative(
          sourceRoot,
          resolvedPath,
        );
        const isExported = isFileExported(
          tree,
          sourceProject,
          relativeFilePathInSource,
        );

        if (!isExported) {
          logger.warn(
            `Import '${importPath}' in ${normalizedTarget} is being converted to '${sourceImportPath}', but the imported file is not exported from the source project's entrypoint. This may result in an invalid import.`,
          );
        }

        hasChanges = true;
        return `from '${sourceImportPath}'`;
      }

      return match;
    },
  );

  // Replace dynamic imports
  updatedContent = updatedContent.replace(
    dynamicRelativeImportPattern,
    (match, importPath: string) => {
      // Resolve the import path relative to the ORIGINAL (source) file location
      const sourceDir = path.dirname(normalizedSource);
      const resolvedPath = path.join(sourceDir, importPath);

      // Check if this import points to a file in the source project
      if (resolvedPath.startsWith(sourceRoot + '/')) {
        // Check if the resolved file is exported from the source project's entrypoint
        const relativeFilePathInSource = path.relative(
          sourceRoot,
          resolvedPath,
        );
        const isExported = isFileExported(
          tree,
          sourceProject,
          relativeFilePathInSource,
        );

        if (!isExported) {
          logger.warn(
            `Import '${importPath}' in ${normalizedTarget} is being converted to '${sourceImportPath}', but the imported file is not exported from the source project's entrypoint. This may result in an invalid import.`,
          );
        }

        hasChanges = true;
        return `import('${sourceImportPath}')`;
      }

      return match;
    },
  );

  if (hasChanges) {
    tree.write(normalizedTarget, updatedContent);
    logger.debug(`Updated imports in moved file to use source project alias`);
  }
}

/**
 * Resolves a relative import path to an absolute workspace path.
 *
 * @param fromFile - The file containing the import.
 * @param importPath - The relative import path (e.g., './shared' or '../utils/helper').
 * @returns The resolved absolute path, or null if it cannot be resolved.
 */
/**
 * Decides which move strategy to execute based on the context.
 *
 * @param tree - The virtual file system tree.
 * @param projectGraph - Dependency graph for the workspace.
 * @param projects - Map of all projects in the workspace.
 * @param ctx - Resolved move context.
 */
async function handleMoveStrategy(
  tree: Tree,
  projectGraph: ProjectGraph,
  projects: Map<string, ProjectConfiguration>,
  ctx: MoveContext,
): Promise<void> {
  const { isSameProject, isExported, sourceImportPath, targetImportPath } = ctx;

  if (isSameProject) {
    handleSameProjectMove(tree, ctx);
    return;
  }

  if (isExported && sourceImportPath && targetImportPath) {
    await handleExportedMove(tree, projectGraph, projects, ctx);
    return;
  }

  if (targetImportPath) {
    handleNonExportedAliasMove(tree, ctx);
    return;
  }

  handleDefaultMove(tree, ctx);
}

/**
 * Applies the move behavior when the file remains in the same project.
 *
 * @param tree - The virtual file system tree.
 * @param ctx - Resolved move context.
 */
function handleSameProjectMove(tree: Tree, ctx: MoveContext): void {
  const { sourceProject, normalizedSource, normalizedTarget } = ctx;

  logger.debug(
    `Moving within same project, updating imports to relative paths`,
  );

  updateImportPathsInProject(
    tree,
    sourceProject,
    normalizedSource,
    normalizedTarget,
  );
}

/**
 * Handles the move when the source file is exported and must update dependents.
 *
 * @param tree - The virtual file system tree.
 * @param projectGraph - Dependency graph for the workspace.
 * @param projects - Map of all projects in the workspace.
 * @param ctx - Resolved move context.
 */
async function handleExportedMove(
  tree: Tree,
  projectGraph: ProjectGraph,
  projects: Map<string, ProjectConfiguration>,
  ctx: MoveContext,
): Promise<void> {
  const {
    sourceProjectName,
    sourceImportPath,
    targetImportPath,
    sourceProject,
    normalizedSource,
    normalizedTarget,
    relativeFilePathInSource,
  } = ctx;

  if (!sourceImportPath || !targetImportPath) {
    return;
  }

  logger.debug(
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

  // Remove the export from source index BEFORE updating imports to package alias
  // This ensures we can find and remove the relative path export before it's
  // converted to a package alias
  removeFileExport(tree, sourceProject, relativeFilePathInSource);

  updateImportPathsToPackageAlias(
    tree,
    sourceProject,
    normalizedSource,
    targetImportPath,
    [normalizedTarget], // Exclude the moved file
  );
}

/**
 * Handles moves across projects when the file is not exported but aliases exist.
 *
 * @param tree - The virtual file system tree.
 * @param ctx - Resolved move context.
 */
function handleNonExportedAliasMove(tree: Tree, ctx: MoveContext): void {
  const {
    sourceProject,
    normalizedSource,
    normalizedTarget,
    targetImportPath,
  } = ctx;

  if (!targetImportPath) {
    return;
  }

  logger.debug(
    `File is not exported, updating imports within source project to use target import path`,
  );

  updateImportPathsToPackageAlias(
    tree,
    sourceProject,
    normalizedSource,
    targetImportPath,
    [normalizedTarget], // Exclude the moved file
  );
}

/**
 * Fallback move strategy when no aliases or exports are involved.
 *
 * @param tree - The virtual file system tree.
 * @param ctx - Resolved move context.
 */
function handleDefaultMove(tree: Tree, ctx: MoveContext): void {
  const { sourceProject, normalizedSource, normalizedTarget } = ctx;

  logger.debug(`Updating imports within source project to relative paths`);

  updateImportPathsInProject(
    tree,
    sourceProject,
    normalizedSource,
    normalizedTarget,
  );
}

/**
 * Updates imports in the target project when necessary after moving the file.
 *
 * @param tree - The virtual file system tree.
 * @param ctx - Resolved move context.
 * @param sourceIdentifier - The import specifier to replace.
 */
function updateTargetProjectImportsIfNeeded(
  tree: Tree,
  ctx: MoveContext,
  sourceIdentifier: string,
): void {
  const {
    isSameProject,
    hasImportsInTarget,
    targetImportPath,
    targetProject,
    normalizedTarget,
  } = ctx;

  if (isSameProject || !hasImportsInTarget || !targetImportPath) {
    return;
  }

  logger.debug(`Updating imports in target project to relative imports`);

  const targetRoot = targetProject.sourceRoot || targetProject.root;
  const relativeFilePathInTarget = path.relative(targetRoot, normalizedTarget);

  updateImportsToRelative(
    tree,
    targetProject,
    sourceIdentifier,
    relativeFilePathInTarget,
    [normalizedTarget], // Exclude the moved file
  );
}

/**
 * Ensures the moved file is exported from the target project when required.
 *
 * @param tree - The virtual file system tree.
 * @param ctx - Resolved move context.
 * @param options - Generator options controlling export behavior.
 */
function ensureExportIfNeeded(
  tree: Tree,
  ctx: MoveContext,
  options: MoveFileGeneratorSchema,
): void {
  const { targetImportPath, targetProject, normalizedTarget } = ctx;

  if (!targetImportPath) {
    return;
  }

  if (!shouldExportFile(ctx, options)) {
    return;
  }

  const targetRoot = targetProject.sourceRoot || targetProject.root;
  const relativeFilePathInTarget = path.relative(targetRoot, normalizedTarget);

  ensureFileExported(tree, targetProject, relativeFilePathInTarget);
}

/**
 * Determines whether the moved file should be exported after the move completes.
 *
 * @param ctx - Resolved move context.
 * @param options - Generator options controlling export behavior.
 * @returns True if an export statement should be ensured.
 */
function shouldExportFile(
  ctx: MoveContext,
  options: MoveFileGeneratorSchema,
): boolean {
  const { isSameProject, isExported, hasImportsInTarget } = ctx;

  if (options.skipExport) {
    return false;
  }

  if (isSameProject) {
    return isExported;
  }

  return isExported || hasImportsInTarget;
}

/**
 * Performs cleanup by deleting the source file and formatting if required.
 *
 * @param tree - The virtual file system tree.
 * @param normalizedSource - Normalized path of the original file.
 * @param options - Generator options controlling formatting behavior.
 */
async function finalizeMove(
  tree: Tree,
  normalizedSource: string,
  options: MoveFileGeneratorSchema,
): Promise<void> {
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
  const paths = readCompilerPaths(tree);
  if (!paths) {
    return null;
  }

  const sourceRoot = project.sourceRoot || project.root;

  for (const [alias, pathEntry] of Object.entries(paths)) {
    const pathStr = toFirstPath(pathEntry);
    if (!pathStr) {
      continue;
    }

    if (!pointsToProjectIndex(pathStr, sourceRoot)) {
      continue;
    }

    if (isWildcardAlias(alias, pathStr)) {
      return resolveWildcardAlias(alias, sourceRoot, projectName);
    }

    return alias;
  }

  return null;
}

/**
 * Reads the TypeScript compiler path mappings from tsconfig files at the workspace root.
 * Tries tsconfig.base.json, tsconfig.json, and any tsconfig.*.json files.
 *
 * @param tree - The virtual file system tree.
 * @returns The paths object or null if unavailable.
 */
function readCompilerPaths(tree: Tree): Record<string, unknown> | null {
  // Try common tsconfig files in order of preference
  const tsconfigFiles = ['tsconfig.base.json', 'tsconfig.json'];

  // Add any tsconfig.*.json files found at the root
  const rootFiles = tree.children('');
  const additionalTsconfigFiles = rootFiles
    .filter((file) => file.startsWith('tsconfig.') && file.endsWith('.json'))
    .filter((file) => !tsconfigFiles.includes(file));

  const allTsconfigFiles = [...tsconfigFiles, ...additionalTsconfigFiles];

  for (const tsconfigPath of allTsconfigFiles) {
    if (!tree.exists(tsconfigPath)) {
      continue;
    }

    try {
      const tsconfigContent = tree.read(tsconfigPath, 'utf-8');
      if (!tsconfigContent) {
        continue;
      }

      const tsconfig = JSON.parse(tsconfigContent);
      const paths = tsconfig.compilerOptions?.paths;

      if (typeof paths === 'object' && paths) {
        return paths;
      }
    } catch (error) {
      logger.warn(`Could not parse ${tsconfigPath}: ${error}`);
    }
  }

  return null;
}

/**
 * Normalizes a path mapping entry to its first string value.
 *
 * @param pathEntry - Single string or string array entry from tsconfig paths.
 * @returns The first path string or null when not resolvable.
 */
function toFirstPath(pathEntry: unknown): string | null {
  if (typeof pathEntry === 'string') {
    return pathEntry;
  }

  if (Array.isArray(pathEntry) && typeof pathEntry[0] === 'string') {
    return pathEntry[0];
  }

  return null;
}

/**
 * Checks whether the provided path string points to the project's index file.
 *
 * @param pathStr - Path value from the tsconfig mapping.
 * @param sourceRoot - Source root of the project.
 * @returns True when the path targets the project's index.
 */
function pointsToProjectIndex(pathStr: string, sourceRoot: string): boolean {
  return pathStr.includes(sourceRoot) && isIndexFilePath(pathStr);
}

/**
 * Determines if a path string references a supported index file.
 *
 * @param pathStr - Path value from the tsconfig mapping.
 * @returns True if the path references an index entrypoint.
 */
function isIndexFilePath(pathStr: string): boolean {
  return (
    pathStr.endsWith('index.ts') ||
    pathStr.endsWith('index.mts') ||
    pathStr.endsWith('src/index.ts')
  );
}

/**
 * Checks whether both alias and path represent wildcard mappings.
 *
 * @param alias - The alias key from tsconfig paths.
 * @param pathStr - The resolved path string.
 * @returns True when both contain wildcard tokens.
 */
function isWildcardAlias(alias: string, pathStr: string): boolean {
  return alias.includes('*') && pathStr.includes('*');
}

/**
 * Resolves a wildcard alias to the project-specific alias string.
 *
 * @param alias - The alias key from tsconfig paths.
 * @param sourceRoot - Source root of the project.
 * @param projectName - Fallback project name when the directory name is missing.
 * @returns The resolved alias string.
 */
function resolveWildcardAlias(
  alias: string,
  sourceRoot: string,
  projectName: string,
): string {
  const projectDirName = sourceRoot.split('/').pop();
  return alias.replace(/\*/g, projectDirName || projectName);
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

    logger.debug(`Checking project ${dependentName} for imports`);
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
  excludeFilePaths: string[] = [],
): void {
  const fileExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'];
  const filesToExclude = [sourceFilePath, ...excludeFilePaths];

  visitNotIgnoredFiles(tree, project.root, (filePath) => {
    // Normalize path separators for cross-platform compatibility
    const normalizedFilePath = normalizePath(filePath);

    if (
      fileExtensions.some((ext) => filePath.endsWith(ext)) &&
      !filesToExclude.includes(normalizedFilePath)
    ) {
      const content = tree.read(filePath, 'utf-8');
      if (!content) return;

      // Get file name without extension and escape for regex
      const sourceFileName = escapeRegex(
        path.basename(sourceFilePath, path.extname(sourceFilePath)),
      );

      // Match import statements that reference the source file
      // Pattern breakdown:
      // - (from\\s+['"]) - Captures "from '" or 'from "'
      // - (\\.{1,2}/[^'"]*${sourceFileName}[^'"]*) - Captures the import path:
      //   * \\.{1,2}/ - Matches "./" or "../"
      //   * [^'"]* - Matches any characters before the filename (e.g., "path/to/")
      //   * ${sourceFileName} - The actual filename without extension
      //   * [^'"]* - Matches any characters after the filename (e.g., ".mjs" for ESM files)
      // - (['"]') - Captures the closing quote
      // This allows matching imports like:
      // - from './file'
      // - from './path/to/file'
      // - from './file.mjs' (ESM with extension)
      const staticPattern = new RegExp(
        `(from\\s+['"])(\\.{1,2}/[^'"]*${sourceFileName}[^'"]*)(['"])`,
        'g',
      );
      const dynamicPattern = new RegExp(
        `(import\\s*\\(\\s*['"])(\\.{1,2}/[^'"]*${sourceFileName}[^'"]*)(['"]\\s*\\))`,
        'g',
      );

      let updatedContent = content;
      let hasChanges = false;

      updatedContent = updatedContent.replace(
        staticPattern,
        (_match, prefix: string, _pathMatch: string, suffix: string) => {
          hasChanges = true;
          return `${prefix}${targetPackageAlias}${suffix}`;
        },
      );

      updatedContent = updatedContent.replace(
        dynamicPattern,
        (_match, prefix: string, _pathMatch: string, suffix: string) => {
          hasChanges = true;
          return `${prefix}${targetPackageAlias}${suffix}`;
        },
      );

      if (hasChanges) {
        tree.write(filePath, updatedContent);
        logger.debug(`Updated imports to use package alias in ${filePath}`);
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
    // Normalize path separators for cross-platform compatibility
    const normalizedFilePath = normalizePath(filePath);

    if (
      fileExtensions.some((ext) => filePath.endsWith(ext)) &&
      normalizedFilePath !== sourceFilePath &&
      normalizedFilePath !== targetFilePath
    ) {
      const content = tree.read(filePath, 'utf-8');
      if (!content) return;

      // Get file name without extension and escape for regex
      const sourceFileName = escapeRegex(
        path.basename(sourceFilePath, path.extname(sourceFilePath)),
      );

      // Match import statements that reference the source file
      // Pattern breakdown:
      // - (from\\s+['"]) - Captures "from '" or 'from "'
      // - (\\.{1,2}/[^'"]*${sourceFileName}[^'"]*) - Captures the import path:
      //   * \\.{1,2}/ - Matches "./" or "../"
      //   * [^'"]* - Matches any characters before the filename (e.g., "path/to/")
      //   * ${sourceFileName} - The actual filename without extension
      //   * [^'"]* - Matches any characters after the filename (e.g., ".mjs" for ESM files)
      // - (['"]') - Captures the closing quote
      // This allows matching imports like:
      // - from './file'
      // - from './path/to/file'
      // - from './file.mjs' (ESM with extension)
      const staticPattern = new RegExp(
        `(from\\s+['"])(\\.{1,2}/[^'"]*${sourceFileName}[^'"]*)(['"])`,
        'g',
      );
      const dynamicPattern = new RegExp(
        `(import\\s*\\(\\s*['"])(\\.{1,2}/[^'"]*${sourceFileName}[^'"]*)(['"]\\s*\\))`,
        'g',
      );

      const relativeSpecifier = getRelativeImportSpecifier(
        filePath,
        targetFilePath,
      );

      let updatedContent = content;
      let hasChanges = false;

      updatedContent = updatedContent.replace(
        staticPattern,
        (_match, prefix: string, _pathMatch: string, suffix: string) => {
          hasChanges = true;
          return `${prefix}${relativeSpecifier}${suffix}`;
        },
      );

      updatedContent = updatedContent.replace(
        dynamicPattern,
        (_match, prefix: string, _pathMatch: string, suffix: string) => {
          hasChanges = true;
          return `${prefix}${relativeSpecifier}${suffix}`;
        },
      );

      if (hasChanges) {
        tree.write(filePath, updatedContent);
        logger.debug(`Updated relative imports in ${filePath}`);
      }
    }
  });
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
    if (hasImports) {
      return; // Short-circuit if we already found imports
    }

    if (fileExtensions.some((ext) => filePath.endsWith(ext))) {
      const content = tree.read(filePath, 'utf-8');
      if (!content) {
        return;
      }

      const escapedPath = escapeRegex(importPath);
      const patterns = [
        new RegExp(`from\\s+['"]${escapedPath}['"]`),
        new RegExp(`import\\s*\\(\\s*['"]${escapedPath}['"]\\s*\\)`),
        new RegExp(`require\\(\\s*['"]${escapedPath}['"]\\s*\\)`),
      ];

      if (patterns.some((pattern) => pattern.test(content))) {
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
  excludeFilePaths: string[] = [],
): void {
  const fileExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'];

  visitNotIgnoredFiles(tree, project.root, (filePath) => {
    // Normalize path separators for cross-platform compatibility
    const normalizedFilePath = normalizePath(filePath);

    if (
      fileExtensions.some((ext) => filePath.endsWith(ext)) &&
      !excludeFilePaths.includes(normalizedFilePath)
    ) {
      const content = tree.read(filePath, 'utf-8');
      if (!content) return;

      const escapedSourcePath = escapeRegex(sourceImportPath);
      const staticPattern = new RegExp(
        `(from\\s+['"])(?:${escapedSourcePath})(['"])`,
        'g',
      );
      const dynamicPattern = new RegExp(
        `(import\\s*\\(\\s*['"])(?:${escapedSourcePath})(['"]\\s*\\))`,
        'g',
      );

      const projectRoot = project.sourceRoot || project.root;
      const targetFilePath = path.join(projectRoot, targetRelativePath);
      const relativeSpecifier = getRelativeImportSpecifier(
        filePath,
        targetFilePath,
      );

      let updatedContent = content;
      let hasChanges = false;

      updatedContent = updatedContent.replace(
        staticPattern,
        (_match, prefix: string, suffix: string) => {
          hasChanges = true;
          return `${prefix}${relativeSpecifier}${suffix}`;
        },
      );

      updatedContent = updatedContent.replace(
        dynamicPattern,
        (_match, prefix: string, suffix: string) => {
          hasChanges = true;
          return `${prefix}${relativeSpecifier}${suffix}`;
        },
      );

      if (hasChanges) {
        tree.write(filePath, updatedContent);
        logger.debug(`Updated imports to relative path in ${filePath}`);
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
        logger.debug(`Updated imports in ${filePath}`);
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
  const normalized = normalizePath(filePath);
  return path.join('/', normalized);
}

/**
 * Strips file extension from import path for TypeScript and regular JavaScript files.
 * Preserves extensions for ESM-specific files (.mjs, .mts, .cjs, .cts) as they are
 * required by the ESM specification.
 *
 * @param importPath - The import path to process
 * @returns The import path with extension stripped (or preserved for ESM files)
 */
function stripFileExtension(importPath: string): string {
  // Only strip .ts, .tsx, .js, .jsx extensions
  // Preserve .mjs, .mts, .cjs, .cts as they are required for ESM
  return importPath.replace(/\.(ts|tsx|js|jsx)$/, '');
}

function getRelativeImportSpecifier(
  fromFilePath: string,
  toFilePath: string,
): string {
  const normalizedFrom = normalizePath(fromFilePath);
  const normalizedTo = normalizePath(toFilePath);
  const absoluteFromDir = path.dirname(toAbsoluteWorkspacePath(normalizedFrom));
  const absoluteTarget = toAbsoluteWorkspacePath(normalizedTo);
  let relativePath = path.relative(absoluteFromDir, absoluteTarget);

  if (!relativePath.startsWith('.')) {
    relativePath = `./${relativePath}`;
  }

  relativePath = normalizePath(relativePath);
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
    logger.debug(`Added export to ${indexPath}`);
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
      // If the file becomes empty or whitespace-only, add export {}
      // to prevent runtime errors when importing from the package
      if (updatedContent.trim() === '') {
        updatedContent = 'export {};\n';
      }

      tree.write(indexPath, updatedContent);
      logger.debug(`Removed export from ${indexPath}`);
    }
  });
}

/**
 * Checks if a project is empty (contains only configuration files and index file).
 * A project is considered empty if it has no source files other than the entrypoint.
 *
 * @param tree - The virtual file system tree
 * @param project - Project configuration to check
 * @returns True if the project is empty (only index file remains)
 */
function isProjectEmpty(tree: Tree, project: ProjectConfiguration): boolean {
  const sourceRoot = project.sourceRoot || project.root;

  // Try to find the index file from tsconfig.base.json path mappings
  const paths = readCompilerPaths(tree);
  let indexFilePath: string | null = null;

  if (paths) {
    for (const [, pathEntry] of Object.entries(paths)) {
      const pathStr = toFirstPath(pathEntry);
      if (pathStr && pointsToProjectIndex(pathStr, sourceRoot)) {
        // Extract just the filename from the path
        indexFilePath = pathStr;
        break;
      }
    }
  }

  // Fallback: list of common index file names if not found in tsconfig
  const fallbackIndexFileNames = [
    'index.ts',
    'index.mts',
    'index.mjs',
    'index.js',
    'index.tsx',
    'index.jsx',
  ];

  let hasNonIndexSourceFiles = false;

  visitNotIgnoredFiles(tree, sourceRoot, (filePath) => {
    if (hasNonIndexSourceFiles) {
      return; // Short-circuit if we already found a non-index file
    }

    // Check if this is a source file (not a config file)
    const isSourceFile = /\.(ts|tsx|js|jsx|mts|mjs|cts|cjs)$/.test(filePath);

    // Skip if it's not a source file
    if (!isSourceFile) {
      return;
    }

    // Check if this file is the index file
    let isIndexFile = false;

    if (indexFilePath) {
      // If we found the index path from tsconfig, use exact match
      isIndexFile = normalizePath(filePath) === normalizePath(indexFilePath);
    } else {
      // Fallback to checking common index file names at sourceRoot
      // Normalize paths to handle cross-platform differences (Windows backslashes)
      const normalizedFilePath = normalizePath(filePath);
      const normalizedSourceRoot = normalizePath(sourceRoot);
      const relativePath = path.relative(
        normalizedSourceRoot,
        normalizedFilePath,
      );
      const fileName = path.basename(normalizedFilePath);
      isIndexFile =
        fallbackIndexFileNames.includes(fileName) &&
        path.dirname(relativePath) === '.';
    }

    if (!isIndexFile) {
      hasNonIndexSourceFiles = true;
    }
  });

  return !hasNonIndexSourceFiles;
}

export default moveFileGenerator;
