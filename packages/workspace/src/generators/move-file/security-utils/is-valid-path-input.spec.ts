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

  it('allows backslash for Windows path separators', () => {
    expect(isValidPathInput('path\\to\\file.ts', {})).toBe(true);
  });

  it('allows angle brackets and colon for Unix-specific filenames', () => {
    expect(isValidPathInput('file<>:test.ts', {})).toBe(true);
  });

  describe('shell metacharacters', () => {
    it('should reject pipe character |', () => {
      expect(isValidPathInput('file|name.ts', {})).toBe(false);
    });

    it('should reject question mark ?', () => {
      expect(isValidPathInput('file?.ts', {})).toBe(false);
    });

    it('should reject asterisk *', () => {
      expect(isValidPathInput('file*.ts', {})).toBe(false);
    });

    it('should reject double quote "', () => {
      expect(isValidPathInput('file"name.ts', {})).toBe(false);
    });
  });
});
