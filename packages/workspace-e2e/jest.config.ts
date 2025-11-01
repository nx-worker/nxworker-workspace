import type { Config } from 'jest';

const config: Config = {
  displayName: 'workspace-e2e',
  preset: '../../jest.preset.js',
  testTimeout: 120000, // 2 minutes default timeout for e2e tests
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/packages/workspace-e2e',
  globalSetup: '../../tools/scripts/start-local-registry.ts',
  globalTeardown: '../../tools/scripts/stop-local-registry.ts',
};

export default config;
