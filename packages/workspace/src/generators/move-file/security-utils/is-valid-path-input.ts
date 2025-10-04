import escapeRegexp from 'core-js-pure/stable/regexp/escape';

export interface PathValidationOptions {
  allowUnicode?: boolean;
  maxLength?: number;
  additionalAllowedChars?: string;
}

/**
 * Characters that are valid in Unix filenames but not on Windows.
 * These should only be allowed when not running on Windows.
 * - < (less than)
 * - > (greater than)
 * - : (colon)
 */
const UNIX_ONLY_CHARS = '<>:';

/**
 * Backslash is the path separator on Windows but not valid in filenames on Unix.
 * It should only be allowed as input on Windows platforms.
 */
const WINDOWS_ONLY_CHARS = '\\';

/**
 * Validate user input intended to be used as a literal file/path fragment using
 * a whitelist approach. The default configuration allows ASCII alphanumerics
 * plus a small set of safe punctuation, but callers can opt into
 * internationalized filenames, length limits, or extra literal characters.
 *
 * Prefer invoking this before interpolating user input into generated regexes
 * or other sensitive contexts. Adjust the options to suit your project's
 * filename/path conventions. Set `allowUnicode: true` to accept
 * international characters.
 */
export function isValidPathInput(
  str: string,
  options: PathValidationOptions,
): boolean {
  const {
    allowUnicode = false,
    maxLength,
    additionalAllowedChars = '',
  } = options || {};

  if (typeof str !== 'string') {
    return false;
  }

  if (typeof maxLength === 'number' && str.length > maxLength) {
    return false;
  }

  // Only allow Unix-specific characters on non-Windows platforms
  const unixChars = process.platform === 'win32' ? '' : UNIX_ONLY_CHARS;
  // Only allow backslash on Windows platforms
  const windowsChars = process.platform === 'win32' ? WINDOWS_ONLY_CHARS : '';

  let pathRegex: RegExp;

  if (allowUnicode) {
    const unicodePathPattern = `^[\\p{L}\\p{N}\\p{M}\\p{Pc}@./${escapeRegexp(windowsChars)}${escapeRegexp(unixChars)} ${escapeRegexp(additionalAllowedChars)}-]*$`;
    pathRegex = new RegExp(unicodePathPattern, 'u');
  } else {
    const asciiPathPattern = `^[A-Za-z0-9_@./${escapeRegexp(windowsChars)}${escapeRegexp(unixChars)} ${escapeRegexp(additionalAllowedChars)}-]*$`;
    pathRegex = new RegExp(asciiPathPattern);
  }

  return pathRegex.test(str);
}
