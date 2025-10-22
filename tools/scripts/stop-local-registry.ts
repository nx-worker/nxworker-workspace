/**
 * This script stops the local registry for e2e testing purposes.
 * It is meant to be called in jest's globalTeardown.
 */

interface StopLocalRegistry {
  stopLocalRegistry?: () => void;
}

export default () => {
  if ((global as StopLocalRegistry).stopLocalRegistry) {
    (global as StopLocalRegistry).stopLocalRegistry?.();
  }
};
