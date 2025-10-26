export default {
  displayName: 'e2e-benchmarks',
  testEnvironment: 'node',
  reporters: ['default'],
  testMatch: ['<rootDir>/packages/workspace-e2e/src/benchmarks/**/*.bench.ts'],
  transform: {
    '^.+\\.[tj]s$': [
      '@swc/jest',
      {
        swcrc: false,
        jsc: {
          parser: {
            syntax: 'typescript',
            decorators: true,
          },
          target: 'es2022',
          transform: {
            decoratorMetadata: true,
          },
        },
        sourceMaps: 'inline',
        module: {
          type: 'commonjs',
        },
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: './coverage/e2e-benchmarks',
  transformIgnorePatterns: ['node_modules/(?!(tinybench)/)'],
  globalSetup: '<rootDir>/tools/scripts/start-local-registry.ts',
  globalTeardown: '<rootDir>/tools/scripts/stop-local-registry.ts',
};
