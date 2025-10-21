export default {
  displayName: 'benchmarks',
  testEnvironment: 'node',
  reporters: ['default'],
  testMatch: ['<rootDir>/packages/**/benchmarks/**/*.bench.ts'],
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
  transformIgnorePatterns: ['node_modules/(?!(tinybench)/)'],
};
