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

    it('should reject backslash \\', () => {
      expect(isValidPathInput('file\\name.ts', {})).toBe(false);
    });
  });
});
