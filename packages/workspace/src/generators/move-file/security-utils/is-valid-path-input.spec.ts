import { isValidPathInput } from './is-valid-path-input';

describe('isValidPathInput', () => {
  it('allows ASCII filenames by default', () => {
    expect(isValidPathInput('file-name_01.ts', {})).toBe(true);
  });

  it('rejects disallowed characters by default', () => {
    expect(isValidPathInput('bad|name.ts', {})).toBe(false);
  });

  it('accepts unicode when allowUnicode is true', () => {
    expect(isValidPathInput('файл.ts', { allowUnicode: true })).toBe(true);
  });

  describe('platform-specific characters', () => {
    it('allows backslash on Windows, rejects on Unix', () => {
      const result = isValidPathInput('path\\to\\file.ts', {});
      if (process.platform === 'win32') {
        expect(result).toBe(true);
      } else {
        expect(result).toBe(false);
      }
    });

    it('allows angle brackets and colon on Unix, rejects on Windows', () => {
      const result = isValidPathInput('file<>:test.ts', {});
      if (process.platform === 'win32') {
        expect(result).toBe(false);
      } else {
        expect(result).toBe(true);
      }
    });
  });

  describe('shell metacharacters', () => {
    it('should reject pipe character |', () => {
      expect(isValidPathInput('file|name.ts', {})).toBe(false);
    });

    it('should reject question mark ? by default', () => {
      expect(isValidPathInput('file?.ts', {})).toBe(false);
    });

    it('should reject asterisk * by default', () => {
      expect(isValidPathInput('file*.ts', {})).toBe(false);
    });

    it('should reject double quote "', () => {
      expect(isValidPathInput('file"name.ts', {})).toBe(false);
    });
  });

  describe('glob pattern support', () => {
    it('should allow asterisk when allowGlobPatterns is true', () => {
      expect(isValidPathInput('file*.ts', { allowGlobPatterns: true })).toBe(
        true,
      );
    });

    it('should allow question mark when allowGlobPatterns is true', () => {
      expect(isValidPathInput('file?.ts', { allowGlobPatterns: true })).toBe(
        true,
      );
    });

    it('should allow square brackets when allowGlobPatterns is true', () => {
      expect(
        isValidPathInput('file[abc].ts', { allowGlobPatterns: true }),
      ).toBe(true);
    });

    it('should allow curly braces when allowGlobPatterns is true', () => {
      expect(
        isValidPathInput('file.{ts,js}', { allowGlobPatterns: true }),
      ).toBe(true);
    });

    it('should allow complex glob patterns', () => {
      expect(
        isValidPathInput('packages/**/*.spec.ts', { allowGlobPatterns: true }),
      ).toBe(true);
    });

    it('should still reject pipe character even with allowGlobPatterns', () => {
      expect(
        isValidPathInput('file|name.ts', { allowGlobPatterns: true }),
      ).toBe(false);
    });

    it('should still reject double quotes even with allowGlobPatterns', () => {
      expect(
        isValidPathInput('file"name.ts', { allowGlobPatterns: true }),
      ).toBe(false);
    });
  });
});
