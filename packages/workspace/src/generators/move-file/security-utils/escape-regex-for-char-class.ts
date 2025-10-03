import { escapeRegex } from './escape-regex';

/**
 * Escape a string for use inside a regular expression character class.
 * Inside a character class, a hyphen (`-`) creates ranges, so it must be escaped.
 * This function builds on `escapeRegex` and additionally escapes the hyphen
 * using a safe `\x2d` escape which can't be interpreted as a range.
 */
export function escapeRegexForCharClass(str: string): string {
  // First perform the general escaping
  const base = escapeRegex(str);

  // Then escape hyphen for character-class contexts. We use \x2d to avoid
  // introducing ambiguity when inserted inside `[...]`.
  return base.replace(/-/g, '\\x2d');
}
