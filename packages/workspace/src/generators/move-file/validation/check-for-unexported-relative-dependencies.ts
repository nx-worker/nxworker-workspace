import { Tree, ProjectConfiguration, normalizePath } from '@nx/devkit';
import { posix as path } from 'node:path';
import type { ASTNode } from 'jscodeshift';
import { removeSourceFileExtension } from '../path-utils/remove-source-file-extension';
import { isFileExported } from '../export-management/is-file-exported';
import { astCache, j } from '../ast-cache';

/**
 * Information about an unexported relative dependency.
 */
export interface UnexportedDependency {
  /**
   * The relative import specifier as it appears in the code.
   */
  specifier: string;

  /**
   * The absolute path to the dependency file.
   */
  resolvedPath: string;

  /**
   * The relative path within the source project.
   */
  relativePathInProject: string;
}

/**
 * Collects all import specifiers from a file.
 *
 * @param tree - The virtual file system tree.
 * @param filePath - Path to the file to analyze.
 * @returns Array of import specifiers found in the file.
 */
function collectImportSpecifiers(tree: Tree, filePath: string): string[] {
  const specifiers: string[] = [];

  // Get content from cache or read from tree
  const content = astCache.getContent(tree, filePath);
  if (!content || content.trim().length === 0) {
    return specifiers;
  }

  // Early exit: quick check if file contains any imports/requires at all
  if (
    !(
      content.includes('import') ||
      content.includes('require') ||
      content.includes('export')
    )
  ) {
    return specifiers;
  }

  // Get parsed AST from cache or parse content
  const root = astCache.getAST(tree, filePath);
  if (!root) {
    return specifiers;
  }

  try {
    // Filter to only relevant node types
    const relevantNodes = root.find(j.Node, (node) => {
      return (
        j.ImportDeclaration.check(node) ||
        j.ExportNamedDeclaration.check(node) ||
        j.ExportAllDeclaration.check(node) ||
        j.CallExpression.check(node)
      );
    });

    relevantNodes.forEach((path) => {
      const node = path.node as ASTNode;

      // Handle ImportDeclaration: import ... from 'specifier'
      if (j.ImportDeclaration.check(node)) {
        const source = node.source.value;
        if (typeof source === 'string') {
          specifiers.push(source);
        }
      }
      // Handle ExportNamedDeclaration: export { foo } from 'specifier'
      else if (j.ExportNamedDeclaration.check(node)) {
        if (node.source && typeof node.source.value === 'string') {
          specifiers.push(node.source.value);
        }
      }
      // Handle ExportAllDeclaration: export * from 'specifier'
      else if (j.ExportAllDeclaration.check(node)) {
        const source = node.source.value;
        if (typeof source === 'string') {
          specifiers.push(source);
        }
      }
      // Handle CallExpression for dynamic imports and require
      else if (j.CallExpression.check(node)) {
        const { callee, arguments: args } = node;

        // Check if first argument is a string literal
        if (
          args.length > 0 &&
          j.StringLiteral.check(args[0]) &&
          typeof args[0].value === 'string'
        ) {
          const specifier = args[0].value;

          // Dynamic import: import('specifier') or require('specifier')
          if (
            j.Import.check(callee) ||
            (j.Identifier.check(callee) && callee.name === 'require')
          ) {
            specifiers.push(specifier);
          }
        }
      }
    });
  } catch {
    // If parsing fails, return empty array
    return specifiers;
  }

  return specifiers;
}

/**
 * Checks if the moved file has relative imports to unexported files in the source project.
 *
 * When a file is moved to a different project, any relative imports it has to other files
 * in the source project will be updated to use the source project's import path/alias.
 * However, if those dependencies are not exported from the source project, the imports
 * will break after the move.
 *
 * @param tree - The virtual file system tree.
 * @param sourceFilePath - The absolute path to the source file being moved.
 * @param sourceProject - The source project configuration.
 * @param cachedTreeExists - Function to check file existence with caching.
 * @returns Array of unexported dependencies found.
 */
export function checkForUnexportedRelativeDependencies(
  tree: Tree,
  sourceFilePath: string,
  sourceProject: ProjectConfiguration,
  cachedTreeExists: (tree: Tree, filePath: string) => boolean,
): UnexportedDependency[] {
  const unexportedDeps: UnexportedDependency[] = [];
  const sourceRoot = sourceProject.sourceRoot || sourceProject.root;
  const normalizedSourceWithoutExt = normalizePath(
    removeSourceFileExtension(sourceFilePath),
  );

  // Collect all import specifiers from the source file
  const specifiers = collectImportSpecifiers(tree, sourceFilePath);

  for (const specifier of specifiers) {
    // Only check relative imports
    if (!specifier.startsWith('.')) {
      continue;
    }

    // Resolve the import specifier to an absolute path
    const sourceFileDir = path.dirname(sourceFilePath);
    const resolvedImport = path.join(sourceFileDir, specifier);

    // Normalize and compare (both without extension)
    const normalizedResolvedImport = normalizePath(
      removeSourceFileExtension(resolvedImport),
    );

    // Skip self-references
    if (normalizedResolvedImport === normalizedSourceWithoutExt) {
      continue;
    }

    // Get the relative path within the source project
    const relativePathInProject = path.relative(
      sourceRoot,
      normalizedResolvedImport,
    );

    // Check if this dependency is exported from the source project
    const isExported = isFileExported(
      tree,
      sourceProject,
      relativePathInProject,
      cachedTreeExists,
    );

    // If not exported, add to the list
    if (!isExported) {
      unexportedDeps.push({
        specifier,
        resolvedPath: normalizedResolvedImport,
        relativePathInProject,
      });
    }
  }

  return unexportedDeps;
}
