import { escapeRegexForCharClass } from './escape-regex-for-char-class';

describe('escapeRegexForCharClass', () => {
  it('escapes hyphen inside char class', () => {
    expect(escapeRegexForCharClass('a-b')).toContain('\\x2d');
  });

  it('keeps other escapes intact', () => {
    const escaped = escapeRegexForCharClass('file?.ts');
    expect(escaped).toContain('\\?');
  });
});
