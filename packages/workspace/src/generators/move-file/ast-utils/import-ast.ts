/**
 * AST-based utilities for detecting and updating imports in TypeScript/JavaScript files
 *
 * Note: AST parsing is more accurate than regex but has higher overhead.
 * For optimal performance:
 * - Cache source files when processing multiple operations on the same file
 * - Use batched operations when possible
 * - Consider regex for simple one-off checks if performance is critical
 */

import * as ts from 'typescript';
import { createHash } from 'node:crypto';

/**
 * Cache for parsed source files to avoid re-parsing
 * Key: file path + source code hash
 */
const sourceFileCache = new Map<string, ts.SourceFile>();

/**
 * Hash function for cache keys using Node.js crypto module
 */
function hashCode(str: string): string {
  return createHash('sha256').update(str).digest('hex');
}

/**
 * Represents an import statement found in the source code
 */
export interface ImportStatement {
  /** The module specifier (the string in quotes) */
  moduleSpecifier: string;
  /** Type of import */
  type: 'import' | 'dynamic-import' | 'require' | 'export';
  /** Start position in the source file */
  start: number;
  /** End position in the source file */
  end: number;
  /** Start position of the module specifier string (including quotes) */
  specifierStart: number;
  /** End position of the module specifier string (including quotes) */
  specifierEnd: number;
}

/**
 * Parses a source file and finds all import/require statements
 * Uses caching to avoid re-parsing the same file
 */
export function findImports(
  sourceCode: string,
  filePath: string,
): ImportStatement[] {
  const cacheKey = `${filePath}:${hashCode(sourceCode)}`;

  let sourceFile = sourceFileCache.get(cacheKey);
  if (!sourceFile) {
    sourceFile = ts.createSourceFile(
      filePath,
      sourceCode,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith('.tsx') || filePath.endsWith('.jsx')
        ? ts.ScriptKind.TSX
        : filePath.endsWith('.ts') ||
            filePath.endsWith('.mts') ||
            filePath.endsWith('.cts')
          ? ts.ScriptKind.TS
          : ts.ScriptKind.JS,
    );
    sourceFileCache.set(cacheKey, sourceFile);
  }

  const imports: ImportStatement[] = [];

  function visit(node: ts.Node) {
    // Import declarations: import { x } from 'module'
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (
        ts.isStringLiteral(moduleSpecifier) ||
        ts.isNoSubstitutionTemplateLiteral(moduleSpecifier)
      ) {
        imports.push({
          moduleSpecifier: moduleSpecifier.text,
          type: 'import',
          start: node.getStart(sourceFile),
          end: node.getEnd(),
          specifierStart: moduleSpecifier.getStart(sourceFile),
          specifierEnd: moduleSpecifier.getEnd(),
        });
      }
    }
    // Export declarations: export { x } from 'module'
    else if (ts.isExportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (
        moduleSpecifier &&
        (ts.isStringLiteral(moduleSpecifier) ||
          ts.isNoSubstitutionTemplateLiteral(moduleSpecifier))
      ) {
        imports.push({
          moduleSpecifier: moduleSpecifier.text,
          type: 'export',
          start: node.getStart(sourceFile),
          end: node.getEnd(),
          specifierStart: moduleSpecifier.getStart(sourceFile),
          specifierEnd: moduleSpecifier.getEnd(),
        });
      }
    }
    // Dynamic imports: import('module')
    else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        if (
          arg &&
          (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))
        ) {
          imports.push({
            moduleSpecifier: arg.text,
            type: 'dynamic-import',
            start: node.getStart(sourceFile),
            end: node.getEnd(),
            specifierStart: arg.getStart(sourceFile),
            specifierEnd: arg.getEnd(),
          });
        }
      }
      // require() calls
      else if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require'
      ) {
        const arg = node.arguments[0];
        if (
          arg &&
          (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))
        ) {
          imports.push({
            moduleSpecifier: arg.text,
            type: 'require',
            start: node.getStart(sourceFile),
            end: node.getEnd(),
            specifierStart: arg.getStart(sourceFile),
            specifierEnd: arg.getEnd(),
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return imports;
}

/**
 * Checks if a file has imports matching the given path
 */
export function hasImportToPath(
  sourceCode: string,
  filePath: string,
  targetPath: string,
): boolean {
  const imports = findImports(sourceCode, filePath);
  return imports.some((imp) => imp.moduleSpecifier === targetPath);
}

/**
 * Updates import statements in the source code
 *
 * @param sourceCode - The source code to update
 * @param filePath - Path to the file (used for parsing context)
 * @param replacements - Map of old module specifier to new module specifier
 * @returns Updated source code or null if no changes were made
 */
export function updateImports(
  sourceCode: string,
  filePath: string,
  replacements: Map<string, string>,
): string | null {
  if (replacements.size === 0) {
    return null;
  }

  const imports = findImports(sourceCode, filePath);

  // Filter to only imports that need updating
  const importsToUpdate = imports.filter((imp) =>
    replacements.has(imp.moduleSpecifier),
  );

  if (importsToUpdate.length === 0) {
    return null;
  }

  // Sort by position (descending) to update from end to start
  // This ensures positions remain valid as we make edits
  importsToUpdate.sort((a, b) => b.specifierStart - a.specifierStart);

  let updatedCode = sourceCode;

  for (const imp of importsToUpdate) {
    const newSpecifier = replacements.get(imp.moduleSpecifier);
    if (!newSpecifier) continue;

    // Replace just the text content of the string literal
    // The positions include the quotes, so we need to preserve them
    const quote = sourceCode[imp.specifierStart];
    const before = updatedCode.substring(0, imp.specifierStart);
    const after = updatedCode.substring(imp.specifierEnd);
    updatedCode = before + quote + newSpecifier + quote + after;
  }

  return updatedCode;
}

/**
 * Clears the source file cache
 * Call this periodically to free memory if processing many files
 */
export function clearCache(): void {
  sourceFileCache.clear();
}

/**
 * Updates imports matching a pattern (for relative imports)
 *
 * @param sourceCode - The source code to update
 * @param filePath - Path to the file (used for parsing context)
 * @param matcher - Function that returns new specifier if import should be updated
 * @returns Updated source code or null if no changes were made
 */
export function updateImportsMatching(
  sourceCode: string,
  filePath: string,
  matcher: (moduleSpecifier: string) => string | null,
): string | null {
  const imports = findImports(sourceCode, filePath);

  // Build replacements map
  const replacements = new Map<string, string>();
  for (const imp of imports) {
    const newSpecifier = matcher(imp.moduleSpecifier);
    if (newSpecifier !== null && newSpecifier !== imp.moduleSpecifier) {
      replacements.set(imp.moduleSpecifier, newSpecifier);
    }
  }

  if (replacements.size === 0) {
    return null;
  }

  return updateImports(sourceCode, filePath, replacements);
}
