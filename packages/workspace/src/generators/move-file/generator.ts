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
 * @param options - Generator options including from and to file paths
 * @returns A promise that resolves when the generator completes
 */
export async function moveFileGenerator(
  tree: Tree,
  options: MoveFileGeneratorSchema,
) {
  const projects = getProjects(tree);
  const projectGraph = await createProjectGraphAsync();

  const ctx = resolveAndValidate(tree, options, projects);

  await executeMove(tree, options, projects, projectGraph, ctx);
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
  // Validate user input to avoid accepting regex-like patterns or dangerous characters
  if (
    !isValidPathInput(options.from, {
      allowUnicode: !!options.allowUnicode,
    })
  ) {
    throw new Error(
      `Invalid path input for 'from': contains disallowed characters: "${options.from}"`,
    );
  }

  if (
    !isValidPathInput(options.to, {
      allowUnicode: !!options.allowUnicode,
    })
  ) {
    throw new Error(
      `Invalid path input for 'to': contains disallowed characters: "${options.to}"`,
    );
  }

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
 */
async function executeMove(
  tree: Tree,
  options: MoveFileGeneratorSchema,
  projects: Map<string, ProjectConfiguration>,
  projectGraph: ProjectGraph,
  ctx: MoveContext,
) {
  const {
    normalizedSource,
    normalizedTarget,
    sourceProjectName,
    targetProjectName,
    fileContent,
    sourceImportPath,
  } = ctx;

  logger.info(
    `Moving ${normalizedSource} (project: ${sourceProjectName}) to ${normalizedTarget} (project: ${targetProjectName})`,
  );

  createTargetFile(tree, normalizedTarget, fileContent);

  await handleMoveStrategy(tree, projectGraph, projects, ctx);

  const sourceIdentifier = sourceImportPath || normalizedSource;
  updateTargetProjectImportsIfNeeded(tree, ctx, sourceIdentifier);

  ensureExportIfNeeded(tree, ctx, options);

  await finalizeMove(tree, normalizedSource, options);
}

function createTargetFile(
  tree: Tree,
  normalizedTarget: string,
  fileContent: string,
): void {
  tree.write(normalizedTarget, fileContent);
}

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

  logger.info(`Moving within same project, updating imports to relative paths`);

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
    relativeFilePathInSource,
  } = ctx;

  if (!sourceImportPath || !targetImportPath) {
    return;
  }

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

  updateImportPathsToPackageAlias(
    tree,
    sourceProject,
    normalizedSource,
    targetImportPath,
  );

  removeFileExport(tree, sourceProject, relativeFilePathInSource);
}

/**
 * Handles moves across projects when the file is not exported but aliases exist.
 *
 * @param tree - The virtual file system tree.
 * @param ctx - Resolved move context.
 */
function handleNonExportedAliasMove(tree: Tree, ctx: MoveContext): void {
  const { sourceProject, normalizedSource, targetImportPath } = ctx;

  if (!targetImportPath) {
    return;
  }

  logger.info(
    `File is not exported, updating imports within source project to use target import path`,
  );

  updateImportPathsToPackageAlias(
    tree,
    sourceProject,
    normalizedSource,
    targetImportPath,
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

  logger.info(`Updating imports within source project to relative paths`);

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

  logger.info(`Updating imports in target project to relative imports`);

  const targetRoot = targetProject.sourceRoot || targetProject.root;
  const relativeFilePathInTarget = path.relative(targetRoot, normalizedTarget);

  updateImportsToRelative(
    tree,
    targetProject,
    sourceIdentifier,
    relativeFilePathInTarget,
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
 * Reads the TypeScript compiler path mappings from `tsconfig.base.json`.
 *
 * @param tree - The virtual file system tree.
 * @returns The paths object or null if unavailable.
 */
function readCompilerPaths(tree: Tree): Record<string, unknown> | null {
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
    const paths = tsconfig.compilerOptions?.paths;

    return typeof paths === 'object' && paths ? paths : null;
  } catch (error) {
    logger.warn(`Could not parse tsconfig.base.json: ${error}`);
    return null;
  }
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

      const staticPattern = new RegExp(
        `(from\\s+['"])(\\.{1,2}/[^'"]*${sourceFileName})(['"])`,
        'g',
      );
      const dynamicPattern = new RegExp(
        `(import\\s*\\(\\s*['"])(\\.{1,2}/[^'"]*${sourceFileName})(['"]\\s*\\))`,
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

      const staticPattern = new RegExp(
        `(from\\s+['"])(\\.{1,2}/[^'"]*${sourceFileName})(['"])`,
        'g',
      );
      const dynamicPattern = new RegExp(
        `(import\\s*\\(\\s*['"])(\\.{1,2}/[^'"]*${sourceFileName})(['"]\\s*\\))`,
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
        logger.info(`Updated relative imports in ${filePath}`);
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
): void {
  const fileExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'];

  visitNotIgnoredFiles(tree, project.root, (filePath) => {
    if (fileExtensions.some((ext) => filePath.endsWith(ext))) {
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
