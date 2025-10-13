/**
 * File extension constants used throughout the move-file generator.
 * These constants define which file types are processed during moves.
 */

/**
 * File extensions that can be used for project entry points.
 * Frozen array to prevent modifications.
 */
export const entrypointExtensions = Object.freeze([
  'ts',
  'mts',
  'cts',
  'mjs',
  'cjs',
  'js',
  'tsx',
  'jsx',
] as const);

/**
 * Base names for primary entry point files.
 * These are commonly used names for the main export file in a project.
 */
export const primaryEntryBaseNames = Object.freeze([
  'public-api',
  'index',
] as const);

/**
 * File extensions for TypeScript and JavaScript source files.
 * Used for identifying files to process during import updates.
 */
export const sourceFileExtensions = Object.freeze([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.mjs',
  '.cts',
  '.cjs',
] as const);

/**
 * File extensions that should be stripped from imports.
 * ESM-specific extensions (.mjs, .mts, .cjs, .cts) are excluded as they are
 * required by the ESM specification.
 */
export const strippableExtensions = Object.freeze([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
] as const);

/**
 * Type representing valid source file extensions.
 */
export type SourceFileExtension = (typeof sourceFileExtensions)[number];

/**
 * Type representing valid strippable extensions.
 */
export type StrippableExtension = (typeof strippableExtensions)[number];

/**
 * Type representing valid entry point extensions.
 */
export type EntrypointExtension = (typeof entrypointExtensions)[number];

/**
 * Type representing valid entry point base names.
 */
export type PrimaryEntryBaseName = (typeof primaryEntryBaseNames)[number];
