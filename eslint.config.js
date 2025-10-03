const nx = require('@nx/eslint-plugin');
const esxPlugin = require('eslint-plugin-es-x');
const nPlugin = require('eslint-plugin-n');

module.exports = [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
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
    plugins: {
      'es-x': esxPlugin,
      n: nPlugin,
    },
    rules: {
      // Enforce node: protocol for built-in modules (supported in Node.js 18+)
      'n/prefer-node-protocol': 'error',
      // Ban Node.js 22+ features not available in Node.js 18
      // RegExp Unicode Sets + /v flag (Node 22+)
      'es-x/no-regexp-v-flag': 'error',
      // Promise.withResolvers (Node 22+)
      'es-x/no-promise-withresolvers': 'error',
      // Array copy-by-value methods (Node 20+, uncertain in all Node 18.x)
      'es-x/no-array-prototype-toreversed': 'error',
      'es-x/no-array-prototype-tosorted': 'error',
      'es-x/no-array-prototype-tospliced': 'error',
      'es-x/no-array-prototype-with': 'error',
      // Array findLast / findLastIndex (Node 20+)
      'es-x/no-array-prototype-findlast-findlastindex': 'error',
      // Iterator helpers (Experimental, Node 22+/24)
      'es-x/no-iterator-prototype-map': 'error',
      'es-x/no-iterator-prototype-filter': 'error',
      'es-x/no-iterator-prototype-take': 'error',
      'es-x/no-iterator-prototype-drop': 'error',
      'es-x/no-iterator-prototype-flatmap': 'error',
      'es-x/no-iterator-prototype-foreach': 'error',
      'es-x/no-iterator-prototype-reduce': 'error',
      'es-x/no-iterator-prototype-toarray': 'error',
      'es-x/no-iterator-prototype-some': 'error',
      'es-x/no-iterator-prototype-every': 'error',
      'es-x/no-iterator-prototype-find': 'error',
      // Set methods (Experimental, Stage 3)
      'es-x/no-set-prototype-union': 'error',
      'es-x/no-set-prototype-intersection': 'error',
      'es-x/no-set-prototype-difference': 'error',
      'es-x/no-set-prototype-symmetricdifference': 'error',
      'es-x/no-set-prototype-issubsetof': 'error',
      'es-x/no-set-prototype-issupersetof': 'error',
      'es-x/no-set-prototype-isdisjointfrom': 'error',
    },
  },
  {
    files: ['**/*.json'],
    // Override or add rules here
    rules: {},
    languageOptions: { parser: require('jsonc-eslint-parser') },
  },
];
