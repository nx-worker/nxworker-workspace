export default {
  displayName: 'e2e-util',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': '@swc/jest',
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/packages/e2e-util',
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/e2e-util/'],
};
