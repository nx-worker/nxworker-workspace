const nxPreset = require('@nx/jest/preset').default;

module.exports = {
  ...nxPreset,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};
