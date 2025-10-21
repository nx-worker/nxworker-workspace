const baseConfig = require('../../eslint.config.js');

module.exports = [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs}',
            '{projectRoot}/**/*.bench.ts',
          ],
        },
      ],
    },
    languageOptions: {
      parser: require('jsonc-eslint-parser'),
    },
  },
  {
    files: ['**/package.json', '**/generators.json'],
    rules: {
      '@nx/nx-plugin-checks': 'error',
    },
    languageOptions: {
      parser: require('jsonc-eslint-parser'),
    },
  },
  {
    // Benchmark files can import from tools directory
    files: ['**/*.bench.ts'],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
    },
  },
];
