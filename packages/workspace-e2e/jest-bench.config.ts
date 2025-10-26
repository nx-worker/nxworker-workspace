export default {
  displayName: 'workspace-e2e-benchmarks',
  testEnvironment: 'node',
  reporters: ['default'],
  testMatch: ['<rootDir>/src/benchmarks/**/*.bench.spec.ts'],
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
  coverageDirectory: './coverage/workspace-e2e-benchmarks',
  transformIgnorePatterns: ['node_modules/(?!(tinybench)/)'],
  // Use the same global setup/teardown as regular e2e tests
  globalSetup: '<rootDir>/../../tools/scripts/start-local-registry.ts',
  globalTeardown: '<rootDir>/../../tools/scripts/stop-local-registry.ts',
};
