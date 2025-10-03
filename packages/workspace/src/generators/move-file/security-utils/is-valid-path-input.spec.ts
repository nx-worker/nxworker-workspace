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
});
