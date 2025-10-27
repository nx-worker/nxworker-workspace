import { benchmarkSuite } from '../../../../../../tools/tinybench-utils';

// Example 1: Suite-level factory for shared scope
benchmarkSuite('Suite-level Factory Example', () => {
  // Shared scope for all benchmarks
  let sharedCounter = 0;
  let sharedArray: number[] = [];

  return {
    benchmarks: {
      'Increment shared counter': () => {
        sharedCounter++;
      },

      'Array push': {
        fn: () => {
          sharedArray.push(sharedCounter);
        },
        fnOptions: {
          beforeEach: () => {
            sharedArray = [];
          },
        },
      },
    },
    setupSuite: () => {
      sharedCounter = 0;
      sharedArray = [];
    },
    teardownSuite: () => {
      // Cleanup if needed
      sharedCounter = 0;
      sharedArray = [];
    },
  };
});

// Example 2: Benchmark-level factory for per-benchmark scope
benchmarkSuite('Benchmark-level Factory Example', {
  'Factory returning config': () => {
    let localCounter = 0;

    return {
      fn: () => {
        localCounter++;
        // Use the counter (even if just for the benchmark)
        return localCounter;
      },
      fnOptions: {
        beforeAll: () => {
          localCounter = 0;
        },
      },
    };
  },

  'Factory returning function': () => {
    let items: string[] = [];

    return () => {
      items.push('item');
      items = items.slice(-10); // Keep last 10
    };
  },

  'Regular benchmark (backward compatible)': () => {
    const result = Math.random() * 100;
    return result;
  },
});

// Example 3: Nested factories (both suite and benchmark level)
benchmarkSuite('Nested Factory Example', () => {
  let suiteState: { count: number; data: string[] };

  return {
    benchmarks: {
      'Nested factory benchmark': () => {
        let benchmarkLocal = 0;

        return {
          fn: () => {
            benchmarkLocal++;
            suiteState.count++;
            suiteState.data.push(`item-${benchmarkLocal}`);
          },
          fnOptions: {
            beforeEach: () => {
              benchmarkLocal = 0;
              suiteState.data = [];
            },
          },
        };
      },

      'Simple benchmark in factory suite': () => {
        suiteState.count++;
      },
    },
    setupSuite: () => {
      suiteState = { count: 0, data: [] };
    },
  };
});
