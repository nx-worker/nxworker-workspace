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
  globAsync,
} from '@nx/devkit';
import { removeGenerator } from '@nx/workspace';
import { posix as path } from 'node:path';
import { MoveFileGeneratorSchema } from './schema';
import { sanitizePath } from './security-utils/sanitize-path';
import { escapeRegex } from './security-utils/escape-regex';
import { isValidPathInput } from './security-utils/is-valid-path-input';
import {
  updateImportSpecifier,
  updateImportSpecifierPattern,
  hasImportSpecifier,
  clearCache,
  getCacheStats,
} from './jscodeshift-utils';

const entrypointExtensions = Object.freeze([
  'ts',
  'mts',
  'cts',
  'mjs',
  'cjs',
  'js',
  'tsx',
  'jsx',
] as const);

const primaryEntryBaseNames = Object.freeze(['public-api', 'index'] as const);

/**
 * File extensions for TypeScript and JavaScript source files.
 * Used for identifying files to process during import updates.
 */
const sourceFileExtensions = Object.freeze([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.mjs',
  '.cts',
  '.cjs',
] as const);

/**
 * Cache for source files per project to avoid repeated tree traversals.
 * Key: project root path, Value: array of source file paths
 */
const projectSourceFilesCache = new Map<string, string[]>();

/**
 * Clears all caches. Should be called when starting a new generator operation
 * to ensure fresh state.
 */
function clearAllCaches(): void {
  projectSourceFilesCache.clear();
}

/**
 * Gets all source files in a project with caching to avoid repeated traversals.
 * @param tree - The virtual file system tree
 * @param projectRoot - Root path of the project
 * @returns Array of source file paths
 */
function getProjectSourceFiles(tree: Tree, projectRoot: string): string[] {
  const cached = projectSourceFilesCache.get(projectRoot);
  if (cached !== undefined) {
    return cached;
  }

  const sourceFiles: string[] = [];
  visitNotIgnoredFiles(tree, projectRoot, (filePath) => {
    if (sourceFileExtensions.some((ext) => filePath.endsWith(ext))) {
      sourceFiles.push(normalizePath(filePath));
    }
  });

  projectSourceFilesCache.set(projectRoot, sourceFiles);
  return sourceFiles;
}

/**
 * File extensions that should be stripped from imports.
 * ESM-specific extensions (.mjs, .mts, .cjs, .cts) are excluded as they are
 * required by the ESM specification.
 */
const strippableExtensions = Object.freeze([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
] as const);

const primaryEntryFilenames = buildFileNames(primaryEntryBaseNames);
const mainEntryFilenames = buildFileNames(['main']);

const entrypointPatterns = buildPatterns(
  ['', 'src/', 'lib/'],
  primaryEntryFilenames,
);
const mainEntryPatterns = buildPatterns(['', 'src/'], mainEntryFilenames);

function buildFileNames(baseNames: readonly string[]): string[] {
  return baseNames.flatMap((base) =>
    entrypointExtensions.map((ext) => `${base}.${ext}`),
  );
}

function buildPatterns(
  prefixes: readonly string[],
  fileNames: readonly string[],
): string[] {
  return prefixes.flatMap((prefix) =>
    fileNames.map((fileName) => `${prefix}${fileName}`),
  );
}

/**
 * Checks if a file has one of the supported source file extensions.
 * @param filePath - The file path to check
 * @returns true if the file has a supported extension
 */
function hasSourceFileExtension(filePath: string): boolean {
  const ext = path.extname(filePath);
  return sourceFileExtensions.includes(
    ext as (typeof sourceFileExtensions)[number],
  );
}

/**
 * Removes the file extension from a path if it's one of the supported extensions.
 * @param filePath - The file path to process
 * @returns The path with extension removed, or the original path if no supported extension
 */
function removeSourceFileExtension(filePath: string): string {
  const ext = path.extname(filePath);
  if (
    sourceFileExtensions.includes(ext as (typeof sourceFileExtensions)[number])
  ) {
    return filePath.slice(0, -ext.length);
  }
  return filePath;
}

function getProjectEntryPointPaths(
  tree: Tree,
  project: ProjectConfiguration,
): string[] {
  const sourceRoot = project.sourceRoot || project.root;
  const seen = new Set<string>();
  const candidates: string[] = [];

  const addCandidate = (value: string | null | undefined) => {
    if (!value) {
      return;
    }
    const normalized = normalizePath(value);
    if (seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    candidates.push(normalized);
  };

  const compilerPaths = readCompilerPaths(tree);
  if (compilerPaths) {
    for (const [, pathEntry] of Object.entries(compilerPaths)) {
      const pathStr = toFirstPath(pathEntry);
      if (!pathStr) {
        continue;
      }

      if (pointsToProjectIndex(tree, pathStr, sourceRoot)) {
        addCandidate(pathStr);
      }
    }
  }

  getFallbackEntryPointPaths(project).forEach(addCandidate);

  return candidates;
}

function getFallbackEntryPointPaths(project: ProjectConfiguration): string[] {
  const sourceRoot = project.sourceRoot || project.root;

  return [
    ...primaryEntryFilenames.map((fileName) => path.join(sourceRoot, fileName)),
    ...primaryEntryFilenames.map((fileName) =>
      path.join(project.root, 'src', fileName),
    ),
  ];
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
  const projectGraph = await createProjectGraphAsync();

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
  logger.verbose(
    `AST Cache stats: ${cacheStats.astCacheSize} cached ASTs, ${cacheStats.contentCacheSize} cached files, ${cacheStats.failedParseCount} parse failures`,
  );
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
 * Derives the project directory from the source file path relative to the source project.
 * Extracts the directory structure between the base directory (lib/app) and the filename.
 *
 * @param sourceFilePath - Original source file path.
 * @param sourceProject - Source project configuration.
 * @returns The derived directory path, or undefined if the file is in the base directory.
 */
function deriveProjectDirectoryFromSource(
  sourceFilePath: string,
  sourceProject: ProjectConfiguration,
): string | undefined {
  const sourceRoot = sourceProject.sourceRoot || sourceProject.root;
  const baseDir = sourceProject.projectType === 'application' ? 'app' : 'lib';

  // Get the path relative to source root
  const relativeToSourceRoot = path.relative(sourceRoot, sourceFilePath);

  // Check if the file is within the base directory (lib or app)
  const baseDirPrefix = baseDir + '/';
  if (!relativeToSourceRoot.startsWith(baseDirPrefix)) {
    // File is not in the expected base directory, return undefined
    return undefined;
  }

  // Remove the base directory prefix
  const afterBaseDir = relativeToSourceRoot.substring(baseDirPrefix.length);

  // Get the directory part (without the filename)
  const dirPath = path.dirname(afterBaseDir);

  // If dirPath is '.' it means the file is directly in the base directory
  if (dirPath === '.') {
    return undefined;
  }

  return dirPath;
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
  if (!tree.exists(normalizedSource)) {
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
  if (tree.exists(normalizedTarget)) {
    throw new Error(`Target file "${normalizedTarget}" already exists`);
  }

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

  logger.verbose(
    `Moving ${normalizedSource} (project: ${sourceProjectName}) to ${normalizedTarget} (project: ${targetProjectName})`,
  );

  createTargetFile(tree, normalizedTarget, fileContent);

  // Invalidate cache for projects that will be modified
  const sourceProject = projects.get(sourceProjectName);
  const targetProject = projects.get(targetProjectName);
  if (sourceProject) {
    projectSourceFilesCache.delete(sourceProject.root);
  }
  if (targetProject && targetProject.root !== sourceProject?.root) {
    projectSourceFilesCache.delete(targetProject.root);
  }

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

  logger.verbose(
    `Updating relative imports in moved file to maintain correct paths`,
  );

  // Use jscodeshift to update relative imports in the moved file
  updateImportSpecifierPattern(
    tree,
    normalizedTarget,
    (specifier) => {
      // Only process relative imports
      return specifier.startsWith('.');
    },
    (oldImportPath) => {
      // Calculate the new relative path from target to the imported file
      const sourceDir = path.dirname(normalizedSource);

      // Resolve the import path relative to the original location
      const absoluteImportPath = path.join(sourceDir, oldImportPath);

      // Calculate the new relative path from the target location
      const newRelativePath = getRelativeImportSpecifier(
        normalizedTarget,
        absoluteImportPath,
      );

      if (newRelativePath !== oldImportPath) {
        logger.verbose(
          `Updated import '${oldImportPath}' to '${newRelativePath}' in moved file`,
        );
      }

      return newRelativePath;
    },
  );
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

  logger.verbose(
    `Updating relative imports in moved file to use alias imports to source project`,
  );

  const sourceRoot = sourceProject.sourceRoot || sourceProject.root;

  // Use jscodeshift to update relative imports to alias
  updateImportSpecifierPattern(
    tree,
    normalizedTarget,
    (specifier) => {
      // Only process relative imports
      if (!specifier.startsWith('.')) {
        return false;
      }

      // Resolve the import path relative to the ORIGINAL (source) file location
      const sourceDir = path.dirname(normalizedSource);
      const resolvedPath = path.join(sourceDir, specifier);

      // Check if this import points to a file in the source project
      return resolvedPath.startsWith(sourceRoot + '/');
    },
    (importPath) => {
      // Resolve the import path relative to the ORIGINAL (source) file location
      const sourceDir = path.dirname(normalizedSource);
      const resolvedPath = path.join(sourceDir, importPath);

      // Check if the resolved file is exported from the source project's entrypoint
      const relativeFilePathInSource = path.relative(sourceRoot, resolvedPath);
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

      return sourceImportPath;
    },
  );
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

  logger.verbose(
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

  logger.verbose(
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

  logger.verbose(`Updating imports within source project to relative paths`);

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

  logger.verbose(`Updating imports in target project to relative imports`);

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
  const indexPaths = getProjectEntryPointPaths(tree, project);

  const fileWithoutExt = removeSourceFileExtension(file);
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

    if (!pointsToProjectIndex(tree, pathStr, sourceRoot)) {
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
 * @param tree - The virtual file system tree.
 * @param pathStr - Path value from the tsconfig mapping.
 * @param sourceRoot - Source root of the project.
 * @returns True when the path targets the project's index.
 */
function pointsToProjectIndex(
  tree: Tree,
  pathStr: string,
  sourceRoot: string,
): boolean {
  const normalizedPathStr = normalizePath(pathStr);
  const normalizedSourceRoot = normalizePath(sourceRoot);

  // First, check if path is within the project's source root
  if (
    normalizedPathStr !== normalizedSourceRoot &&
    !normalizedPathStr.startsWith(`${normalizedSourceRoot}/`)
  ) {
    return false;
  }

  // Try dynamic verification: check if the file actually exists
  if (tree.exists(normalizedPathStr)) {
    return true;
  }

  // Fallback to hard-coded pattern matching for common index file patterns
  return isIndexFilePath(normalizedPathStr);
}

/**
 * Determines if a path string references a supported index file using pattern matching.
 * This is a fallback when we can't dynamically verify the file exists.
 *
 * @param pathStr - Path value from the tsconfig mapping.
 * @returns True if the path matches common index file patterns.
 */
function isIndexFilePath(pathStr: string): boolean {
  const indexPatterns = [...entrypointPatterns, ...mainEntryPatterns];

  return indexPatterns.some((pattern) => pathStr.endsWith(pattern));
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
  target?: { targetProjectName?: string; targetRelativePath?: string },
): Promise<void> {
  const { targetProjectName, targetRelativePath } = target ?? {};
  const dependentProjectNames = getDependentProjectNames(
    projectGraph,
    sourceProjectName,
  );

  const candidates: Array<[string, ProjectConfiguration]> =
    dependentProjectNames.length
      ? dependentProjectNames
          .map((name) => {
            const project = projects.get(name);
            return project ? [name, project] : null;
          })
          .filter(
            (entry): entry is [string, ProjectConfiguration] => entry !== null,
          )
      : Array.from(projects.entries()).filter(([, project]) =>
          checkForImportsInProject(tree, project, sourceImportPath),
        );

  candidates.forEach(([dependentName, dependentProject]) => {
    logger.verbose(`Checking project ${dependentName} for imports`);

    // If the dependent project is the target project, use relative imports
    if (
      targetProjectName &&
      targetRelativePath &&
      dependentName === targetProjectName
    ) {
      logger.verbose(
        `Updating imports in target project ${dependentName} to use relative paths`,
      );
      updateImportsToRelative(
        tree,
        dependentProject,
        sourceImportPath,
        targetRelativePath,
        [],
      );
    } else {
      updateImportsByAliasInProject(
        tree,
        dependentProject,
        sourceImportPath,
        targetImportPath,
      );
    }
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
  const filesToExclude = [sourceFilePath, ...excludeFilePaths];
  const sourceFiles = getProjectSourceFiles(tree, project.root);

  for (const normalizedFilePath of sourceFiles) {
    if (filesToExclude.includes(normalizedFilePath)) {
      continue;
    }

    // Use jscodeshift to update imports that reference the source file
    updateImportSpecifierPattern(
      tree,
      normalizedFilePath,
      (specifier) => {
        // Match relative imports that reference the source file
        if (!specifier.startsWith('.')) {
          return false;
        }
        // Resolve the import specifier to an absolute path
        const importerDir = path.dirname(normalizedFilePath);
        const resolvedImport = path.join(importerDir, specifier);
        // Normalize and compare with source file (both without extension)
        const normalizedResolvedImport = normalizePath(
          removeSourceFileExtension(resolvedImport),
        );
        const sourceFileWithoutExt = normalizePath(
          removeSourceFileExtension(sourceFilePath),
        );
        return normalizedResolvedImport === sourceFileWithoutExt;
      },
      () => targetPackageAlias,
    );
  }
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
  const sourceFiles = getProjectSourceFiles(tree, project.root);

  for (const normalizedFilePath of sourceFiles) {
    if (
      normalizedFilePath === sourceFilePath ||
      normalizedFilePath === targetFilePath
    ) {
      continue;
    }

    const relativeSpecifier = getRelativeImportSpecifier(
      normalizedFilePath,
      targetFilePath,
    );

    // Use jscodeshift to update imports that reference the source file
    updateImportSpecifierPattern(
      tree,
      normalizedFilePath,
      (specifier) => {
        // Match relative imports that reference the source file
        if (!specifier.startsWith('.')) {
          return false;
        }
        // Resolve the import specifier to an absolute path
        const importerDir = path.dirname(normalizedFilePath);
        const resolvedImport = path.join(importerDir, specifier);
        // Normalize and compare with source file (both without extension)
        const normalizedResolvedImport = normalizePath(
          removeSourceFileExtension(resolvedImport),
        );
        const sourceFileWithoutExt = normalizePath(
          removeSourceFileExtension(sourceFilePath),
        );
        return normalizedResolvedImport === sourceFileWithoutExt;
      },
      () => relativeSpecifier,
    );
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
 * Updates imports in target project from absolute import path to relative imports
 */
function updateImportsToRelative(
  tree: Tree,
  project: ProjectConfiguration,
  sourceImportPath: string,
  targetRelativePath: string,
  excludeFilePaths: string[] = [],
): void {
  const sourceFiles = getProjectSourceFiles(tree, project.root);

  for (const normalizedFilePath of sourceFiles) {
    if (excludeFilePaths.includes(normalizedFilePath)) {
      continue;
    }

    const projectRoot = project.sourceRoot || project.root;
    const targetFilePath = path.join(projectRoot, targetRelativePath);
    const relativeSpecifier = getRelativeImportSpecifier(
      normalizedFilePath,
      targetFilePath,
    );

    // Use jscodeshift to update imports from source import path to relative path
    updateImportSpecifier(
      tree,
      normalizedFilePath,
      sourceImportPath,
      relativeSpecifier,
    );
  }
}

function updateImportsByAliasInProject(
  tree: Tree,
  project: ProjectConfiguration,
  sourceImportPath: string,
  targetImportPath: string,
): void {
  const sourceFiles = getProjectSourceFiles(tree, project.root);

  for (const filePath of sourceFiles) {
    // Use jscodeshift to update imports from source to target path
    updateImportSpecifier(tree, filePath, sourceImportPath, targetImportPath);
  }
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
  const ext = path.extname(importPath);
  if (
    strippableExtensions.includes(ext as (typeof strippableExtensions)[number])
  ) {
    return importPath.slice(0, -ext.length);
  }
  return importPath;
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
  const indexPaths = getProjectEntryPointPaths(tree, project);

  // Find the first existing index file
  const indexPath = indexPaths.find((p) => tree.exists(p)) || indexPaths[0];

  let content = '';
  if (tree.exists(indexPath)) {
    content = tree.read(indexPath, 'utf-8') || '';
  }

  // Add export for the moved file
  const fileWithoutExt = removeSourceFileExtension(file);
  const exportStatement = `export * from './${fileWithoutExt}';\n`;

  // Check if export already exists
  if (!content.includes(exportStatement.trim())) {
    content += exportStatement;
    tree.write(indexPath, content);
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
    if (!tree.exists(indexPath)) {
      return;
    }

    const content = tree.read(indexPath, 'utf-8');
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
      logger.verbose(`Removed export from ${indexPath}`);
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
  const indexCandidates = new Set(
    getProjectEntryPointPaths(tree, project).map((candidate) =>
      normalizePath(candidate),
    ),
  );

  if (indexCandidates.size === 0) {
    indexCandidates.add(
      normalizePath(path.join(sourceRoot, primaryEntryFilenames[0])),
    );
  }

  // Don't use cache for isProjectEmpty check as we need the current state
  let hasNonIndexSourceFiles = false;

  visitNotIgnoredFiles(tree, sourceRoot, (filePath) => {
    if (hasNonIndexSourceFiles) {
      return; // Short-circuit if we already found a non-index file
    }

    const normalizedFilePath = normalizePath(filePath);
    const isSourceFile = hasSourceFileExtension(normalizedFilePath);

    if (!isSourceFile) {
      return;
    }

    if (indexCandidates.has(normalizedFilePath)) {
      return;
    }

    hasNonIndexSourceFiles = true;
  });

  return !hasNonIndexSourceFiles;
}

export default moveFileGenerator;
