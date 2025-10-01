const nx = require('@nx/eslint-plugin');

// Helper to ensure TS/JS rules only apply to TS/JS files, not JSON files
const tsJsFiles = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'];
const addFilesFilter = (configs, files) =>
  configs.map((config) =>
    !config.files && (config.rules || config.languageOptions?.parser)
      ? { ...config, files }
      : config,
  );

module.exports = [
  ...nx.configs['flat/base'],
  ...addFilesFilter(nx.configs['flat/typescript'], tsJsFiles),
  ...addFilesFilter(nx.configs['flat/javascript'], tsJsFiles),
  {
    ignores: ['**/dist'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?js$'],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    // Override or add rules here
    rules: {},
  },
];
