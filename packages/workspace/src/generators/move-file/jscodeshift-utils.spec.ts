import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import {
  updateImportSpecifier,
  updateImportSpecifierPattern,
  hasImportSpecifier,
} from './jscodeshift-utils';

describe('jscodeshift-utils', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  describe('updateImportSpecifier', () => {
    it('should update static imports', () => {
      const filePath = 'test.ts';
      tree.write(
        filePath,
        `import { foo } from './old-path';\nexport const bar = foo;`,
      );

      const result = updateImportSpecifier(
        tree,
        filePath,
        './old-path',
        './new-path',
      );

      expect(result).toBe(true);
      const content = tree.read(filePath, 'utf-8');
      expect(content).toContain(`from './new-path'`);
    });

    it('should update dynamic imports', () => {
      const filePath = 'test.ts';
      tree.write(
        filePath,
        `const module = import('./old-path');\nexport default module;`,
      );

      const result = updateImportSpecifier(
        tree,
        filePath,
        './old-path',
        './new-path',
      );

      expect(result).toBe(true);
      const content = tree.read(filePath, 'utf-8');
      expect(content).toContain(`import('./new-path')`);
    });

    it('should update require calls', () => {
      const filePath = 'test.js';
      tree.write(
        filePath,
        `const module = require('./old-path');\nmodule.exports = module;`,
      );

      const result = updateImportSpecifier(
        tree,
        filePath,
        './old-path',
        './new-path',
      );

      expect(result).toBe(true);
      const content = tree.read(filePath, 'utf-8');
      expect(content).toContain(`require('./new-path')`);
    });

    it('should update module.exports with require', () => {
      const filePath = 'test.js';
      tree.write(filePath, `module.exports = require('./old-path');`);

      const result = updateImportSpecifier(
        tree,
        filePath,
        './old-path',
        './new-path',
      );

      expect(result).toBe(true);
      const content = tree.read(filePath, 'utf-8');
      expect(content).toContain(`require('./new-path')`);
    });

    it('should update exports with require', () => {
      const filePath = 'test.js';
      tree.write(filePath, `exports.foo = require('./old-path');`);

      const result = updateImportSpecifier(
        tree,
        filePath,
        './old-path',
        './new-path',
      );

      expect(result).toBe(true);
      const content = tree.read(filePath, 'utf-8');
      expect(content).toContain(`require('./new-path')`);
    });

    it('should update require.resolve calls', () => {
      const filePath = 'test.js';
      tree.write(filePath, `const path = require.resolve('./old-path');`);

      const result = updateImportSpecifier(
        tree,
        filePath,
        './old-path',
        './new-path',
      );

      expect(result).toBe(true);
      const content = tree.read(filePath, 'utf-8');
      expect(content).toContain(`require.resolve('./new-path')`);
    });

    it('should update export from statements', () => {
      const filePath = 'test.ts';
      tree.write(filePath, `export { foo } from './old-path';`);

      const result = updateImportSpecifier(
        tree,
        filePath,
        './old-path',
        './new-path',
      );

      expect(result).toBe(true);
      const content = tree.read(filePath, 'utf-8');
      expect(content).toContain(`from './new-path'`);
    });

    it('should return false when no changes are made', () => {
      const filePath = 'test.ts';
      tree.write(
        filePath,
        `import { foo } from './different-path';\nexport const bar = foo;`,
      );

      const result = updateImportSpecifier(
        tree,
        filePath,
        './old-path',
        './new-path',
      );

      expect(result).toBe(false);
    });

    it('should handle empty files gracefully', () => {
      const filePath = 'test.ts';
      tree.write(filePath, '');

      const result = updateImportSpecifier(
        tree,
        filePath,
        './old-path',
        './new-path',
      );

      expect(result).toBe(false);
    });

    it('should preserve single quotes', () => {
      const filePath = 'test.ts';
      tree.write(
        filePath,
        `import { foo } from './old-path';\nexport const bar = foo;`,
      );

      updateImportSpecifier(tree, filePath, './old-path', './new-path');

      const content = tree.read(filePath, 'utf-8');
      expect(content).toContain(`from './new-path'`);
      expect(content).not.toContain(`from "./new-path"`);
    });

    it('should preserve double quotes', () => {
      const filePath = 'test.ts';
      tree.write(
        filePath,
        `import { foo } from "./old-path";\nexport const bar = foo;`,
      );

      updateImportSpecifier(tree, filePath, './old-path', './new-path');

      const content = tree.read(filePath, 'utf-8');
      expect(content).toContain(`from "./new-path"`);
      expect(content).not.toContain(`from './new-path'`);
    });

    it('should preserve double quotes in require statements', () => {
      const filePath = 'test.js';
      tree.write(
        filePath,
        `const module = require("./old-path");\nmodule.exports = module;`,
      );

      updateImportSpecifier(tree, filePath, './old-path', './new-path');

      const content = tree.read(filePath, 'utf-8');
      expect(content).toContain(`require("./new-path")`);
      expect(content).not.toContain(`require('./new-path')`);
    });

    it('should default to single quotes when quotes are mixed equally', () => {
      const filePath = 'test.ts';
      tree.write(
        filePath,
        `import { foo } from './old-path';\nimport { baz } from "./other-path";\nexport const bar = foo;`,
      );

      updateImportSpecifier(tree, filePath, './old-path', './new-path');

      const content = tree.read(filePath, 'utf-8');
      // Should use single quotes as default when counts are equal
      expect(content).toContain(`from './new-path'`);
    });

    it('should use double quotes when they are predominant', () => {
      const filePath = 'test.ts';
      tree.write(
        filePath,
        `import { foo } from "./old-path";\nimport { bar } from "./another-path";\nimport { baz } from './third-path';\nexport const result = foo + bar;`,
      );

      updateImportSpecifier(tree, filePath, './old-path', './new-path');

      const content = tree.read(filePath, 'utf-8');
      // Should use double quotes because 2 double > 1 single
      expect(content).toContain(`from "./new-path"`);
    });
  });

  describe('updateImportSpecifierPattern', () => {
    it('should update imports matching a pattern', () => {
      const filePath = 'test.ts';
      tree.write(
        filePath,
        `import { foo } from './utils/helper';\nimport { bar } from '../shared/component';\nexport const baz = foo + bar;`,
      );

      const result = updateImportSpecifierPattern(
        tree,
        filePath,
        (specifier) => specifier.startsWith('.'),
        (oldPath) => {
          const fileName = oldPath.split('/').pop();
          return `@lib/${fileName}`;
        },
      );

      expect(result).toBe(true);
      const content = tree.read(filePath, 'utf-8');
      expect(content).toContain(`from '@lib/helper'`);
      expect(content).toContain(`from '@lib/component'`);
    });

    it('should not update imports that do not match the pattern', () => {
      const filePath = 'test.ts';
      tree.write(
        filePath,
        `import { foo } from '@nx/devkit';\nimport { bar } from './local';\nexport const baz = foo + bar;`,
      );

      const result = updateImportSpecifierPattern(
        tree,
        filePath,
        (specifier) => specifier.startsWith('./'),
        (oldPath) => oldPath.replace('./', '../'),
      );

      expect(result).toBe(true);
      const content = tree.read(filePath, 'utf-8');
      expect(content).toContain(`from '@nx/devkit'`);
      expect(content).toContain(`from '../local'`);
    });

    it('should preserve double quotes in pattern updates', () => {
      const filePath = 'test.ts';
      tree.write(
        filePath,
        `import { foo } from "./utils/helper";\nimport { bar } from "../shared/component";\nexport const baz = foo + bar;`,
      );

      const result = updateImportSpecifierPattern(
        tree,
        filePath,
        (specifier) => specifier.startsWith('.'),
        (oldPath) => {
          const fileName = oldPath.split('/').pop();
          return `@lib/${fileName}`;
        },
      );

      expect(result).toBe(true);
      const content = tree.read(filePath, 'utf-8');
      expect(content).toContain(`from "@lib/helper"`);
      expect(content).toContain(`from "@lib/component"`);
    });
  });

  describe('hasImportSpecifier', () => {
    it('should return true for static imports', () => {
      const filePath = 'test.ts';
      tree.write(
        filePath,
        `import { foo } from './path';\nexport const bar = foo;`,
      );

      const result = hasImportSpecifier(tree, filePath, './path');

      expect(result).toBe(true);
    });

    it('should return true for dynamic imports', () => {
      const filePath = 'test.ts';
      tree.write(filePath, `const module = import('./path');`);

      const result = hasImportSpecifier(tree, filePath, './path');

      expect(result).toBe(true);
    });

    it('should return true for require calls', () => {
      const filePath = 'test.js';
      tree.write(filePath, `const module = require('./path');`);

      const result = hasImportSpecifier(tree, filePath, './path');

      expect(result).toBe(true);
    });

    it('should return true for require.resolve calls', () => {
      const filePath = 'test.js';
      tree.write(filePath, `const path = require.resolve('./path');`);

      const result = hasImportSpecifier(tree, filePath, './path');

      expect(result).toBe(true);
    });

    it('should return true for export from statements', () => {
      const filePath = 'test.ts';
      tree.write(filePath, `export { foo } from './path';`);

      const result = hasImportSpecifier(tree, filePath, './path');

      expect(result).toBe(true);
    });

    it('should return false when import does not exist', () => {
      const filePath = 'test.ts';
      tree.write(
        filePath,
        `import { foo } from './other-path';\nexport const bar = foo;`,
      );

      const result = hasImportSpecifier(tree, filePath, './path');

      expect(result).toBe(false);
    });

    it('should handle empty files gracefully', () => {
      const filePath = 'test.ts';
      tree.write(filePath, '');

      const result = hasImportSpecifier(tree, filePath, './path');

      expect(result).toBe(false);
    });
  });
});
