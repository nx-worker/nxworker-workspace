const nxPreset = require('@nx/jest/preset').default;

module.exports = {
  ...nxPreset,
  clearMocks: true,
  resetMocks: true,
  resetModules: true,
  restoreMocks: true,
  reporters: process.env.GITHUB_ACTIONS
    ? ['default', 'github-actions']
    : undefined,
};
