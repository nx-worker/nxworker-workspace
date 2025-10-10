/**
 * Worker thread for checking imports in file content.
 * This enables true parallel processing for CPU-bound AST parsing operations.
 *
 * This worker receives file content and checks if it contains specific imports.
 * It doesn't use the Tree API, instead working directly with file content strings.
 */
const { parentPort, workerData } = require('worker_threads');
const jscodeshift = require('jscodeshift');

const j = jscodeshift.withParser('tsx');

/**
 * Quick check if content might contain a specific specifier before expensive parsing.
 */
function mightContainSpecifier(content, specifier) {
  return content.includes(specifier);
}

/**
 * Check if file content has import specifier using jscodeshift.
 */
function hasImportSpecifierInContent(content, specifier) {
  if (!content || content.trim().length === 0) {
    return false;
  }

  // Early exit: quick string check before expensive parsing
  if (!mightContainSpecifier(content, specifier)) {
    return false;
  }

  try {
    const root = j(content);
    let found = false;

    root.find(j.Node).forEach((path) => {
      if (found) return;
      const node = path.node;

      // Check ImportDeclaration
      if (j.ImportDeclaration.check(node) && node.source.value === specifier) {
        found = true;
        return;
      }
      // Check ExportNamedDeclaration
      if (
        j.ExportNamedDeclaration.check(node) &&
        node.source?.value === specifier
      ) {
        found = true;
        return;
      }
      // Check ExportAllDeclaration
      if (
        j.ExportAllDeclaration.check(node) &&
        node.source.value === specifier
      ) {
        found = true;
        return;
      }
      // Check CallExpression for dynamic imports, require, and require.resolve
      if (j.CallExpression.check(node)) {
        const { callee, arguments: args } = node;
        if (
          args.length > 0 &&
          j.StringLiteral.check(args[0]) &&
          args[0].value === specifier
        ) {
          if (j.Import.check(callee)) {
            found = true;
            return;
          }
          if (j.Identifier.check(callee) && callee.name === 'require') {
            found = true;
            return;
          }
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
    return false;
  }
}

if (parentPort) {
  const data = workerData;

  try {
    let foundImport = false;
    let matchedFile;
    let checkedFiles = 0;

    // Check each file for imports
    for (const { path, content } of data.fileContents) {
      if (hasImportSpecifierInContent(content, data.importPath)) {
        foundImport = true;
        matchedFile = path;
        break; // Early exit when found
      }
      checkedFiles++;
    }

    const result = {
      foundImport,
      matchedFile,
      checkedFiles,
    };

    parentPort.postMessage(result);
  } catch (error) {
    parentPort.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
