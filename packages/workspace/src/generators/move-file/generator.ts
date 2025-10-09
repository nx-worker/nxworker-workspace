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
import { performance } from 'node:perf_hooks';
import { MoveFileGeneratorSchema } from './schema';
import { sanitizePath } from './security-utils/sanitize-path';
import { escapeRegex } from './security-utils/escape-regex';
import { isValidPathInput } from './security-utils/is-valid-path-input';
import {
  updateImportSpecifier,
  updateImportSpecifierPattern,
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

const PROFILING_ENV_VAR = 'NXWORKER_MOVE_FILE_PROFILE';
const profilingEnabled = readProfilingEnabled();

type ProfilingStats = {
  total: number;
  count: number;
  min: number;
  max: number;
};

const profilingData = new Map<string, ProfilingStats>();
const profilingCounters = new Map<string, number>();

function noop(): void {
  return undefined;
}

function readProfilingEnabled(): boolean {
  const flag = process.env[PROFILING_ENV_VAR];
  if (!flag) {
    return false;
  }

  return !['0', 'false', 'off', 'no'].includes(flag.toLowerCase());
}

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

function ensureRelativeSpecifier(specifier: string): string {
  if (specifier.startsWith('.')) {
    return specifier;
  }

  return `./${specifier}`;
}

function buildRelativeImportCandidateSpecifiers(
  importerFilePath: string,
  sourceFilePath: string,
): string[] {
  const importerDir = path.dirname(importerFilePath);
  const relativePath = path.relative(importerDir, sourceFilePath);
  const normalizedRelative = ensureRelativeSpecifier(
    normalizePath(relativePath),
  );

  const withoutExtension = removeSourceFileExtension(normalizedRelative);
  const candidates = new Set<string>();

  candidates.add(normalizedRelative);
  candidates.add(withoutExtension);

  sourceFileExtensions.forEach((extension) => {
    candidates.add(`${withoutExtension}${extension}`);
  });

  return Array.from(candidates).filter(Boolean);
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
  const stopTotal = startProfilingSection('moveFileGenerator.total');
  incrementProfilingCounter('moveFile.invocations');
  try {
    const projects = getProjects(tree);
    const projectGraph = await createProjectGraphAsync();

    const patterns = splitPatterns(options.file);
    incrementProfilingCounter('moveFile.patterns', patterns.length);

    const uniqueFilePaths = await resolveUniqueFilePaths(tree, patterns);
    const contexts = buildMoveContexts(tree, options, projects, uniqueFilePaths);
    const sourceProjectNames = collectSourceProjectNames(contexts);

    await runMoveBatch(
      tree,
      options,
      projects,
      projectGraph,
      contexts,
      uniqueFilePaths,
    );

    deleteSourceFiles(tree, contexts);

    if (options.removeEmptyProject) {
      await removeEmptySourceProjects(tree, projects, sourceProjectNames);
    }

    await formatWorkspace(tree, !!options.skipFormat);
  } finally {
    stopTotal();
    logProfilingSummary();
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

  for (const char of input) {

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

function validateMoveOptions(
  options: MoveFileGeneratorSchema,
  isGlobPattern: boolean,
): void {
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

  if (
    !isValidPathInput(options.project, {
      allowUnicode: !!options.allowUnicode,
    })
  ) {
    throw new Error(
      `Invalid project name: contains disallowed characters: "${options.project}"`,
    );
  }

  if (options.deriveProjectDirectory && options.projectDirectory) {
    throw new Error(
      'Cannot use both "deriveProjectDirectory" and "projectDirectory" options at the same time',
    );
  }

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
}

function getTargetProject(
  projects: Map<string, ProjectConfiguration>,
  projectName: string,
): ProjectConfiguration {
  const targetProject = projects.get(projectName);
  if (!targetProject) {
    throw new Error(`Target project "${projectName}" not found in workspace`);
  }
  return targetProject;
}

function ensureSourceFileExists(tree: Tree, filePath: string): string {
  const normalizedSource = sanitizePath(filePath);
  if (!tree.exists(normalizedSource)) {
    throw new Error(`Source file "${normalizedSource}" not found`);
  }
  return normalizedSource;
}

function resolveSourceProjectInfo(
  projects: Map<string, ProjectConfiguration>,
  normalizedSource: string,
): { project: ProjectConfiguration; name: string } {
  const sourceProjectInfo = findProjectForFile(projects, normalizedSource);
  if (!sourceProjectInfo) {
    throw new Error(
      `Could not determine source project for file "${normalizedSource}"`,
    );
  }
  return sourceProjectInfo;
}

function determineProjectDirectory(
  options: MoveFileGeneratorSchema,
  normalizedSource: string,
  sourceProject: ProjectConfiguration,
): string | undefined {
  if (options.deriveProjectDirectory) {
    const derivedDirectory = deriveProjectDirectoryFromSource(
      normalizedSource,
      sourceProject,
    );
    return derivedDirectory ? sanitizePath(derivedDirectory) : undefined;
  }

  if (options.projectDirectory) {
    return sanitizePath(options.projectDirectory);
  }

  return undefined;
}

function ensureTargetDoesNotExist(tree: Tree, normalizedTarget: string): void {
  if (tree.exists(normalizedTarget)) {
    throw new Error(`Target file "${normalizedTarget}" already exists`);
  }
}

function readRequiredFile(tree: Tree, normalizedSource: string): string {
  const fileContent = tree.read(normalizedSource, 'utf-8');
  if (!fileContent) {
    throw new Error(`Could not read file "${normalizedSource}"`);
  }
  return fileContent;
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
  const isGlobPattern = /[*?[\]{}]/.test(options.file);
  validateMoveOptions(options, isGlobPattern);

  const targetProjectName = options.project;
  const targetProject = getTargetProject(projects, targetProjectName);

  const normalizedSource = ensureSourceFileExists(tree, options.file);
  const { project: sourceProject, name: sourceProjectName } =
    resolveSourceProjectInfo(projects, normalizedSource);

  const sanitizedProjectDirectory = determineProjectDirectory(
    options,
    normalizedSource,
    sourceProject,
  );

  const normalizedTarget = buildTargetPath(
    targetProject,
    normalizedSource,
    sanitizedProjectDirectory,
  );

  ensureTargetDoesNotExist(tree, normalizedTarget);

  const fileContent = readRequiredFile(tree, normalizedSource);
  const sourceRoot = sourceProject.sourceRoot || sourceProject.root;
  const relativeFilePathInSource = path.relative(sourceRoot, normalizedSource);

  const isExported = isFileExported(
    tree,
    sourceProject,
    relativeFilePathInSource,
  );

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

  const hasImportsInTarget =
    !!targetImportPath &&
    checkForImportsInProject(
      tree,
      targetProject,
      sourceImportPath || normalizedSource,
    );

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

async function resolveUniqueFilePaths(
  tree: Tree,
  patterns: string[],
): Promise<string[]> {
  if (patterns.length === 0) {
    throw new Error('At least one file path or glob pattern must be provided');
  }

  const filePaths: string[] = [];
  const literalPatterns: string[] = [];
  const globPatterns: string[] = [];

  for (const pattern of patterns) {
    const normalizedPattern = normalizePath(pattern);
    if (/[*?[\]{}]/.test(normalizedPattern)) {
      globPatterns.push(normalizedPattern);
    } else {
      literalPatterns.push(normalizedPattern);
    }
  }

  filePaths.push(...literalPatterns);

  if (globPatterns.length > 0) {
    const uniqueGlobPatterns = Array.from(new Set(globPatterns));
    const stopGlob = startProfilingSection('moveFile.globExpansion');
    try {
      const globResults = await Promise.all(
        uniqueGlobPatterns.map(async (globPattern) => {
          const matches = await globAsync(tree, [globPattern]);
          if (matches.length === 0) {
            throw new Error(
              `No files found matching glob pattern: "${globPattern}"`,
            );
          }
          incrementProfilingCounter('moveFile.globMatches', matches.length);
          return matches;
        }),
      );

      for (const matches of globResults) {
        filePaths.push(...matches);
      }
    } finally {
      stopGlob();
    }
  }

  const uniqueFilePaths = Array.from(new Set(filePaths));
  if (uniqueFilePaths.length === 0) {
    throw new Error('At least one file path must be provided');
  }

  incrementProfilingCounter('moveFile.resolvedFiles', uniqueFilePaths.length);
  return uniqueFilePaths;
}

function buildMoveContexts(
  tree: Tree,
  options: MoveFileGeneratorSchema,
  projects: Map<string, ProjectConfiguration>,
  uniqueFilePaths: string[],
): MoveContext[] {
  const contexts = uniqueFilePaths.map((filePath) => {
    const stopResolve = startProfilingSection('moveFile.resolveAndValidate');
    try {
      const fileOptions = { ...options, file: filePath };
      return resolveAndValidate(tree, fileOptions, projects);
    } finally {
      stopResolve();
    }
  });

  incrementProfilingCounter('moveFile.contexts', contexts.length);
  return contexts;
}

function collectSourceProjectNames(contexts: MoveContext[]): Set<string> {
  const sourceProjectNames = new Set<string>();
  contexts.forEach((ctx) => {
    sourceProjectNames.add(ctx.sourceProjectName);
  });

  incrementProfilingCounter('moveFile.sourceProjects', sourceProjectNames.size);
  return sourceProjectNames;
}

async function runMoveBatch(
  tree: Tree,
  options: MoveFileGeneratorSchema,
  projects: Map<string, ProjectConfiguration>,
  projectGraph: ProjectGraph,
  contexts: MoveContext[],
  uniqueFilePaths: string[],
): Promise<void> {
  for (let i = 0; i < contexts.length; i++) {
    const ctx = contexts[i];
    const fileOptions = { ...options, file: uniqueFilePaths[i] };
    await executeMove(tree, fileOptions, projects, projectGraph, ctx, true);
  }
}

function deleteSourceFiles(tree: Tree, contexts: MoveContext[]): void {
  const stopDeleteSources = startProfilingSection('moveFile.deleteSources');
  try {
    contexts.forEach((ctx) => {
      tree.delete(ctx.normalizedSource);
    });
  } finally {
    stopDeleteSources();
  }

  incrementProfilingCounter('moveFile.sourcesDeleted', contexts.length);
}

async function removeEmptySourceProjects(
  tree: Tree,
  projects: Map<string, ProjectConfiguration>,
  sourceProjectNames: Set<string>,
): Promise<void> {
  const stopRemovalCheck = startProfilingSection(
    'moveFile.removeEmptyProjects',
  );
  try {
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
          incrementProfilingCounter('moveFile.projectsRemoved');
        } catch (error) {
          logger.error(
            `Failed to remove empty project ${projectName}: ${error}`,
          );
        }
      }
    }
  } finally {
    stopRemovalCheck();
  }
}

async function formatWorkspace(tree: Tree, skipFormat: boolean): Promise<void> {
  if (skipFormat) {
    return;
  }

  const stopFormat = startProfilingSection('moveFile.formatFiles');
  try {
    await formatFiles(tree);
  } finally {
    stopFormat();
  }
}

function startProfilingSection(section: string): () => void {
  if (!profilingEnabled) {
    return noop;
  }

  const start = performance.now();
  return () => {
    const duration = performance.now() - start;
    updateProfilingStats(section, duration);
  };
}

function updateProfilingStats(section: string, duration: number): void {
  const existing = profilingData.get(section);
  if (!existing) {
    profilingData.set(section, {
      total: duration,
      count: 1,
      min: duration,
      max: duration,
    });
    return;
  }

  existing.total += duration;
  existing.count += 1;
  existing.min = Math.min(existing.min, duration);
  existing.max = Math.max(existing.max, duration);
}

function incrementProfilingCounter(counter: string, amount = 1): void {
  if (!profilingEnabled) {
    return;
  }

  const current = profilingCounters.get(counter) ?? 0;
  profilingCounters.set(counter, current + amount);
}

function logProfilingSummary(): void {
  if (!profilingEnabled) {
    return;
  }

  const sections = Array.from(profilingData.entries());
  const counters = Array.from(profilingCounters.entries());

  if (sections.length === 0 && counters.length === 0) {
    return;
  }

  const lines: string[] = ['move-file profiling summary'];

  if (sections.length > 0) {
    lines.push('sections:');
    for (const [section, stats] of sections) {
      const average = stats.total / stats.count;
      lines.push(
        `  ${section}: count=${stats.count}, total=${formatDuration(
          stats.total,
        )}, avg=${formatDuration(average)}, min=${formatDuration(
          stats.min,
        )}, max=${formatDuration(stats.max)}`,
      );
    }
  }

  if (counters.length > 0) {
    lines.push('counters:');
    for (const [counter, value] of counters) {
      lines.push(`  ${counter}: ${value}`);
    }
  }

  logger.debug(lines.join('\n'));

  profilingData.clear();
  profilingCounters.clear();
}

function formatDuration(duration: number): string {
  return `${duration.toFixed(2)}ms`;
}

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
        logger.debug(
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

  logger.debug(
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
    targetProject,
    targetProjectName,
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
    logger.debug(`Checking project ${dependentName} for imports`);

    // If the dependent project is the target project, use relative imports
    if (
      targetProjectName &&
      targetRelativePath &&
      dependentName === targetProjectName
    ) {
      logger.debug(
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
  const fileExtensions = sourceFileExtensions;
  const filesToExclude = [sourceFilePath, ...excludeFilePaths];

  visitNotIgnoredFiles(tree, project.root, (filePath) => {
    // Normalize path separators for cross-platform compatibility
    const normalizedFilePath = normalizePath(filePath);

    if (
      fileExtensions.some((ext) => filePath.endsWith(ext)) &&
      !filesToExclude.includes(normalizedFilePath)
    ) {
      // Use jscodeshift to update imports that reference the source file
      const candidateSpecifiers = buildRelativeImportCandidateSpecifiers(
        normalizedFilePath,
        sourceFilePath,
      );

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
        { candidateSpecifiers },
      );
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
  const fileExtensions = sourceFileExtensions;

  visitNotIgnoredFiles(tree, project.root, (filePath) => {
    // Normalize path separators for cross-platform compatibility
    const normalizedFilePath = normalizePath(filePath);

    if (
      fileExtensions.some((ext) => filePath.endsWith(ext)) &&
      normalizedFilePath !== sourceFilePath &&
      normalizedFilePath !== targetFilePath
    ) {
      const relativeSpecifier = getRelativeImportSpecifier(
        normalizedFilePath,
        targetFilePath,
      );

      const candidateSpecifiers = buildRelativeImportCandidateSpecifiers(
        normalizedFilePath,
        sourceFilePath,
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
        { candidateSpecifiers },
      );
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
  const fileExtensions = sourceFileExtensions;
  let hasImports = false;
  const normalizedImportPath = normalizePath(importPath);
  const searchTargets = new Set<string>([
    importPath,
    normalizedImportPath,
    ensureRelativeSpecifier(normalizedImportPath),
  ]);

  [...searchTargets].forEach((target) => {
    searchTargets.add(`'${target}'`);
    searchTargets.add(`"${target}"`);
    searchTargets.add(`\`${target}\``);
  });

  visitNotIgnoredFiles(tree, project.root, (filePath) => {
    if (hasImports) {
      return; // Short-circuit if we already found imports
    }

    if (fileExtensions.some((ext) => filePath.endsWith(ext))) {
      const content = tree.read(filePath, 'utf-8');
      if (!content) {
        return;
      }

      if (
        Array.from(searchTargets).some((target) => content.includes(target))
      ) {
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
  const fileExtensions = sourceFileExtensions;

  visitNotIgnoredFiles(tree, project.root, (filePath) => {
    // Normalize path separators for cross-platform compatibility
    const normalizedFilePath = normalizePath(filePath);

    if (
      fileExtensions.some((ext) => filePath.endsWith(ext)) &&
      !excludeFilePaths.includes(normalizedFilePath)
    ) {
      const projectRoot = project.sourceRoot || project.root;
      const targetFilePath = path.join(projectRoot, targetRelativePath);
      const relativeSpecifier = getRelativeImportSpecifier(
        filePath,
        targetFilePath,
      );

      // Use jscodeshift to update imports from source import path to relative path
      updateImportSpecifier(
        tree,
        filePath,
        sourceImportPath,
        relativeSpecifier,
      );
    }
  });
}

function updateImportsByAliasInProject(
  tree: Tree,
  project: ProjectConfiguration,
  sourceImportPath: string,
  targetImportPath: string,
): void {
  const fileExtensions = sourceFileExtensions;

  visitNotIgnoredFiles(tree, project.root, (filePath) => {
    if (fileExtensions.some((ext) => filePath.endsWith(ext))) {
      // Use jscodeshift to update imports from source to target path
      updateImportSpecifier(tree, filePath, sourceImportPath, targetImportPath);
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
