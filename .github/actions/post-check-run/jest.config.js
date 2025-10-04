module.exports = {
  displayName: 'github-actions-post-check-run',
  testMatch: ['<rootDir>/src/**/*.spec.js'],
  testEnvironment: 'node',
  transform: {},
  moduleFileExtensions: ['js'],
  collectCoverageFrom: ['src/**/*.js', '!src/**/*.spec.js'],
};
