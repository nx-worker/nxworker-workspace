/**
 * Type declaration for RegExp.escape from core-js
 * @see https://github.com/tc39/proposal-regex-escaping
 */
declare global {
  interface RegExpConstructor {
    /**
     * Escapes a string for use in a regular expression.
     * This is a polyfill provided by core-js for the TC39 proposal.
     *
     * @param str - The string to escape
     * @returns The escaped string safe for use in regular expressions
     */
    escape(str: string): string;
  }
}

export {};
