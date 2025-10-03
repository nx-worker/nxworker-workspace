import { escapeRegex } from './escape-regex';

describe('escapeRegex', () => {
  it('should escape dot character', () => {
    expect(escapeRegex('file.ts')).toBe('file\\.ts');
  });

  it('should escape asterisk', () => {
    expect(escapeRegex('file*.ts')).toBe('file\\*\\.ts');
  });

  it('should not alter safe strings', () => {
    expect(escapeRegex('filename')).toBe('filename');
  });
});
