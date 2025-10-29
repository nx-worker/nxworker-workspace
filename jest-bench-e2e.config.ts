export default {
  displayName: 'e2e-benchmarks',
  testEnvironment: 'node',
  reporters: ['default'],
  testMatch: ['<rootDir>/packages/workspace-e2e/src/**/*.bench.ts'],
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
  // Increase timeout for e2e benchmarks
  testTimeout: 600000, // 10 minutes
  // Global setup/teardown to start/stop local registry and publish package
  globalSetup: '<rootDir>/tools/scripts/start-local-registry.ts',
  globalTeardown: '<rootDir>/tools/scripts/stop-local-registry.ts',
};
