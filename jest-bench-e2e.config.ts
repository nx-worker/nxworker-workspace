export default {
  displayName: 'e2e-benchmarks',
  testEnvironment: 'jest-bench/environment',
  testEnvironmentOptions: {
    testEnvironment: 'node',
  },
  reporters: [
    'default',
    [
      'jest-bench/reporter',
      {
        withOpsPerSecond: true,
      },
    ],
  ],
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
  // E2E benchmarks need longer timeout for workspace setup
  testTimeout: 600000, // 10 minutes
  // Start and stop local Verdaccio registry for e2e benchmarks
  globalSetup: './tools/scripts/start-local-registry.ts',
  globalTeardown: './tools/scripts/stop-local-registry.ts',
};
