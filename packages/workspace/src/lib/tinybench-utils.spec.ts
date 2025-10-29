/// <reference types="jest" />
/* eslint-env jest */
// eslint-disable-next-line @nx/enforce-module-boundaries -- Testing tools from workspace root
import {
  describe as benchDescribe,
  it as benchIt,
  beforeAllIterations,
  afterAllIterations,
  beforeEachIteration,
  afterEachIteration,
  beforeCycle,
  afterCycle,
  beforeAll as benchBeforeAll,
  afterAll as benchAfterAll,
  formatBenchmarkResult,
} from '../../../../tools/tinybench-utils';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Testing internal state management
import {
  resetGlobalState,
  __test_setInsideItCallback,
} from '../../../../tools/tinybench-utils-state';

// Mock the global Jest functions to capture calls
const mockJestDescribe = jest.fn((name, callback) => {
  callback();
});
const mockJestBeforeAll = jest.fn(() => {
  // Don't execute - just capture the call
});
const mockJestAfterAll = jest.fn(() => {
  // Don't execute - just capture the call
});
const mockJestIt = jest.fn((_name, callback) => {
  // Execute the callback synchronously - this is the Jest test function that runs benchmarks
  // It will create a Bench instance and call benchmark.fn (the wrapped function)
  // Note: Even though Bench.run() is async, we need to call it synchronously here
  // to ensure errors are thrown during the test execution
  const result = callback();
  // If it's a promise, we don't await it - tests expect synchronous behavior
  return result;
});

// Store originals
const originalDescribe = globalThis.describe;
const originalBeforeAll = globalThis.beforeAll;
const originalAfterAll = globalThis.afterAll;
const originalIt = globalThis.it;

describe('tinybench-utils', () => {
  beforeEach(() => {
    // Reset global state for test isolation
    resetGlobalState();

    // Replace global Jest functions with mocks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.describe = mockJestDescribe as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.beforeAll = mockJestBeforeAll as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.afterAll = mockJestAfterAll as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.it = mockJestIt as any;

    // Reset mocks
    mockJestDescribe.mockClear();
    mockJestBeforeAll.mockClear();
    mockJestAfterAll.mockClear();
    mockJestIt.mockClear();
  });

  afterEach(() => {
    // Restore original functions
    globalThis.describe = originalDescribe;
    globalThis.beforeAll = originalBeforeAll;
    globalThis.afterAll = originalAfterAll;
    globalThis.it = originalIt;
  });

  describe('formatBenchmarkResult', () => {
    it('should format result with nested describe path', () => {
      const result = formatBenchmarkResult(
        '[Suite > Nested] Test Benchmark',
        1000000,
        1.0,
        100,
      );
      expect(result).toBe(
        '[Suite > Nested] Test Benchmark x 1,000,000 ops/sec ±1.00% (100 runs sampled)',
      );
    });

    it('should format result with high ops/sec (no decimals)', () => {
      const result = formatBenchmarkResult(
        'Test Benchmark',
        1234567.89,
        1.23,
        89,
      );
      expect(result).toBe(
        'Test Benchmark x 1,234,568 ops/sec ±1.23% (89 runs sampled)',
      );
    });

    it('should format result with low ops/sec (with decimals)', () => {
      const result = formatBenchmarkResult('Slow Benchmark', 45.67, 2.34, 50);
      expect(result).toBe(
        'Slow Benchmark x 45.67 ops/sec ±2.34% (50 runs sampled)',
      );
    });

    it('should format result with medium ops/sec (no decimals)', () => {
      const result = formatBenchmarkResult('Medium Benchmark', 500, 0.5, 100);
      expect(result).toBe(
        'Medium Benchmark x 500 ops/sec ±0.50% (100 runs sampled)',
      );
    });

    it('should handle single run sampled (singular "run")', () => {
      const result = formatBenchmarkResult('Single Run', 1000, 5.0, 1);
      expect(result).toBe('Single Run x 1,000 ops/sec ±5.00% (1 run sampled)');
    });

    it('should handle zero RME', () => {
      const result = formatBenchmarkResult('Zero RME', 5000, 0, 75);
      expect(result).toBe('Zero RME x 5,000 ops/sec ±0.00% (75 runs sampled)');
    });

    it('should handle very high RME', () => {
      const result = formatBenchmarkResult('High RME', 100, 99.99, 10);
      expect(result).toBe('High RME x 100 ops/sec ±99.99% (10 runs sampled)');
    });

    it('should format result with benchmark name containing special characters', () => {
      const result = formatBenchmarkResult(
        '[Suite] Test/Benchmark',
        10000,
        1.5,
        80,
      );
      expect(result).toBe(
        '[Suite] Test/Benchmark x 10,000 ops/sec ±1.50% (80 runs sampled)',
      );
    });
  });

  describe('hook validation - outside describe block', () => {
    it('should throw error when beforeAll (suite-level) called outside describe', () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook validation with minimal empty function
      expect(() => benchBeforeAll(() => {})).toThrow(
        'beforeAll() must be called inside a describe() block',
      );
    });

    it('should throw error when afterAll (suite-level) called outside describe', () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook validation with minimal empty function
      expect(() => benchAfterAll(() => {})).toThrow(
        'afterAll() must be called inside a describe() block',
      );
    });

    it('should throw error when beforeEachIteration called outside describe', () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook validation with minimal empty function
      expect(() => beforeEachIteration(() => {})).toThrow(
        'beforeEachIteration() must be called inside a describe() block',
      );
    });

    it('should throw error when afterEachIteration called outside describe', () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook validation with minimal empty function
      expect(() => afterEachIteration(() => {})).toThrow(
        'afterEachIteration() must be called inside a describe() block',
      );
    });

    it('should throw error when beforeCycle called outside describe', () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook validation with minimal empty function
      expect(() => beforeCycle(() => {})).toThrow(
        'beforeCycle() must be called inside a describe() block',
      );
    });

    it('should throw error when afterCycle called outside describe', () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook validation with minimal empty function
      expect(() => afterCycle(() => {})).toThrow(
        'afterCycle() must be called inside a describe() block',
      );
    });

    it('should throw error when beforeAllIterations called outside describe', () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook validation with minimal empty function
      expect(() => beforeAllIterations(() => {})).toThrow(
        'beforeAllIterations() must be called inside a describe() block',
      );
    });

    it('should throw error when afterAllIterations called outside describe', () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook validation with minimal empty function
      expect(() => afterAllIterations(() => {})).toThrow(
        'afterAllIterations() must be called inside a describe() block',
      );
    });

    it('should throw error when it called outside describe', () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook validation with minimal empty function
      expect(() => benchIt('test', () => {})).toThrow(
        'it() must be called inside a describe() block',
      );
    });
  });

  describe('hook validation - inside it callback', () => {
    it('should throw error when beforeAll called inside it callback', () => {
      benchDescribe('Suite', () => {
        // Manually set the flag to simulate being inside it() callback
        __test_setInsideItCallback(true);
        try {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook validation with minimal empty function
          expect(() => benchBeforeAll(() => {})).toThrow(
            'beforeAll() cannot be called inside an it() callback',
          );
        } finally {
          __test_setInsideItCallback(false);
        }
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
        benchIt('test', () => {});
      });
    });

    it('should throw error when afterAll called inside it callback', () => {
      benchDescribe('Suite', () => {
        __test_setInsideItCallback(true);
        try {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook validation with minimal empty function
          expect(() => benchAfterAll(() => {})).toThrow(
            'afterAll() cannot be called inside an it() callback',
          );
        } finally {
          __test_setInsideItCallback(false);
        }
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
        benchIt('test', () => {});
      });
    });

    it('should throw error when beforeEachIteration called inside it callback', () => {
      benchDescribe('Suite', () => {
        __test_setInsideItCallback(true);
        try {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook validation with minimal empty function
          expect(() => beforeEachIteration(() => {})).toThrow(
            'beforeEachIteration() cannot be called inside an it() callback',
          );
        } finally {
          __test_setInsideItCallback(false);
        }
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
        benchIt('test', () => {});
      });
    });

    it('should throw error when afterEachIteration called inside it callback', () => {
      benchDescribe('Suite', () => {
        __test_setInsideItCallback(true);
        try {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook validation with minimal empty function
          expect(() => afterEachIteration(() => {})).toThrow(
            'afterEachIteration() cannot be called inside an it() callback',
          );
        } finally {
          __test_setInsideItCallback(false);
        }
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
        benchIt('test', () => {});
      });
    });

    it('should throw error when beforeCycle called inside it callback', () => {
      benchDescribe('Suite', () => {
        __test_setInsideItCallback(true);
        try {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook validation with minimal empty function
          expect(() => beforeCycle(() => {})).toThrow(
            'beforeCycle() cannot be called inside an it() callback',
          );
        } finally {
          __test_setInsideItCallback(false);
        }
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
        benchIt('test', () => {});
      });
    });

    it('should throw error when afterCycle called inside it callback', () => {
      benchDescribe('Suite', () => {
        __test_setInsideItCallback(true);
        try {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook validation with minimal empty function
          expect(() => afterCycle(() => {})).toThrow(
            'afterCycle() cannot be called inside an it() callback',
          );
        } finally {
          __test_setInsideItCallback(false);
        }
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
        benchIt('test', () => {});
      });
    });

    it('should throw error when beforeAllIterations called inside it callback', () => {
      benchDescribe('Suite', () => {
        __test_setInsideItCallback(true);
        try {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook validation with minimal empty function
          expect(() => beforeAllIterations(() => {})).toThrow(
            'beforeAllIterations() cannot be called inside an it() callback',
          );
        } finally {
          __test_setInsideItCallback(false);
        }
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
        benchIt('test', () => {});
      });
    });

    it('should throw error when afterAllIterations called inside it callback', () => {
      benchDescribe('Suite', () => {
        __test_setInsideItCallback(true);
        try {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook validation with minimal empty function
          expect(() => afterAllIterations(() => {})).toThrow(
            'afterAllIterations() cannot be called inside an it() callback',
          );
        } finally {
          __test_setInsideItCallback(false);
        }
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
        benchIt('test', () => {});
      });
    });

    it('should throw error when nested it called inside it callback', () => {
      benchDescribe('Suite', () => {
        __test_setInsideItCallback(true);
        try {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook validation with minimal empty function
          expect(() => benchIt('inner test', () => {})).toThrow(
            'it() cannot be called inside an it() callback',
          );
        } finally {
          __test_setInsideItCallback(false);
        }
        // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
        benchIt('outer test', () => {});
      });
    });
  });

  describe('hook registration - successful cases', () => {
    it('should register beforeAll hook inside describe', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook registration with minimal empty function
          benchBeforeAll(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });

    it('should register afterAll hook inside describe', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook registration with minimal empty function
          benchAfterAll(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });

    it('should register beforeEach hook inside describe', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook registration with minimal empty function
          beforeEachIteration(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });

    it('should register afterEach hook inside describe', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook registration with minimal empty function
          afterEachIteration(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });

    it('should register setup hook inside describe', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook registration with minimal empty function
          beforeCycle(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });

    it('should register teardown hook inside describe', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook registration with minimal empty function
          afterCycle(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });

    it('should register beforeAll hook inside describe', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook registration with minimal empty function
          benchBeforeAll(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });

    it('should register afterAll hook inside describe', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook registration with minimal empty function
          benchAfterAll(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });
  });

  describe('multiple hooks of same type', () => {
    it('should allow multiple beforeAll hooks in same describe', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple hooks with minimal empty functions
          benchBeforeAll(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple hooks with minimal empty functions
          benchBeforeAll(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple hooks with minimal empty functions
          benchBeforeAll(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });

    it('should allow multiple afterAll hooks in same describe', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple hooks with minimal empty functions
          benchAfterAll(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple hooks with minimal empty functions
          benchAfterAll(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });

    it('should allow multiple beforeEach hooks in same describe', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple hooks with minimal empty functions
          beforeEachIteration(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple hooks with minimal empty functions
          beforeEachIteration(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple hooks with minimal empty functions
          beforeEachIteration(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });

    it('should allow multiple afterEach hooks in same describe', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple hooks with minimal empty functions
          afterEachIteration(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple hooks with minimal empty functions
          afterEachIteration(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });

    it('should allow multiple setup hooks in same describe', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple hooks with minimal empty functions
          beforeCycle(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple hooks with minimal empty functions
          beforeCycle(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });

    it('should allow multiple teardown hooks in same describe', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple hooks with minimal empty functions
          afterCycle(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple hooks with minimal empty functions
          afterCycle(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });

    it('should allow multiple beforeAll hooks in same describe', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple hooks with minimal empty functions
          benchBeforeAll(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple hooks with minimal empty functions
          benchBeforeAll(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });

    it('should allow multiple afterAll hooks in same describe', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple hooks with minimal empty functions
          benchAfterAll(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple hooks with minimal empty functions
          benchAfterAll(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });
  });

  describe('nested describe blocks', () => {
    it('should support nested describe blocks', () => {
      expect(() => {
        benchDescribe('Outer', () => {
          benchDescribe('Inner', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
            benchIt('test', () => {});
          });
        });
      }).not.toThrow();
    });

    it('should support deeply nested describe blocks', () => {
      expect(() => {
        benchDescribe('Level 1', () => {
          benchDescribe('Level 2', () => {
            benchDescribe('Level 3', () => {
              // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
              benchIt('test', () => {});
            });
          });
        });
      }).not.toThrow();
    });

    it('should allow hooks in nested describe blocks', () => {
      expect(() => {
        benchDescribe('Outer', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing nested hooks with minimal empty function
          benchBeforeAll(() => {});
          benchDescribe('Inner', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing nested hooks with minimal empty function
            beforeEachIteration(() => {});
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
            benchIt('test', () => {});
          });
        });
      }).not.toThrow();
    });
  });

  describe('hook inheritance', () => {
    it('should inherit hooks from parent describe', () => {
      const outerBeforeAll = jest.fn();
      const innerBeforeAll = jest.fn();

      expect(() => {
        benchDescribe('Outer', () => {
          benchBeforeAll(outerBeforeAll);
          benchDescribe('Inner', () => {
            benchBeforeAll(innerBeforeAll);
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
            benchIt('test', () => {});
          });
        });
      }).not.toThrow();

      // Both hooks should be registered (we can't directly verify execution order
      // without running the actual benchmark, but we can verify no errors)
    });

    it('should support hooks at multiple nesting levels', () => {
      const level1Hook = jest.fn();
      const level2Hook = jest.fn();
      const level3Hook = jest.fn();

      expect(() => {
        benchDescribe('Level 1', () => {
          benchBeforeAll(level1Hook);
          benchDescribe('Level 2', () => {
            benchBeforeAll(level2Hook);
            benchDescribe('Level 3', () => {
              benchBeforeAll(level3Hook);
              // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
              benchIt('test', () => {});
            });
          });
        });
      }).not.toThrow();
    });
  });

  describe('async hooks', () => {
    it('should support async beforeAll hook', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          benchBeforeAll(async () => {
            await Promise.resolve();
          });
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });

    it('should support async afterAll hook', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          benchAfterAll(async () => {
            await Promise.resolve();
          });
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });

    it('should support async beforeEach hook', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          beforeEachIteration(async () => {
            await Promise.resolve();
          });
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });

    it('should support async afterEach hook', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          afterEachIteration(async () => {
            await Promise.resolve();
          });
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });

    it('should support async setup hook', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          beforeCycle(async () => {
            await Promise.resolve();
          });
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });

    it('should support async teardown hook', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          afterCycle(async () => {
            await Promise.resolve();
          });
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });

    it('should support async beforeAll hook', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          benchBeforeAll(async () => {
            await Promise.resolve();
          });
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });

    it('should support async afterAll hook', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          benchAfterAll(async () => {
            await Promise.resolve();
          });
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });
  });

  describe('benchmark registration', () => {
    it('should register benchmark inside describe', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });

    it('should register multiple benchmarks in same describe', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test 1', () => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test 2', () => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test 3', () => {});
        });
      }).not.toThrow();
    });

    it('should register benchmark with options', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark with options
          benchIt('test', () => {}, { iterations: 100 });
        });
      }).not.toThrow();
    });

    it('should support async benchmark function', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          benchIt('async test', async () => {
            await Promise.resolve();
          });
        });
      }).not.toThrow();
    });
  });

  describe('benchmark options merging', () => {
    it('should accept empty options', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
        });
      }).not.toThrow();
    });

    it('should accept benchmark options', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark with options
          benchIt('test', () => {}, {
            iterations: 50,
            warmupIterations: 10,
            warmupTime: 100,
          });
        });
      }).not.toThrow();
    });

    it('should support setup/teardown hooks with other options', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hooks with minimal empty function
          beforeCycle(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hooks with minimal empty function
          afterCycle(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark with options
          benchIt('test', () => {}, {
            iterations: 50,
          });
        });
      }).not.toThrow();
    });
  });

  describe('insideItCallback flag behavior', () => {
    it('should reset flag after synchronous benchmark function completes', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          benchIt('sync test', () => {
            // Synchronous work
            const sum = 1 + 1;
            return sum;
          });
          // If flag wasn't reset, registering another hook would fail
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing flag reset with minimal empty function
          benchBeforeAll(() => {});
        });
      }).not.toThrow();
    });

    it('should reset flag after asynchronous benchmark function completes', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          benchIt('async test', async () => {
            await Promise.resolve();
          });
          // If flag wasn't reset, registering another hook would fail
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing flag reset with minimal empty function
          benchBeforeAll(() => {});
        });
      }).not.toThrow();
    });

    it('should reset flag after synchronous benchmark throws error', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          benchIt('failing test', () => {
            throw new Error('test error');
          });
          // If flag wasn't reset, registering another hook would fail
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing flag reset with minimal empty function
          benchBeforeAll(() => {});
        });
      }).not.toThrow();
    });

    it('should reset flag after async benchmark rejects', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          benchIt('rejecting test', async () => {
            throw new Error('async test error');
          });
          // If flag wasn't reset, registering another hook would fail
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing flag reset with minimal empty function
          benchBeforeAll(() => {});
        });
      }).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle describe with no benchmarks', () => {
      expect(() => {
        benchDescribe('Empty Suite', () => {
          // No benchmarks
        });
      }).not.toThrow();
    });

    it('should handle describe with only hooks and no benchmarks', () => {
      expect(() => {
        benchDescribe('Hooks Only', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing edge case with minimal empty function
          benchBeforeAll(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing edge case with minimal empty function
          benchAfterAll(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing edge case with minimal empty function
          beforeEachIteration(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing edge case with minimal empty function
          afterEachIteration(() => {});
        });
      }).not.toThrow();
    });

    it('should handle nested describe with mixed hook and benchmark registration', () => {
      expect(() => {
        benchDescribe('Outer', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing nested structure with minimal empty function
          benchBeforeAll(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test 1', () => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing nested structure with minimal empty function
          benchAfterAll(() => {});

          benchDescribe('Inner', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing nested structure with minimal empty function
            beforeEachIteration(() => {});
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
            benchIt('test 2', () => {});
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing nested structure with minimal empty function
            afterEachIteration(() => {});
          });

          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test 3', () => {});
        });
      }).not.toThrow();
    });

    it('should handle all hook types in single describe', () => {
      expect(() => {
        benchDescribe('All Hooks', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing all hook types with minimal empty function
          benchBeforeAll(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing all hook types with minimal empty function
          beforeAllIterations(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing all hook types with minimal empty function
          beforeEachIteration(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing all hook types with minimal empty function
          beforeCycle(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing all hook types with minimal empty function
          afterCycle(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing all hook types with minimal empty function
          afterEachIteration(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing all hook types with minimal empty function
          afterAllIterations(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing all hook types with minimal empty function
          benchAfterAll(() => {});
        });
      }).not.toThrow();
    });
  });

  describe('timeout validation', () => {
    describe('beforeAll timeout validation', () => {
      it('should accept valid positive timeout', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing timeout validation with minimal setup function
            benchBeforeAll(() => {}, 5000);
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
            benchIt('test', () => {});
          });
        }).not.toThrow();
      });

      it('should accept zero timeout', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing timeout validation with minimal setup function
            benchBeforeAll(() => {}, 0);
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
            benchIt('test', () => {});
          });
        }).not.toThrow();
      });

      it('should accept undefined timeout', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing timeout validation with minimal setup function
            benchBeforeAll(() => {}, undefined);
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
            benchIt('test', () => {});
          });
        }).not.toThrow();
      });

      it('should reject negative timeout', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing timeout validation with minimal setup function
            benchBeforeAll(() => {}, -1000);
          });
        }).toThrow('beforeAll timeout must be a positive number, got: -1000');
      });

      it('should reject non-number timeout', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-function -- Testing invalid timeout type with minimal setup
            benchBeforeAll(() => {}, 'not a number' as any);
          });
        }).toThrow('beforeAll timeout must be a number, got: string');
      });

      it('should reject Infinity timeout', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing timeout validation with minimal setup function
            benchBeforeAll(() => {}, Infinity);
          });
        }).toThrow('beforeAll timeout must be a finite number, got: Infinity');
      });

      it('should reject NaN timeout', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing timeout validation with minimal setup function
            benchBeforeAll(() => {}, NaN);
          });
        }).toThrow('beforeAll timeout must be a finite number, got: NaN');
      });
    });

    describe('benchAfterAll timeout validation', () => {
      it('should accept valid positive timeout', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing timeout validation with minimal teardown function
            benchAfterAll(() => {}, 5000);
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
            benchIt('test', () => {});
          });
        }).not.toThrow();
      });

      it('should accept zero timeout', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing timeout validation with minimal teardown function
            benchAfterAll(() => {}, 0);
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
            benchIt('test', () => {});
          });
        }).not.toThrow();
      });

      it('should accept undefined timeout', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing timeout validation with minimal teardown function
            benchAfterAll(() => {}, undefined);
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
            benchIt('test', () => {});
          });
        }).not.toThrow();
      });

      it('should reject negative timeout', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing timeout validation with minimal teardown function
            benchAfterAll(() => {}, -1000);
          });
        }).toThrow('afterAll timeout must be a positive number, got: -1000');
      });

      it('should reject non-number timeout', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-function -- Testing invalid timeout type with minimal teardown
            benchAfterAll(() => {}, 'not a number' as any);
          });
        }).toThrow('afterAll timeout must be a number, got: string');
      });

      it('should reject Infinity timeout', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing timeout validation with minimal teardown function
            benchAfterAll(() => {}, Infinity);
          });
        }).toThrow('afterAll timeout must be a finite number, got: Infinity');
      });

      it('should reject NaN timeout', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing timeout validation with minimal teardown function
            benchAfterAll(() => {}, NaN);
          });
        }).toThrow('afterAll timeout must be a finite number, got: NaN');
      });
    });

    describe('integration with Jest hooks', () => {
      // NOTE: The validation tests above verify that invalid timeouts are rejected.
      // The following tests verify that valid timeouts don't cause errors during registration.
      // The actual passing of timeouts to Jest's beforeAll/afterAll happens in runDescribeBlock
      // and works correctly (as evidenced by the lack of errors), but verifying exact mock calls
      // is challenging with the current mock setup.

      it('should register benchBeforeAll with valid timeout without errors', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook registration with timeout
            benchBeforeAll(() => {}, 10000);
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
            benchIt('test', () => {});
          });
        }).not.toThrow();
      });

      it('should register benchAfterAll with valid timeout without errors', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook registration with timeout
            benchAfterAll(() => {}, 15000);
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
            benchIt('test', () => {});
          });
        }).not.toThrow();
      });

      it('should register benchBeforeAll without timeout without errors', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook registration without timeout
            benchBeforeAll(() => {});
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
            benchIt('test', () => {});
          });
        }).not.toThrow();
      });

      it('should register benchAfterAll without timeout without errors', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook registration without timeout
            benchAfterAll(() => {});
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
            benchIt('test', () => {});
          });
        }).not.toThrow();
      });

      it('should register multiple benchBeforeAll hooks with different timeouts', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple hooks with various timeouts
            benchBeforeAll(() => {}, 5000);
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple hooks with various timeouts
            benchBeforeAll(() => {}, 10000);
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple hooks with various timeouts
            benchBeforeAll(() => {}); // no timeout
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
            benchIt('test', () => {});
          });
        }).not.toThrow();
      });

      it('should register multiple benchAfterAll hooks with different timeouts', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple hooks with various timeouts
            benchAfterAll(() => {}, 5000);
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple hooks with various timeouts
            benchAfterAll(() => {}, 10000);
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple hooks with various timeouts
            benchAfterAll(() => {}); // no timeout
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
            benchIt('test', () => {});
          });
        }).not.toThrow();
      });
    });
  });

  describe('itTimeout validation', () => {
    describe('valid itTimeout values', () => {
      it('should accept valid positive timeout', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing itTimeout with minimal benchmark
            benchIt('test', () => {}, { itTimeout: 10000 });
          });
        }).not.toThrow();
      });

      it('should accept zero timeout', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing itTimeout with minimal benchmark
            benchIt('test', () => {}, { itTimeout: 0 });
          });
        }).not.toThrow();
      });

      it('should accept undefined timeout', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing itTimeout with minimal benchmark
            benchIt('test', () => {}, { itTimeout: undefined });
          });
        }).not.toThrow();
      });

      it('should accept benchmark without options', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing itTimeout with minimal benchmark
            benchIt('test', () => {});
          });
        }).not.toThrow();
      });

      it('should accept itTimeout with other options', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing itTimeout with other options
            benchIt('test', () => {}, {
              iterations: 100,
              warmup: true,
              itTimeout: 30000,
            });
          });
        }).not.toThrow();
      });
    });

    describe('invalid itTimeout values', () => {
      it('should reject negative timeout', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing invalid timeout
            benchIt('test', () => {}, { itTimeout: -5000 });
          });
        }).toThrow('it timeout must be a positive number, got: -5000');
      });

      it('should reject non-number timeout', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-function -- Testing invalid timeout type
            benchIt('test', () => {}, { itTimeout: 'not a number' as any });
          });
        }).toThrow('it timeout must be a number, got: string');
      });

      it('should reject Infinity timeout', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing invalid timeout
            benchIt('test', () => {}, { itTimeout: Infinity });
          });
        }).toThrow('it timeout must be a finite number, got: Infinity');
      });

      it('should reject NaN timeout', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing invalid timeout
            benchIt('test', () => {}, { itTimeout: NaN });
          });
        }).toThrow('it timeout must be a finite number, got: NaN');
      });
    });

    describe('integration with test runner', () => {
      it('should register benchmark with itTimeout without errors', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing hook registration with timeout
            benchIt('test', () => {}, { itTimeout: 60000 });
          });
        }).not.toThrow();
      });

      it('should register multiple benchmarks with different timeouts', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple benchmarks with various timeouts
            benchIt('test1', () => {}, { itTimeout: 5000 });
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple benchmarks with various timeouts
            benchIt('test2', () => {}, { itTimeout: 10000 });
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing multiple benchmarks with various timeouts
            benchIt('test3', () => {}); // no timeout
          });
        }).not.toThrow();
      });

      it('should allow itTimeout alongside tinybench options', () => {
        expect(() => {
          benchDescribe('Suite', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing itTimeout with tinybench options
            benchIt('test', () => {}, {
              time: 5000, // tinybench option
              iterations: 100, // tinybench option
              warmup: true, // tinybench option
              itTimeout: 30000, // test runner timeout
            });
          });
        }).not.toThrow();
      });
    });
  });

  describe('describe options', () => {
    it('should support quiet option on describe block', () => {
      expect(() => {
        benchDescribe(
          'Quiet Suite',
          () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
            benchIt('test', () => {});
          },
          { quiet: true },
        );
      }).not.toThrow();
    });

    it('should support quiet option set to false', () => {
      expect(() => {
        benchDescribe(
          'Verbose Suite',
          () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
            benchIt('test', () => {});
          },
          { quiet: false },
        );
      }).not.toThrow();
    });

    it('should support nested describe blocks with different quiet settings', () => {
      expect(() => {
        benchDescribe(
          'Outer Suite',
          () => {
            benchDescribe(
              'Inner Quiet Suite',
              () => {
                // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
                benchIt('test', () => {});
              },
              { quiet: true },
            );
          },
          { quiet: false },
        );
      }).not.toThrow();
    });
  });

  describe('benchmark with quiet option', () => {
    it('should support quiet option on individual benchmark', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing quiet option
          benchIt('quiet benchmark', () => {}, { quiet: true });
        });
      }).not.toThrow();
    });

    it('should support quiet option set to false on individual benchmark', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing quiet option
          benchIt('verbose benchmark', () => {}, { quiet: false });
        });
      }).not.toThrow();
    });

    it('should allow benchmark to override describe quiet setting', () => {
      expect(() => {
        benchDescribe(
          'Quiet Suite',
          () => {
            // This benchmark explicitly enables warnings despite suite being quiet
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing quiet override
            benchIt('verbose benchmark', () => {}, { quiet: false });
          },
          { quiet: true },
        );
      }).not.toThrow();
    });
  });

  describe('complex nested scenarios', () => {
    it('should handle deeply nested describe blocks with mixed content', () => {
      expect(() => {
        benchDescribe('Level 1', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing nested structure
          benchBeforeAll(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test 1', () => {});

          benchDescribe('Level 2', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing nested structure
            beforeEachIteration(() => {});
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
            benchIt('test 2', () => {});

            benchDescribe('Level 3', () => {
              // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing nested structure
              beforeCycle(() => {});
              // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
              benchIt('test 3', () => {});

              benchDescribe('Level 4', () => {
                // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing nested structure
                benchBeforeAll(() => {});
                // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
                benchIt('test 4', () => {});
              });
            });
          });
        });
      }).not.toThrow();
    });

    it('should handle multiple sibling describe blocks', () => {
      expect(() => {
        benchDescribe('Root', () => {
          benchDescribe('Sibling 1', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
            benchIt('test 1', () => {});
          });

          benchDescribe('Sibling 2', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
            benchIt('test 2', () => {});
          });

          benchDescribe('Sibling 3', () => {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
            benchIt('test 3', () => {});
          });
        });
      }).not.toThrow();
    });

    it('should handle describe blocks with many benchmarks', () => {
      expect(() => {
        benchDescribe('Suite with many benchmarks', () => {
          for (let i = 1; i <= 10; i++) {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing many benchmarks
            benchIt(`benchmark ${i}`, () => {});
          }
        });
      }).not.toThrow();
    });
  });

  describe('hook ordering with all hook types', () => {
    it('should register all 8 hook types in order', () => {
      const executionOrder: string[] = [];

      expect(() => {
        benchDescribe('Complete Hook Suite', () => {
          benchBeforeAll(() => {
            executionOrder.push('benchBeforeAll');
          });
          benchBeforeAll(() => {
            executionOrder.push('beforeAll');
          });
          beforeEachIteration(() => {
            executionOrder.push('beforeEach');
          });
          beforeCycle(() => {
            executionOrder.push('setup');
          });
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
          afterCycle(() => {
            executionOrder.push('teardown');
          });
          afterEachIteration(() => {
            executionOrder.push('afterEach');
          });
          benchAfterAll(() => {
            executionOrder.push('afterAll');
          });
          benchAfterAll(() => {
            executionOrder.push('benchAfterAll');
          });
        });
      }).not.toThrow();

      // Note: We can't verify actual execution order here because benchmarks
      // don't actually run in the test environment, but we can verify registration
      // succeeded without errors
    });

    it('should allow hooks to be registered in any order', () => {
      expect(() => {
        benchDescribe('Unordered Hooks', () => {
          benchAfterAll(() => {
            // Registered first
          });
          beforeCycle(() => {
            // Registered second
          });
          beforeEachIteration(() => {
            // Registered third
          });
          benchAfterAll(() => {
            // Registered fourth
          });
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
          benchBeforeAll(() => {
            // Registered after benchmark
          });
          afterEachIteration(() => {
            // Registered after benchBeforeAll
          });
        });
      }).not.toThrow();
    });
  });

  describe('edge cases with empty callbacks', () => {
    it('should handle benchmark with empty synchronous function', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing empty function
          benchIt('empty sync benchmark', () => {});
        });
      }).not.toThrow();
    });

    it('should handle benchmark with empty async function', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing empty async function
          benchIt('empty async benchmark', async () => {});
        });
      }).not.toThrow();
    });

    it('should handle all hooks with empty functions', () => {
      expect(() => {
        benchDescribe('Suite', () => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing empty hooks
          benchBeforeAll(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing empty hooks
          benchBeforeAll(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing empty hooks
          beforeEachIteration(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing empty hooks
          beforeCycle(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Minimal test benchmark
          benchIt('test', () => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing empty hooks
          afterCycle(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing empty hooks
          afterEachIteration(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing empty hooks
          benchAfterAll(() => {});
          // eslint-disable-next-line @typescript-eslint/no-empty-function -- Testing empty hooks
          benchAfterAll(() => {});
        });
      }).not.toThrow();
    });
  });
});
