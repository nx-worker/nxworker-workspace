const baseConfig = require('../../eslint.config.js');

module.exports = [
  ...baseConfig,
  {
    // Benchmark files can import from tools directory
    files: ['**/*.bench.ts'],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
    },
  },
];
