import {
  formatFiles,
  getProjects,
  ProjectConfiguration,
  ProjectGraph,
  Tree,
  logger,
  createProjectGraphAsync,
  normalizePath,
  globAsync,
} from '@nx/devkit';
import { removeGenerator } from '@nx/workspace';
import { posix as path } from 'node:path';
import { MoveFileGeneratorSchema } from './schema';
import { sanitizePath } from './security-utils/sanitize-path';
import { escapeRegex } from './security-utils/escape-regex';
import { isValidPathInput } from './security-utils/is-valid-path-input';
import {
  hasImportSpecifier,
  clearCache,
  getCacheStats,
} from './jscodeshift-utils';
import { treeReadCache } from './tree-cache';
import type { MoveContext } from './types/move-context';
import { cachedTreeExists as cachedTreeExistsImpl } from './cache/cached-tree-exists';
import { getProjectSourceFiles as getProjectSourceFilesImpl } from './cache/get-project-source-files';
import { updateProjectSourceFilesCache as updateProjectSourceFilesCacheImpl } from './cache/update-project-source-files-cache';
import { updateFileExistenceCache as updateFileExistenceCacheImpl } from './cache/update-file-existence-cache';
import { getCachedDependentProjects as getCachedDependentProjectsImpl } from './cache/get-cached-dependent-projects';
import { buildTargetPath } from './path-utils/build-target-path';
import { splitPatterns } from './path-utils/split-patterns';
import { removeSourceFileExtension } from './path-utils/remove-source-file-extension';
import { findProjectForFile } from './project-analysis/find-project-for-file';
import { isProjectEmpty } from './project-analysis/is-project-empty';
import { getDependentProjectNames } from './project-analysis/get-dependent-project-names';
import { deriveProjectDirectoryFromSource } from './project-analysis/derive-project-directory-from-source';
import { getProjectImportPath } from './project-analysis/get-project-import-path';
import { clearCompilerPathsCache } from './project-analysis/read-compiler-paths';
import { getProjectEntryPointPaths } from './project-analysis/get-project-entry-point-paths';
import { updateMovedFileImportsIfNeeded } from './import-updates/update-moved-file-imports-if-needed';
import { updateTargetProjectImportsIfNeeded } from './import-updates/update-target-project-imports-if-needed';
import { updateImportPathsInDependentProjects } from './import-updates/update-import-paths-in-dependent-projects';
import { updateImportPathsToPackageAlias } from './import-updates/update-import-paths-to-package-alias';
import { updateImportPathsInProject } from './import-updates/update-import-paths-in-project';

/**
 * Cache for source files per project to avoid repeated tree traversals.
 * Key: project root path, Value: array of source file paths
 */
const projectSourceFilesCache = new Map<string, string[]>();

/**
 * Cache for file existence checks to avoid repeated tree.exists() calls.
 * Key: file path, Value: boolean indicating if file exists
 */
const fileExistenceCache = new Map<string, boolean>();

/**
 * Cache for dependent project lookups to avoid repeated graph traversals.
 * Key: project name, Value: set of dependent project names
 */
const dependencyGraphCache = new Map<string, Set<string>>();

/**
 * Wrapper for clearAllCaches that passes cache state
 */
function clearAllCaches(): void {
  // Clear local caches
  projectSourceFilesCache.clear();
  fileExistenceCache.clear();
  dependencyGraphCache.clear();

  // Clear compiler paths cache from project-analysis module
  clearCompilerPathsCache();
}

/**
 * Wrapper for getProjectSourceFiles that passes cache state
 */
function getProjectSourceFiles(tree: Tree, projectRoot: string): string[] {
  return getProjectSourceFilesImpl(
    tree,
    projectRoot,
    projectSourceFilesCache,
    fileExistenceCache,
  );
}

/**
 * Wrapper for updateProjectSourceFilesCache that passes cache state
 */
function updateProjectSourceFilesCache(
  projectRoot: string,
  oldPath: string,
  newPath: string | null,
): void {
  updateProjectSourceFilesCacheImpl(
    projectRoot,
    oldPath,
    newPath,
    projectSourceFilesCache,
  );
}

/**
 * Wrapper for cachedTreeExists that passes cache state
 */
function cachedTreeExists(tree: Tree, filePath: string): boolean {
  return cachedTreeExistsImpl(tree, filePath, fileExistenceCache);
}

/**
 * Wrapper for updateFileExistenceCache that passes cache state
 */
function updateFileExistenceCache(filePath: string, exists: boolean): void {
  updateFileExistenceCacheImpl(filePath, exists, fileExistenceCache);
}

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
  // Clear all caches at the start of generator execution
  clearAllCaches();
  // Clear AST cache at the start of each move operation
  clearCache();

  const projects = getProjects(tree);

  // Lazily create project graph only when needed (cross-project moves with exported files)
  // This improves performance for same-project moves by ~15-20%
  // The graph is created on first call to getProjectGraphAsync() and cached for subsequent calls
  let projectGraph: ProjectGraph | null = null;
  const getProjectGraphAsync = async (): Promise<ProjectGraph> => {
    projectGraph ??= await createProjectGraphAsync();

    return projectGraph;
  };

  // Support comma-separated file paths and glob patterns
  // We need to be careful about commas inside brace expansions like {ts,js}
  const patterns = splitPatterns(options.file);

  if (patterns.length === 0) {
    throw new Error('At least one file path or glob pattern must be provided');
  }

  // Expand glob patterns to actual file paths
  // Separate glob patterns from direct file paths for batch processing
  const globPatterns: string[] = [];
  const directPaths: string[] = [];
  const patternMap = new Map<string, string>(); // normalized -> original for error messages

  for (const pattern of patterns) {
    // Normalize pattern to use forward slashes (Windows compatibility)
    const normalizedPattern = normalizePath(pattern);

    // Check if pattern contains glob characters
    const isGlobPattern = /[*?[\]{}]/.test(normalizedPattern);

    if (isGlobPattern) {
      globPatterns.push(normalizedPattern);
      patternMap.set(normalizedPattern, pattern);
    } else {
      // Direct file path
      directPaths.push(normalizedPattern);
    }
  }

  // Batch all glob patterns into a single globAsync call for better performance
  const filePaths: string[] = [...directPaths];
  if (globPatterns.length > 0) {
    const matches = await globAsync(tree, globPatterns);

    // If no matches at all, we need to check individual patterns for better error messages
    // Only do this in the error case to maintain performance in the success case
    if (matches.length === 0 && globPatterns.length > 0) {
      // Find the first pattern that matches nothing for a helpful error message
      for (const globPattern of globPatterns) {
        const individualMatches = await globAsync(tree, [globPattern]);
        if (individualMatches.length === 0) {
          const originalPattern = patternMap.get(globPattern) || globPattern;
          throw new Error(
            `No files found matching glob pattern: "${originalPattern}"`,
          );
        }
      }
      // If we get here, all patterns individually matched something, but combined they didn't
      // This shouldn't happen, but throw a generic error just in case
      throw new Error(
        `No files found matching glob patterns: "${globPatterns.join(', ')}"`,
      );
    }

    filePaths.push(...matches);
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
  // Note: These must be executed sequentially, not in parallel, because:
  // 1. Multiple files might be moved to the same target project
  // 2. updateProjectSourceFilesCache() modifies shared cache arrays
  // 3. Concurrent modifications could cause race conditions
  for (let i = 0; i < contexts.length; i++) {
    const ctx = contexts[i];
    const fileOptions = { ...options, file: uniqueFilePaths[i] };
    await executeMove(
      tree,
      fileOptions,
      projects,
      getProjectGraphAsync,
      ctx,
      true,
    );
  }

  // Delete all source files after all moves are complete
  for (const ctx of contexts) {
    tree.delete(ctx.normalizedSource);
    // Update file existence cache
    updateFileExistenceCache(ctx.normalizedSource, false);
    // Invalidate tree read cache
    treeReadCache.invalidateFile(ctx.normalizedSource);
  }

  // Check if any source projects should be removed
  if (options.removeEmptyProject) {
    for (const projectName of sourceProjectNames) {
      const project = projects.get(projectName);
      if (project && isProjectEmpty(tree, project)) {
        logger.verbose(`Project ${projectName} is empty, removing it`);
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

  // Log cache statistics for performance monitoring
  const cacheStats = getCacheStats();
  const fileExistenceCacheSize = fileExistenceCache.size;
  const projectCacheSize = projectSourceFilesCache.size;
  // Note: compilerPaths cache is managed in project-analysis module
  const treeStats = treeReadCache.getStats();
  const dependencyGraphCacheSize = dependencyGraphCache.size;

  logger.verbose(
    `AST Cache stats: ${cacheStats.astCacheSize} cached ASTs, ${cacheStats.contentCacheSize} cached files, ${cacheStats.failedParseCount} parse failures`,
  );
  logger.verbose(
    `File cache stats: ${projectCacheSize} project caches, ${fileExistenceCacheSize} file existence checks`,
  );
  logger.verbose(
    `Tree cache stats: ${treeStats.contentCacheSize} file reads cached, ${treeStats.childrenCacheSize} directory listings cached`,
  );
  logger.verbose(
    `Dependency graph cache: ${dependencyGraphCacheSize} project dependencies cached`,
  );
}

/**
 * Split a string by commas, but ignore commas inside brace expansions.
 * For example: "file1.ts,file.{ts,js}" => ["file1.ts", "file.{ts,js}"]
 */
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
): MoveContext {
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

  // Validate that deriveProjectDirectory and projectDirectory are not both set
  if (options.deriveProjectDirectory && options.projectDirectory) {
    throw new Error(
      'Cannot use both "deriveProjectDirectory" and "projectDirectory" options at the same time',
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

  // Verify source file exists before deriving directory
  if (!cachedTreeExists(tree, normalizedSource)) {
    throw new Error(`Source file "${normalizedSource}" not found`);
  }

  // Find which project the source file belongs to (needed for deriving directory)
  const sourceProjectInfo = findProjectForFile(projects, normalizedSource);

  if (!sourceProjectInfo) {
    throw new Error(
      `Could not determine source project for file "${normalizedSource}"`,
    );
  }

  const { project: sourceProject, name: sourceProjectName } = sourceProjectInfo;

  // Derive or use provided projectDirectory
  let sanitizedProjectDirectory: string | undefined;

  if (options.deriveProjectDirectory) {
    // Derive the directory from the source file path
    const derivedDirectory = deriveProjectDirectoryFromSource(
      normalizedSource,
      sourceProject,
    );
    sanitizedProjectDirectory = derivedDirectory
      ? sanitizePath(derivedDirectory)
      : undefined;
  } else if (options.projectDirectory) {
    // Sanitize projectDirectory to prevent path traversal
    sanitizedProjectDirectory = sanitizePath(options.projectDirectory);
  }

  // Construct target path from project and optional directory
  const normalizedTarget = buildTargetPath(
    targetProject,
    normalizedSource,
    sanitizedProjectDirectory,
  );

  // Verify target file does not exist
  if (cachedTreeExists(tree, normalizedTarget)) {
    throw new Error(`Target file "${normalizedTarget}" already exists`);
  }

  const targetProjectName = options.project;

  // Read the file content using cached read for better performance
  const fileContent = treeReadCache.read(tree, normalizedSource, 'utf-8');
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
    !!targetImportPath &&
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

/**
 * Coordinates the move workflow by executing the individual move steps in order.
 *
 * @param tree - The virtual file system tree.
 * @param options - Generator options controlling the move.
 * @param projects - Map of all projects in the workspace.
 * @param getProjectGraphAsync - Lazy getter for the dependency graph (only creates when needed).
 * @param ctx - Precomputed move context produced by {@link resolveAndValidate}.
 * @param skipFinalization - Skip deletion and formatting (for batch operations).
 */
async function executeMove(
  tree: Tree,
  options: MoveFileGeneratorSchema,
  projects: Map<string, ProjectConfiguration>,
  getProjectGraphAsync: () => Promise<ProjectGraph>,
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

  logger.verbose(
    `Moving ${normalizedSource} (project: ${sourceProjectName}) to ${normalizedTarget} (project: ${targetProjectName})`,
  );

  createTargetFile(tree, normalizedTarget, fileContent);

  // Update cache incrementally for projects that will be modified
  // This is more efficient than invalidating and re-scanning the entire project
  const sourceProject = projects.get(sourceProjectName);
  const targetProject = projects.get(targetProjectName);
  if (sourceProject) {
    updateProjectSourceFilesCache(
      sourceProject.root,
      normalizedSource,
      targetProjectName === sourceProjectName ? normalizedTarget : null,
    );
  }
  if (targetProject && targetProject.root !== sourceProject?.root) {
    updateProjectSourceFilesCache(targetProject.root, '', normalizedTarget);
  }

  updateMovedFileImportsIfNeeded(tree, ctx, cachedTreeExists);

  await handleMoveStrategy(tree, getProjectGraphAsync, projects, ctx);

  const sourceIdentifier = sourceImportPath || normalizedSource;
  updateTargetProjectImportsIfNeeded(
    tree,
    ctx,
    sourceIdentifier,
    getProjectSourceFiles,
  );

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
  // Update file existence cache
  updateFileExistenceCache(normalizedTarget, true);
  // Invalidate tree read cache for this file
  treeReadCache.invalidateFile(normalizedTarget);
}

/**
 * Resolves a relative import path to an absolute workspace path.
      tree,
      normalizedSource,
      normalizedTarget,
      sourceProject,
      sourceImportPath,
    );
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
 * @param getProjectGraphAsync - Lazy getter for the dependency graph (only creates when needed).
 * @param projects - Map of all projects in the workspace.
 * @param ctx - Resolved move context.
 */
async function handleMoveStrategy(
  tree: Tree,
  getProjectGraphAsync: () => Promise<ProjectGraph>,
  projects: Map<string, ProjectConfiguration>,
  ctx: MoveContext,
): Promise<void> {
  const { isSameProject, isExported, sourceImportPath, targetImportPath } = ctx;

  if (isSameProject) {
    handleSameProjectMove(tree, ctx);
    return;
  }

  if (isExported && sourceImportPath && targetImportPath) {
    await handleExportedMove(tree, getProjectGraphAsync, projects, ctx);
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

  logger.verbose(
    `Moving within same project, updating imports to relative paths`,
  );

  updateImportPathsInProject(
    tree,
    sourceProject,
    normalizedSource,
    normalizedTarget,
    getProjectSourceFiles,
  );
}

/**
 * Handles the move when the source file is exported and must update dependents.
 *
 * @param tree - The virtual file system tree.
 * @param getProjectGraphAsync - Lazy getter for the dependency graph (only creates when needed).
 * @param projects - Map of all projects in the workspace.
 * @param ctx - Resolved move context.
 */
async function handleExportedMove(
  tree: Tree,
  getProjectGraphAsync: () => Promise<ProjectGraph>,
  projects: Map<string, ProjectConfiguration>,
  ctx: MoveContext,
): Promise<void> {
  const {
    sourceProjectName,
    sourceImportPath,
    targetImportPath,
    sourceProject,
    targetProject,
    targetProjectName,
    normalizedSource,
    normalizedTarget,
    relativeFilePathInSource,
  } = ctx;

  if (!sourceImportPath || !targetImportPath) {
    return;
  }

  logger.verbose(
    `File is exported from ${sourceImportPath}, updating dependent projects`,
  );

  // Compute the relative path in the target project
  const targetRoot = targetProject.sourceRoot || targetProject.root;
  const relativeFilePathInTarget = path.relative(targetRoot, normalizedTarget);

  // Lazily load project graph only when updating dependent projects.
  // This is the only code path that requires the graph, so we defer creation until here.
  // Same-project moves and non-exported cross-project moves never reach this code.
  const projectGraph = await getProjectGraphAsync();

  await updateImportPathsInDependentProjects(
    tree,
    projectGraph,
    projects,
    sourceProjectName,
    sourceImportPath,
    targetImportPath,
    {
      targetProjectName,
      targetRelativePath: relativeFilePathInTarget,
    },
    getCachedDependentProjects,
    getProjectSourceFiles,
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
    getProjectSourceFiles,
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

  logger.verbose(
    `File is not exported, updating imports within source project to use target import path`,
  );

  updateImportPathsToPackageAlias(
    tree,
    sourceProject,
    normalizedSource,
    targetImportPath,
    [normalizedTarget], // Exclude the moved file
    getProjectSourceFiles,
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

  logger.verbose(`Updating imports within source project to relative paths`);

  updateImportPathsInProject(
    tree,
    sourceProject,
    normalizedSource,
    normalizedTarget,
    getProjectSourceFiles,
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
  // Invalidate tree read cache
  treeReadCache.invalidateFile(normalizedSource);

  if (!options.skipFormat) {
    await formatFiles(tree);
  }
}

/**
 * Checks if a file is exported from the project's entrypoint.
 * This is used in the main generator flow to determine export status.
 */
function isFileExported(
  tree: Tree,
  project: ProjectConfiguration,
  file: string,
): boolean {
  const indexPaths = getProjectEntryPointPaths(tree, project);

  const fileWithoutExt = removeSourceFileExtension(file);
  const escapedFile = escapeRegex(fileWithoutExt);

  return indexPaths.some((indexPath) => {
    if (!cachedTreeExists(tree, indexPath)) {
      return false;
    }
    const content = treeReadCache.read(tree, indexPath, 'utf-8');
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
 * Checks if a project has imports to a given file/path.
 * This is used in the main generator flow.
 */
function checkForImportsInProject(
  tree: Tree,
  project: ProjectConfiguration,
  importPath: string,
): boolean {
  const sourceFiles = getProjectSourceFiles(tree, project.root);

  for (const filePath of sourceFiles) {
    // Use jscodeshift to check for imports
    if (hasImportSpecifier(tree, filePath, importPath)) {
      return true;
    }
  }

  return false;
}

/**
 * Wrapper for getCachedDependentProjects that passes cache state
 */
function getCachedDependentProjects(
  projectGraph: ProjectGraph,
  projectName: string,
): Set<string> {
  return getCachedDependentProjectsImpl(
    projectGraph,
    projectName,
    getDependentProjectNames,
    dependencyGraphCache,
  );
}

/**
 * Ensures the file is exported from the target project's entrypoint
 */
function ensureFileExported(
  tree: Tree,
  project: ProjectConfiguration,
  file: string,
): void {
  const indexPaths = getProjectEntryPointPaths(tree, project);

  // Find the first existing index file
  const indexPath =
    indexPaths.find((p) => cachedTreeExists(tree, p)) || indexPaths[0];

  let content = '';
  if (cachedTreeExists(tree, indexPath)) {
    content = treeReadCache.read(tree, indexPath, 'utf-8') || '';
  }

  // Add export for the moved file
  const fileWithoutExt = removeSourceFileExtension(file);
  const exportStatement = `export * from './${fileWithoutExt}';\n`;

  // Check if export already exists
  if (!content.includes(exportStatement.trim())) {
    content += exportStatement;
    tree.write(indexPath, content);
    treeReadCache.invalidateFile(indexPath);
    logger.verbose(`Added export to ${indexPath}`);
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
  const indexPaths = getProjectEntryPointPaths(tree, project);

  // Find existing index files
  indexPaths.forEach((indexPath) => {
    if (!cachedTreeExists(tree, indexPath)) {
      return;
    }

    const content = treeReadCache.read(tree, indexPath, 'utf-8');
    if (!content) {
      return;
    }

    // Remove export for the file
    const fileWithoutExt = removeSourceFileExtension(file);
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
      treeReadCache.invalidateFile(indexPath);
      logger.verbose(`Removed export from ${indexPath}`);
    }
  });
}

export default moveFileGenerator;
