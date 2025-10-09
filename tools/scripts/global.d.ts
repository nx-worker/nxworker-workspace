/**
 * Type declarations for Jest global setup/teardown
 */
declare global {
  var stopLocalRegistry: (() => void) | undefined;
}

export {};
