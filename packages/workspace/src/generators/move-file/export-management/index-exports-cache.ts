import type { Tree } from '@nx/devkit';
import { astCache, j } from '../ast-cache';

/**
 * Interface representing parsed exports from an index/entrypoint file.
 */
export interface IndexExports {
  /**
   * Set of local named export identifiers (normalized).
   * Examples: 'foo', 'bar', 'MyClass', 'myFunction'
   */
  exports: Set<string>;

  /**
   * Set of re-export specifiers (module paths).
   * Examples: './lib/util', '../helpers'
   */
  reexports: Set<string>;

  /**
   * Identifier or synthetic marker for default export.
   * Examples: 'MyComponent', '<default>', '<anonymous>'
   */
  defaultExport?: string;
}

/**
 * Cache for storing parsed index exports.
 * Maps file path -> IndexExports
 */
const indexExportsCache = new Map<string, IndexExports>();

/**
 * Parses an index/entrypoint file and extracts all exports (local and re-exports).
 *
 * Supported patterns:
 * - Re-exports: `export * from './lib'`, `export { foo } from './lib'`
 * - Named declarations: `export const A`, `export function b`, `export class C`, etc.
 * - Named list: `export { a, b as c }` (without `from`)
 * - Default exports: `export default X`, `export default function() {}`
 *
 * @param tree - The virtual file system tree
 * @param indexPath - Path to the index/entrypoint file
 * @returns IndexExports object containing all exports
 */
export function getIndexExports(tree: Tree, indexPath: string): IndexExports {
  // Check cache first
  const cached = indexExportsCache.get(indexPath);
  if (cached) {
    return cached;
  }

  // Initialize result
  const result: IndexExports = {
    exports: new Set<string>(),
    reexports: new Set<string>(),
    defaultExport: undefined,
  };

  // Get parsed AST from cache or parse content
  const root = astCache.getAST(tree, indexPath);
  if (!root) {
    // Cache empty result if file cannot be parsed
    indexExportsCache.set(indexPath, result);
    return result;
  }

  try {
    // Find all export declarations
    root
      .find(j.Node, (node) => {
        return (
          j.ExportNamedDeclaration.check(node) ||
          j.ExportDefaultDeclaration.check(node) ||
          j.ExportAllDeclaration.check(node)
        );
      })
      .forEach((path) => {
        const node = path.node;

        // Handle ExportAllDeclaration: export * from './lib'
        if (j.ExportAllDeclaration.check(node)) {
          const source = node.source?.value;
          if (typeof source === 'string') {
            result.reexports.add(source);
          }
        }
        // Handle ExportNamedDeclaration
        else if (j.ExportNamedDeclaration.check(node)) {
          // Re-export: export { foo } from './lib'
          if (node.source) {
            const source = node.source.value;
            if (typeof source === 'string') {
              result.reexports.add(source);
            }
          }
          // Local export with declaration: export const A = 1
          else if (node.declaration) {
            const declaration = node.declaration;

            // Variable declaration: export const A = 1, B = 2
            if (j.VariableDeclaration.check(declaration)) {
              declaration.declarations.forEach((declarator) => {
                if (
                  j.VariableDeclarator.check(declarator) &&
                  j.Identifier.check(declarator.id)
                ) {
                  result.exports.add(declarator.id.name);
                }
              });
            }
            // Function declaration: export function foo() {}
            else if (j.FunctionDeclaration.check(declaration)) {
              if (declaration.id && j.Identifier.check(declaration.id)) {
                result.exports.add(declaration.id.name);
              }
            }
            // Class declaration: export class MyClass {}
            else if (j.ClassDeclaration.check(declaration)) {
              if (declaration.id && j.Identifier.check(declaration.id)) {
                result.exports.add(declaration.id.name);
              }
            }
            // TypeScript: export interface IFoo {}
            else if (j.TSInterfaceDeclaration.check(declaration)) {
              if (declaration.id && j.Identifier.check(declaration.id)) {
                result.exports.add(declaration.id.name);
              }
            }
            // TypeScript: export type T = string
            else if (j.TSTypeAliasDeclaration.check(declaration)) {
              if (declaration.id && j.Identifier.check(declaration.id)) {
                result.exports.add(declaration.id.name);
              }
            }
            // TypeScript: export enum E {}
            else if (j.TSEnumDeclaration.check(declaration)) {
              if (declaration.id && j.Identifier.check(declaration.id)) {
                result.exports.add(declaration.id.name);
              }
            }
          }
          // Local export list: export { a, b as c }
          else if (node.specifiers && node.specifiers.length > 0) {
            node.specifiers.forEach((specifier) => {
              if (j.ExportSpecifier.check(specifier)) {
                // Use exported name (the 'as' name if present, otherwise local name)
                const exportedName = specifier.exported;
                if (j.Identifier.check(exportedName)) {
                  result.exports.add(exportedName.name);
                }
              }
            });
          }
        }
        // Handle ExportDefaultDeclaration
        else if (j.ExportDefaultDeclaration.check(node)) {
          const declaration = node.declaration;

          // export default Identifier
          if (j.Identifier.check(declaration)) {
            result.defaultExport = declaration.name;
          }
          // export default function foo() {} or export default function() {}
          else if (j.FunctionDeclaration.check(declaration)) {
            result.defaultExport = declaration.id?.name || '<anonymous>';
          }
          // export default class Foo {} or export default class {}
          else if (j.ClassDeclaration.check(declaration)) {
            result.defaultExport = declaration.id?.name || '<anonymous>';
          }
          // Other default exports (expressions, etc.)
          else {
            result.defaultExport = '<default>';
          }
        }
      });

    // Cache the result
    indexExportsCache.set(indexPath, result);
    return result;
  } catch {
    // If parsing fails, cache empty result
    indexExportsCache.set(indexPath, result);
    return result;
  }
}

/**
 * Clears the index exports cache.
 * Should be called when starting a new move operation or when files are modified.
 */
export function clearIndexExportsCache(): void {
  indexExportsCache.clear();
}

/**
 * Invalidates cache entry for a specific file.
 * Should be called after modifying an index file.
 */
export function invalidateIndexExportsCache(indexPath: string): void {
  indexExportsCache.delete(indexPath);
}
