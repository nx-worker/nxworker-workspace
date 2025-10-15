export default {
  displayName: 'benchmarks',
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
  testMatch: ['<rootDir>/packages/**/benchmarks/**/*.bench.spec.ts'],
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
  coverageDirectory: './coverage/benchmarks',
};
