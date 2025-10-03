# workspace

This library was generated with [Nx](https://nx.dev).

## Building

Run `nx build workspace` to build the library.

## Running unit tests

Run `nx test workspace` to execute the unit tests via [Jest](https://jestjs.io).

## Generators

This package exposes a generator `move-file` which moves a file between projects and updates import paths across the workspace. See the generator README for full usage: `packages/workspace/src/generators/move-file/README.md`.

Notable option:

- `--allowUnicode` (boolean, default: `false`): allow Unicode characters in the `from` and `to` paths (less restrictive; use with caution).
