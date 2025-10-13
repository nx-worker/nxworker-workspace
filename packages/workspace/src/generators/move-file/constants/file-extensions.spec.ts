import {
  entrypointExtensions,
  primaryEntryBaseNames,
  sourceFileExtensions,
  strippableExtensions,
} from './file-extensions';

describe('file-extensions', () => {
  describe('entrypointExtensions', () => {
    it('should be frozen', () => {
      expect(Object.isFrozen(entrypointExtensions)).toBe(true);
    });

    it('should contain TypeScript extensions', () => {
      expect(entrypointExtensions).toContain('ts');
      expect(entrypointExtensions).toContain('mts');
      expect(entrypointExtensions).toContain('cts');
      expect(entrypointExtensions).toContain('tsx');
    });

    it('should contain JavaScript extensions', () => {
      expect(entrypointExtensions).toContain('js');
      expect(entrypointExtensions).toContain('mjs');
      expect(entrypointExtensions).toContain('cjs');
      expect(entrypointExtensions).toContain('jsx');
    });

    it('should have exactly 8 extensions', () => {
      expect(entrypointExtensions.length).toBe(8);
    });
  });

  describe('primaryEntryBaseNames', () => {
    it('should be frozen', () => {
      expect(Object.isFrozen(primaryEntryBaseNames)).toBe(true);
    });

    it('should contain standard entry point names', () => {
      expect(primaryEntryBaseNames).toContain('index');
      expect(primaryEntryBaseNames).toContain('public-api');
    });

    it('should have exactly 2 base names', () => {
      expect(primaryEntryBaseNames.length).toBe(2);
    });
  });

  describe('sourceFileExtensions', () => {
    it('should be frozen', () => {
      expect(Object.isFrozen(sourceFileExtensions)).toBe(true);
    });

    it('should contain TypeScript extensions with dots', () => {
      expect(sourceFileExtensions).toContain('.ts');
      expect(sourceFileExtensions).toContain('.tsx');
      expect(sourceFileExtensions).toContain('.mts');
      expect(sourceFileExtensions).toContain('.cts');
    });

    it('should contain JavaScript extensions with dots', () => {
      expect(sourceFileExtensions).toContain('.js');
      expect(sourceFileExtensions).toContain('.jsx');
      expect(sourceFileExtensions).toContain('.mjs');
      expect(sourceFileExtensions).toContain('.cjs');
    });

    it('should have exactly 8 extensions', () => {
      expect(sourceFileExtensions.length).toBe(8);
    });

    it('should all start with a dot', () => {
      sourceFileExtensions.forEach((ext) => {
        expect(ext.startsWith('.')).toBe(true);
      });
    });
  });

  describe('strippableExtensions', () => {
    it('should be frozen', () => {
      expect(Object.isFrozen(strippableExtensions)).toBe(true);
    });

    it('should contain only non-ESM extensions', () => {
      expect(strippableExtensions).toContain('.ts');
      expect(strippableExtensions).toContain('.tsx');
      expect(strippableExtensions).toContain('.js');
      expect(strippableExtensions).toContain('.jsx');
    });

    it('should NOT contain ESM-specific extensions', () => {
      expect(strippableExtensions).not.toContain('.mjs');
      expect(strippableExtensions).not.toContain('.mts');
      expect(strippableExtensions).not.toContain('.cjs');
      expect(strippableExtensions).not.toContain('.cts');
    });

    it('should have exactly 4 extensions', () => {
      expect(strippableExtensions.length).toBe(4);
    });

    it('should all start with a dot', () => {
      strippableExtensions.forEach((ext) => {
        expect(ext.startsWith('.')).toBe(true);
      });
    });
  });

  describe('relationship between constants', () => {
    it('should have entrypointExtensions without dots', () => {
      entrypointExtensions.forEach((ext) => {
        expect(ext.startsWith('.')).toBe(false);
      });
    });

    it('should have sourceFileExtensions with dots', () => {
      sourceFileExtensions.forEach((ext) => {
        expect(ext.startsWith('.')).toBe(true);
      });
    });

    it('should have strippableExtensions be a subset of sourceFileExtensions', () => {
      strippableExtensions.forEach((ext) => {
        expect(sourceFileExtensions).toContain(ext);
      });
    });
  });
});
