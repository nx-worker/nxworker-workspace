export default {
  displayName: 'workspace-e2e',
  preset: '../../jest.preset.js',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/packages/workspace-e2e',
  // Exclude benchmark files from e2e tests - they run separately via e2e-benchmark target
  testPathIgnorePatterns: ['\\.bench\\.ts$'],
  globalSetup: '../../tools/scripts/start-local-registry.ts',
  globalTeardown: '../../tools/scripts/stop-local-registry.ts',
};
