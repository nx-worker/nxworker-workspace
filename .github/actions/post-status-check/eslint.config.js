const baseConfig = require('../../../eslint.config.js');

module.exports = [
  ...baseConfig,
  {
    files: ['**/*.spec.js', '**/*.test.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        jest: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        require: 'readonly',
        module: 'readonly',
        process: 'readonly',
      },
    },
  },
];
