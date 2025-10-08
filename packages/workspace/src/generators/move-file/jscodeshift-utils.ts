import { Tree, logger } from '@nx/devkit';
import * as jscodeshift from 'jscodeshift';

/**
 * Detects the predominant quote style used in a file.
 * Returns 'single' if single quotes are more common, 'double' if double quotes are more common.
 * Defaults to 'single' if no quotes are found or counts are equal.
 *
 * @param content - The file content to analyze
 * @returns 'single' or 'double'
 */
function detectQuoteStyle(content: string): 'single' | 'double' {
  // Count single and double quotes in import/export/require statements
  const singleQuoteMatches = content.match(/(?:from|import|require(?:\.resolve)?)\s*\(?.*?'/g) || [];
  const doubleQuoteMatches = content.match(/(?:from|import|require(?:\.resolve)?)\s*\(?.*?"/g) || [];
  
  const singleCount = singleQuoteMatches.length;
  const doubleCount = doubleQuoteMatches.length;
  
  // Return double if double quotes are more common, otherwise single (default)
  return doubleCount > singleCount ? 'double' : 'single';
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
  const content = tree.read(filePath, 'utf-8');
  if (!content || content.trim().length === 0) {
    return false;
  }

  try {
    const j = jscodeshift.withParser('tsx');
    const root = j(content);
    let hasChanges = false;

    // Update static imports: import ... from 'oldSpecifier'
    root
      .find(j.ImportDeclaration)
      .filter((path) => {
        const source = path.node.source.value;
        return source === oldSpecifier;
      })
      .forEach((path) => {
        path.node.source.value = newSpecifier;
        hasChanges = true;
      });

    // Update export declarations: export ... from 'oldSpecifier'
    root
      .find(j.ExportNamedDeclaration)
      .filter((path) => {
        const source = path.node.source?.value;
        return source === oldSpecifier;
      })
      .forEach((path) => {
        if (path.node.source) {
          path.node.source.value = newSpecifier;
          hasChanges = true;
        }
      });

    root
      .find(j.ExportAllDeclaration)
      .filter((path) => {
        const source = path.node.source.value;
        return source === oldSpecifier;
      })
      .forEach((path) => {
        path.node.source.value = newSpecifier;
        hasChanges = true;
      });

    // Update dynamic imports: import('oldSpecifier')
    root
      .find(j.CallExpression, {
        callee: { type: 'Import' },
      })
      .filter((path) => {
        const args = path.node.arguments;
        return (
          args.length > 0 &&
          args[0].type === 'StringLiteral' &&
          args[0].value === oldSpecifier
        );
      })
      .forEach((path) => {
        const arg = path.node.arguments[0];
        if (arg.type === 'StringLiteral') {
          arg.value = newSpecifier;
          hasChanges = true;
        }
      });

    // Update require calls: require('oldSpecifier')
    root
      .find(j.CallExpression, {
        callee: { type: 'Identifier', name: 'require' },
      })
      .filter((path) => {
        const args = path.node.arguments;
        return (
          args.length > 0 &&
          args[0].type === 'StringLiteral' &&
          args[0].value === oldSpecifier
        );
      })
      .forEach((path) => {
        const arg = path.node.arguments[0];
        if (arg.type === 'StringLiteral') {
          arg.value = newSpecifier;
          hasChanges = true;
        }
      });

    // Update require.resolve calls: require.resolve('oldSpecifier')
    root
      .find(j.CallExpression, {
        callee: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'require' },
          property: { type: 'Identifier', name: 'resolve' },
        },
      })
      .filter((path) => {
        const args = path.node.arguments;
        return (
          args.length > 0 &&
          args[0].type === 'StringLiteral' &&
          args[0].value === oldSpecifier
        );
      })
      .forEach((path) => {
        const arg = path.node.arguments[0];
        if (arg.type === 'StringLiteral') {
          arg.value = newSpecifier;
          hasChanges = true;
        }
      });

    if (hasChanges) {
      const quoteStyle = detectQuoteStyle(content);
      const updatedContent = root.toSource({ quote: quoteStyle });
      tree.write(filePath, updatedContent);
      logger.debug(`Updated imports in ${filePath} using jscodeshift`);
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
  const content = tree.read(filePath, 'utf-8');
  if (!content || content.trim().length === 0) {
    return false;
  }

  try {
    const j = jscodeshift.withParser('tsx');
    const root = j(content);
    let hasChanges = false;

    // Update static imports: import ... from 'specifier'  
    // Example: import { foo } from './path'
    root
      .find(j.ImportDeclaration)
      .filter((path) => {
        const source = path.node.source.value;
        return typeof source === 'string' && matcher(source);
      })
      .forEach((path) => {
        const oldSource = String(path.node.source.value);
        path.node.source.value = getNewSpecifier(oldSource);
        hasChanges = true;
      });

    // Update export declarations: export ... from 'specifier'
    // Example: export { foo } from './path'
    root
      .find(j.ExportNamedDeclaration)
      .filter((path) => {
        const source = path.node.source?.value;
        return typeof source === 'string' && matcher(source);
      })
      .forEach((path) => {
        if (path.node.source) {
          const oldSource = String(path.node.source.value);
          path.node.source.value = getNewSpecifier(oldSource);
          hasChanges = true;
        }
      });

    // Example: export * from './path'
    root
      .find(j.ExportAllDeclaration)
      .filter((path) => {
        const source = path.node.source.value;
        return typeof source === 'string' && matcher(source);
      })
      .forEach((path) => {
        const oldSource = String(path.node.source.value);
        path.node.source.value = getNewSpecifier(oldSource);
        hasChanges = true;
      });

    // Update dynamic imports: import('specifier')
    // Example: import('./path')
    root
      .find(j.CallExpression, {
        callee: { type: 'Import' },
      })
      .filter((path) => {
        const args = path.node.arguments;
        return (
          args.length > 0 &&
          args[0].type === 'StringLiteral' &&
          matcher(args[0].value)
        );
      })
      .forEach((path) => {
        const args = path.node.arguments;
        if (args[0].type === 'StringLiteral') {
          const oldValue = args[0].value;
          args[0].value = getNewSpecifier(oldValue);
          hasChanges = true;
        }
      });

    // Update require calls: require('specifier')
    // Example: const foo = require('./path')
    root
      .find(j.CallExpression, {
        callee: { type: 'Identifier', name: 'require' },
      })
      .filter((path) => {
        const args = path.node.arguments;
        return (
          args.length > 0 &&
          args[0].type === 'StringLiteral' &&
          matcher(args[0].value)
        );
      })
      .forEach((path) => {
        const args = path.node.arguments;
        if (args[0].type === 'StringLiteral') {
          const oldValue = args[0].value;
          args[0].value = getNewSpecifier(oldValue);
          hasChanges = true;
        }
      });

    // Update require.resolve calls: require.resolve('specifier')
    // Example: const path = require.resolve('./path')
    root
      .find(j.CallExpression, {
        callee: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'require' },
          property: { type: 'Identifier', name: 'resolve' },
        },
      })
      .filter((path) => {
        const args = path.node.arguments;
        return (
          args.length > 0 &&
          args[0].type === 'StringLiteral' &&
          matcher(args[0].value)
        );
      })
      .forEach((path) => {
        const args = path.node.arguments;
        if (args[0].type === 'StringLiteral') {
          const oldValue = args[0].value;
          args[0].value = getNewSpecifier(oldValue);
          hasChanges = true;
        }
      });

    if (hasChanges) {
      const quoteStyle = detectQuoteStyle(content);
      const updatedContent = root.toSource({ quote: quoteStyle });
      tree.write(filePath, updatedContent);
      logger.debug(
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
  const content = tree.read(filePath, 'utf-8');
  if (!content || content.trim().length === 0) {
    return false;
  }

  try {
    const j = jscodeshift.withParser('tsx');
    const root = j(content);

    // Check static imports
    // Example: import { foo } from './path'
    const hasStaticImport =
      root
        .find(j.ImportDeclaration)
        .filter((path) => path.node.source.value === specifier).length > 0;

    if (hasStaticImport) {
      return true;
    }

    // Check export declarations
    // Example: export { foo } from './path' or export * from './path'
    const hasExportFrom =
      root
        .find(j.ExportNamedDeclaration)
        .filter((path) => path.node.source?.value === specifier).length > 0 ||
      root
        .find(j.ExportAllDeclaration)
        .filter((path) => path.node.source.value === specifier).length > 0;

    if (hasExportFrom) {
      return true;
    }

    // Check dynamic imports
    // Example: import('./path')
    const hasDynamicImport =
      root
        .find(j.CallExpression, {
          callee: { type: 'Import' },
        })
        .filter((path) => {
          const args = path.node.arguments;
          return (
            args.length > 0 &&
            args[0].type === 'StringLiteral' &&
            args[0].value === specifier
          );
        }).length > 0;

    if (hasDynamicImport) {
      return true;
    }

    // Check require calls
    // Example: const foo = require('./path')
    const hasRequire =
      root
        .find(j.CallExpression, {
          callee: { type: 'Identifier', name: 'require' },
        })
        .filter((path) => {
          const args = path.node.arguments;
          return (
            args.length > 0 &&
            args[0].type === 'StringLiteral' &&
            args[0].value === specifier
          );
        }).length > 0;

    if (hasRequire) {
      return true;
    }

    // Check require.resolve calls
    // Example: const path = require.resolve('./path')
    const hasRequireResolve =
      root
        .find(j.CallExpression, {
          callee: {
            type: 'MemberExpression',
            object: { type: 'Identifier', name: 'require' },
            property: { type: 'Identifier', name: 'resolve' },
          },
        })
        .filter((path) => {
          const args = path.node.arguments;
          return (
            args.length > 0 &&
            args[0].type === 'StringLiteral' &&
            args[0].value === specifier
          );
        }).length > 0;

    return hasRequireResolve;
  } catch {
    // If parsing fails, log warning and return false
    logger.warn(
      `Unable to parse ${filePath}. Import check may be inaccurate.`,
    );
    return false;
  }
}
