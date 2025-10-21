import { Tree, logger } from '@nx/devkit';
import type { ASTNode } from 'jscodeshift';
import { astCache, j } from './ast-cache';

/**
 * Quick check if content might contain imports/requires before expensive parsing.
 * This is a fast pre-filter to avoid parsing files with no imports.
 */
function mightContainImports(content: string): boolean {
  // Check for common import/require patterns
  return (
    content.includes('import') ||
    content.includes('require') ||
    content.includes('export')
  );
}

/**
 * Quick check if content might contain a specific specifier before expensive parsing.
 * This is a fast pre-filter to avoid parsing files that definitely don't contain the specifier.
 */
function mightContainSpecifier(content: string, specifier: string): boolean {
  // Simple string search - if the specifier doesn't appear anywhere in the file,
  // it definitely won't be in an import
  return content.includes(specifier);
}

/**
 * Updates import specifiers in a file using jscodeshift.
 *
 * @param tree - The virtual file system tree
 * @param filePath - Path to the file to update
 * @param oldSpecifier - The old import specifier to replace
 * @param newSpecifier - The new import specifier
 * @returns True if changes were made
 */
export function updateImportSpecifier(
  tree: Tree,
  filePath: string,
  oldSpecifier: string,
  newSpecifier: string,
): boolean {
  // Get content from cache or read from tree
  const content = astCache.getContent(tree, filePath);
  if (!content || content.trim().length === 0) {
    return false;
  }

  // Early exit: quick string check before expensive parsing
  if (!mightContainSpecifier(content, oldSpecifier)) {
    return false;
  }

  // Get parsed AST from cache or parse content
  const root = astCache.getAST(tree, filePath);
  if (!root) {
    return false;
  }

  try {
    let hasChanges = false;

    // Optimized: Filter to only relevant node types before traversal
    // This reduces the number of nodes we need to check dramatically
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

      // Handle ImportDeclaration: import ... from 'oldSpecifier'
      if (j.ImportDeclaration.check(node)) {
        if (node.source.value === oldSpecifier) {
          node.source.value = newSpecifier;
          hasChanges = true;
        }
      }
      // Handle ExportNamedDeclaration: export { foo } from 'oldSpecifier'
      else if (j.ExportNamedDeclaration.check(node)) {
        if (node.source?.value === oldSpecifier) {
          node.source.value = newSpecifier;
          hasChanges = true;
        }
      }
      // Handle ExportAllDeclaration: export * from 'oldSpecifier'
      else if (j.ExportAllDeclaration.check(node)) {
        if (node.source.value === oldSpecifier) {
          node.source.value = newSpecifier;
          hasChanges = true;
        }
      }
      // Handle CallExpression for dynamic imports, require, and require.resolve
      else if (j.CallExpression.check(node)) {
        const { callee, arguments: args } = node;

        // Check if first argument matches oldSpecifier
        if (
          args.length > 0 &&
          j.StringLiteral.check(args[0]) &&
          args[0].value === oldSpecifier
        ) {
          // Dynamic import: import('oldSpecifier')
          if (j.Import.check(callee)) {
            args[0].value = newSpecifier;
            hasChanges = true;
          }
          // require('oldSpecifier')
          else if (j.Identifier.check(callee) && callee.name === 'require') {
            args[0].value = newSpecifier;
            hasChanges = true;
          }
          // require.resolve('oldSpecifier')
          else if (
            j.MemberExpression.check(callee) &&
            j.Identifier.check(callee.object) &&
            callee.object.name === 'require' &&
            j.Identifier.check(callee.property) &&
            callee.property.name === 'resolve'
          ) {
            args[0].value = newSpecifier;
            hasChanges = true;
          }
        }
      }
    });

    if (hasChanges) {
      const updatedContent = root.toSource({ quote: 'single' });
      tree.write(filePath, updatedContent);
      // Invalidate cache since file was modified
      astCache.invalidate(filePath);
      logger.verbose(`Updated imports in ${filePath} using jscodeshift`);
    }

    return hasChanges;
  } catch (error) {
    // If parsing fails, log warning and return false
    logger.warn(
      `Unable to parse ${filePath}. Import updates may not be applied. Error: ${error}`,
    );
    return false;
  }
}

/**
 * Updates import specifiers that match a pattern in a file using jscodeshift.
 * This is optimized to do a single AST traversal instead of multiple find() calls.
 *
 * @param tree - The virtual file system tree
 * @param filePath - Path to the file to update
 * @param matcher - Function to test if an import specifier should be updated
 * @param getNewSpecifier - Function to get the new specifier from the old one
 * @returns True if changes were made
 */
export function updateImportSpecifierPattern(
  tree: Tree,
  filePath: string,
  matcher: (specifier: string) => boolean,
  getNewSpecifier: (oldSpecifier: string) => string,
): boolean {
  // Get content from cache or read from tree
  const content = astCache.getContent(tree, filePath);
  if (!content || content.trim().length === 0) {
    return false;
  }

  // Early exit: quick check if file contains any imports/requires at all
  if (!mightContainImports(content)) {
    return false;
  }

  // Get parsed AST from cache or parse content
  const root = astCache.getAST(tree, filePath);
  if (!root) {
    return false;
  }

  try {
    let hasChanges = false;

    // Optimized: Filter to only relevant node types before traversal
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
        if (typeof source === 'string' && matcher(source)) {
          node.source.value = getNewSpecifier(source);
          hasChanges = true;
        }
      }
      // Handle ExportNamedDeclaration: export { foo } from 'specifier'
      else if (j.ExportNamedDeclaration.check(node)) {
        if (node.source && typeof node.source.value === 'string') {
          const source = node.source.value;
          if (matcher(source)) {
            node.source.value = getNewSpecifier(source);
            hasChanges = true;
          }
        }
      }
      // Handle ExportAllDeclaration: export * from 'specifier'
      else if (j.ExportAllDeclaration.check(node)) {
        const source = node.source.value;
        if (typeof source === 'string' && matcher(source)) {
          node.source.value = getNewSpecifier(source);
          hasChanges = true;
        }
      }
      // Handle CallExpression for dynamic imports, require, and require.resolve
      else if (j.CallExpression.check(node)) {
        const { callee, arguments: args } = node;

        // Check if first argument is a string literal
        if (
          args.length > 0 &&
          j.StringLiteral.check(args[0]) &&
          typeof args[0].value === 'string'
        ) {
          const specifier = args[0].value;

          // Dynamic import: import('specifier')
          if (j.Import.check(callee) && matcher(specifier)) {
            args[0].value = getNewSpecifier(specifier);
            hasChanges = true;
          }
          // require('specifier')
          else if (
            j.Identifier.check(callee) &&
            callee.name === 'require' &&
            matcher(specifier)
          ) {
            args[0].value = getNewSpecifier(specifier);
            hasChanges = true;
          }
          // require.resolve('specifier')
          else if (
            j.MemberExpression.check(callee) &&
            j.Identifier.check(callee.object) &&
            callee.object.name === 'require' &&
            j.Identifier.check(callee.property) &&
            callee.property.name === 'resolve' &&
            matcher(specifier)
          ) {
            args[0].value = getNewSpecifier(specifier);
            hasChanges = true;
          }
        }
      }
    });

    if (hasChanges) {
      const updatedContent = root.toSource({ quote: 'single' });
      tree.write(filePath, updatedContent);
      // Invalidate cache since file was modified
      astCache.invalidate(filePath);
      logger.verbose(
        `Updated imports in ${filePath} using jscodeshift pattern matcher`,
      );
    }

    return hasChanges;
  } catch (error) {
    // If parsing fails, log warning and return false
    logger.warn(
      `Unable to parse ${filePath}. Import updates may not be applied. Error: ${error}`,
    );
    return false;
  }
}

/**
 * Checks if a file contains imports matching a given specifier.
 * Optimized with early exits to avoid expensive parsing when possible.
 *
 * @param tree - The virtual file system tree
 * @param filePath - Path to the file to check
 * @param specifier - The import specifier to search for
 * @returns True if the file contains imports with the given specifier
 */
export function hasImportSpecifier(
  tree: Tree,
  filePath: string,
  specifier: string,
): boolean {
  // Get content from cache or read from tree
  const content = astCache.getContent(tree, filePath);
  if (!content || content.trim().length === 0) {
    return false;
  }

  // Early exit: quick string check before expensive parsing
  if (!mightContainSpecifier(content, specifier)) {
    return false;
  }

  // Get parsed AST from cache or parse content
  const root = astCache.getAST(tree, filePath);
  if (!root) {
    return false;
  }

  try {
    // Optimized: Filter to only relevant node types and use early termination
    let found = false;

    const relevantNodes = root.find(j.Node, (node) => {
      return (
        j.ImportDeclaration.check(node) ||
        j.ExportNamedDeclaration.check(node) ||
        j.ExportAllDeclaration.check(node) ||
        j.CallExpression.check(node)
      );
    });

    relevantNodes.forEach((path) => {
      if (found) return; // Early termination if already found

      const node = path.node as ASTNode;

      // Check ImportDeclaration
      if (j.ImportDeclaration.check(node)) {
        if (node.source.value === specifier) {
          found = true;
          return;
        }
      }
      // Check ExportNamedDeclaration
      else if (j.ExportNamedDeclaration.check(node)) {
        if (node.source?.value === specifier) {
          found = true;
          return;
        }
      }
      // Check ExportAllDeclaration
      else if (j.ExportAllDeclaration.check(node)) {
        if (node.source.value === specifier) {
          found = true;
          return;
        }
      }
      // Check CallExpression for dynamic imports, require, and require.resolve
      else if (j.CallExpression.check(node)) {
        const { callee, arguments: args } = node;
        if (
          args.length > 0 &&
          j.StringLiteral.check(args[0]) &&
          args[0].value === specifier
        ) {
          // Dynamic import: import('specifier')
          if (j.Import.check(callee)) {
            found = true;
            return;
          }
          // require('specifier')
          if (j.Identifier.check(callee) && callee.name === 'require') {
            found = true;
            return;
          }
          // require.resolve('specifier')
          if (
            j.MemberExpression.check(callee) &&
            j.Identifier.check(callee.object) &&
            callee.object.name === 'require' &&
            j.Identifier.check(callee.property) &&
            callee.property.name === 'resolve'
          ) {
            found = true;
            return;
          }
        }
      }
    });

    return found;
  } catch (error) {
    // If parsing fails, log warning and return false
    logger.warn(
      `Unable to parse ${filePath}. Import check may be inaccurate. Error: ${error}`,
    );
    return false;
  }
}

/**
 * Checks if a file has an import matching a predicate function.
 *
 * @param tree - The virtual file system tree
 * @param filePath - Path to the file to check
 * @param matcher - Predicate function to test import specifiers
 * @returns True if any import matches the predicate
 */
export function hasImportSpecifierMatching(
  tree: Tree,
  filePath: string,
  matcher: (specifier: string) => boolean,
): boolean {
  // Get content from cache or read from tree
  const content = astCache.getContent(tree, filePath);
  if (!content || content.trim().length === 0) {
    return false;
  }

  // Early exit: quick check if file contains any imports/requires at all
  if (!mightContainImports(content)) {
    return false;
  }

  // Get parsed AST from cache or parse content
  const root = astCache.getAST(tree, filePath);
  if (!root) {
    return false;
  }

  try {
    let found = false;

    // Optimized: Filter to only relevant node types and use early termination
    const relevantNodes = root.find(j.Node, (node) => {
      return (
        j.ImportDeclaration.check(node) ||
        j.ExportNamedDeclaration.check(node) ||
        j.ExportAllDeclaration.check(node) ||
        j.CallExpression.check(node)
      );
    });

    relevantNodes.forEach((path) => {
      if (found) {
        return; // Early termination if already found
      }

      const node = path.node as ASTNode;

      // Handle ImportDeclaration: import ... from 'specifier'
      if (j.ImportDeclaration.check(node)) {
        const source = node.source.value;
        if (typeof source === 'string' && matcher(source)) {
          found = true;
          return;
        }
      }
      // Handle ExportNamedDeclaration: export { foo } from 'specifier'
      else if (j.ExportNamedDeclaration.check(node)) {
        if (node.source && typeof node.source.value === 'string') {
          const source = node.source.value;
          if (matcher(source)) {
            found = true;
            return;
          }
        }
      }
      // Handle ExportAllDeclaration: export * from 'specifier'
      else if (j.ExportAllDeclaration.check(node)) {
        const source = node.source.value;
        if (typeof source === 'string' && matcher(source)) {
          found = true;
          return;
        }
      }
      // Handle CallExpression for dynamic imports, require, and require.resolve
      else if (j.CallExpression.check(node)) {
        const { callee, arguments: args } = node;

        // Check if first argument is a string literal
        if (
          args.length > 0 &&
          j.StringLiteral.check(args[0]) &&
          typeof args[0].value === 'string'
        ) {
          const specifier = args[0].value;

          // Dynamic import: import('specifier')
          if (j.Import.check(callee) && matcher(specifier)) {
            found = true;
            return;
          }
          // require('specifier')
          else if (
            j.Identifier.check(callee) &&
            callee.name === 'require' &&
            matcher(specifier)
          ) {
            found = true;
            return;
          }
          // require.resolve('specifier')
          else if (
            j.MemberExpression.check(callee) &&
            j.Identifier.check(callee.object) &&
            callee.object.name === 'require' &&
            j.Identifier.check(callee.property) &&
            callee.property.name === 'resolve' &&
            matcher(specifier)
          ) {
            found = true;
            return;
          }
        }
      }
    });

    return found;
  } catch (error) {
    // If parsing fails, log warning and return false
    logger.warn(
      `Unable to parse ${filePath}. Import check may be inaccurate. Error: ${error}`,
    );
    return false;
  }
}

/**
 * Clears all cached ASTs and content. Should be called at the start of each move operation
 * to ensure a clean state.
 */
export function clearCache(): void {
  astCache.clear();
}

/**
 * Gets cache statistics for monitoring/debugging.
 */
export function getCacheStats(): {
  contentCacheSize: number;
  astCacheSize: number;
  failedParseCount: number;
} {
  return astCache.getStats();
}
